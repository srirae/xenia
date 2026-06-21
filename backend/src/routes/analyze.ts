import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { analyzeRateLimiter } from '../middleware/rateLimit.js';
import { asyncHandler } from '../middleware/error.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { MODEL_REGISTRY, isModelId, DEFAULT_MODEL_ID } from '../lib/models.js';
import { calculateScanCost } from '../lib/billing.js';
import { runVisionScan, parseReport } from '../services/vision.js';

export const analyzeRouter = Router();

// Reject anything that isn't an allowed model id up front (Zod refine), and
// cap the base64 payload so we don't accept arbitrarily large blobs.
// ~18MB of base64 ≈ a generous high-res JPEG ceiling.
const MAX_BASE64_LEN = 18_000_000;

const BodySchema = z.object({
  base64Image: z
    .string()
    .min(1, 'No image provided.')
    .max(MAX_BASE64_LEN, 'Image too large.')
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Image must be raw base64 (no data URL prefix).'),
  chosenModel: z
    .string()
    .default(DEFAULT_MODEL_ID)
    .refine(isModelId, 'Invalid model selection.'),
});

/**
 * POST /api/analyze — the credit gatekeeper.
 *
 *   Gate 1  authenticated?            (requireAuth)
 *   Gate 2  paid tier AND balance>0?  (free → metadata-only response;
 *                                       paid+$0 → 402 CREDITS_EXHAUSTED)
 *   Gate 3  model in allow-list?      (Zod refine → 400)
 *   then    call vision API → deduct exact cost atomically → log history
 */
analyzeRouter.post(
  '/',
  requireAuth,
  analyzeRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.user!;

    // ── Validate body ──────────────────────────────────────────────────────
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return res.status(400).json({ error: first?.message ?? 'Invalid request.' });
    }
    const { base64Image, chosenModel } = parsed.data;
    const modelConfig = MODEL_REGISTRY[chosenModel];

    // ── Fetch profile (service role; we only read here) ─────────────────────
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('tier, virtual_balance')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'User profile not found.' });
    }

    // ── FREE TIER PATH ──────────────────────────────────────────────────────
    // The metadata strip already happened in the browser. Free users still get
    // the full NIM visual scan (the spec gates the *output*, not the scan), but
    // a free user may only use the free NIM model and nothing is billed/saved.
    if (profile.tier === 'free') {
      if (modelConfig.tier !== 'free') {
        return res.status(402).json({
          error: 'This model requires credits. Add credits to unlock paid models.',
          code: 'CREDITS_EXHAUSTED',
        });
      }

      const { text } = await runVisionScan(modelConfig, base64Image);
      const report = parseReport(text);

      return res.json({
        tier: 'free',
        report,
        cost_deducted: 0,
        remaining_balance: null,
        // Free tier is told it cannot save history / download redacted image;
        // the frontend enforces the download gate.
        gated: { save_history: false, download_redacted: false, model_switcher: false },
      });
    }

    // ── PAID TIER: balance check ─────────────────────────────────────────────
    const balance = Number(profile.virtual_balance);
    if (!(balance > 0)) {
      // Idempotently reset tier so future calls short-circuit here.
      await supabaseAdmin.rpc('deduct_balance', { uid: user.id, amount: 0 });
      return res.status(402).json({
        error: 'Insufficient credits. Scan blocked.',
        code: 'CREDITS_EXHAUSTED',
      });
    }

    // ── Vision call ───────────────────────────────────────────────────────────
    const { text, usage } = await runVisionScan(modelConfig, base64Image);
    const report = parseReport(text);

    // ── Cost + atomic deduction ───────────────────────────────────────────────
    const scanCost =
      modelConfig.gateway === 'nvidia'
        ? 0
        : calculateScanCost(chosenModel, usage.prompt_tokens, usage.completion_tokens);

    const { data: newBalanceRaw, error: deductError } = await supabaseAdmin.rpc(
      'deduct_balance',
      { uid: user.id, amount: scanCost },
    );
    if (deductError) {
      // eslint-disable-next-line no-console
      console.error('deduct_balance failed:', deductError);
      return res.status(500).json({ error: 'Failed to settle scan cost.' });
    }

    const remainingBalance = Number(newBalanceRaw ?? Math.max(0, balance - scanCost));
    const creditsExhausted = remainingBalance <= 0;

    // ── Log history (service role; browser can never write scans) ─────────────
    const riskLevel =
      typeof report.risk_level === 'string' ? (report.risk_level as string) : null;
    await supabaseAdmin.from('scans').insert({
      user_id: user.id,
      model_used: chosenModel,
      tokens_input: usage.prompt_tokens,
      tokens_output: usage.completion_tokens,
      cost_deducted: scanCost,
      risk_level: riskLevel,
      tier_at_scan: 'paid',
    });

    return res.json({
      tier: 'paid',
      report,
      cost_deducted: scanCost,
      remaining_balance: remainingBalance,
      credits_exhausted: creditsExhausted,
      gated: { save_history: true, download_redacted: true, model_switcher: true },
      ...(creditsExhausted && { code: 'CREDITS_EXHAUSTED' }),
    });
  }),
);
