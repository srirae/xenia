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
  // BYOK: the user's own OpenRouter key, used transiently for this one request
  // and never stored. Validated to a sane shape; empty/absent means "no BYOK".
  byokKey: z
    .string()
    .trim()
    .regex(/^sk-or-[A-Za-z0-9._-]{8,}$/, 'Invalid OpenRouter key format.')
    .optional()
    .or(z.literal('')),
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
    const byokKey = parsed.data.byokKey?.trim() || '';
    const hasByok = byokKey.length > 0;
    const modelConfig = MODEL_REGISTRY[chosenModel];
    const isPaidModel = modelConfig.gateway !== 'nvidia';

    // ── Fetch profile (service role; we only read here) ─────────────────────
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('tier, virtual_balance')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'User profile not found.' });
    }

    const isPaidTier = profile.tier === 'paid';
    const balance = Number(profile.virtual_balance);
    // Paid features unlock via credits OR the user's own key.
    const paidAccess = isPaidTier || hasByok;

    // ── Gate: a paid model needs either BYOK or a positive credit balance ────
    if (isPaidModel && !hasByok) {
      if (!isPaidTier || !(balance > 0)) {
        // Idempotently reset tier so future calls short-circuit here.
        if (isPaidTier) await supabaseAdmin.rpc('deduct_balance', { uid: user.id, amount: 0 });
        return res.status(402).json({
          error: 'This model needs credits or your own API key.',
          code: 'CREDITS_EXHAUSTED',
        });
      }
    }

    // ── Vision call ──────────────────────────────────────────────────────────
    // BYOK only applies to OpenRouter (paid) models; NIM is always our free key.
    const { text, usage } = await runVisionScan(
      modelConfig,
      base64Image,
      isPaidModel && hasByok ? byokKey : undefined,
    );
    const report = parseReport(text);
    const riskLevel = typeof report.risk_level === 'string' ? (report.risk_level as string) : null;

    // ── Cost: free model = $0; BYOK = $0 (user pays their provider); else bill ─
    const scanCost =
      !isPaidModel || hasByok
        ? 0
        : calculateScanCost(chosenModel, usage.prompt_tokens, usage.completion_tokens);

    let remainingBalance: number | null = isPaidTier ? balance : null;
    let creditsExhausted = false;

    if (scanCost > 0) {
      const { data: newBalanceRaw, error: deductError } = await supabaseAdmin.rpc('deduct_balance', {
        uid: user.id,
        amount: scanCost,
      });
      if (deductError) {
        // eslint-disable-next-line no-console
        console.error('deduct_balance failed:', deductError);
        return res.status(500).json({ error: 'Failed to settle scan cost.' });
      }
      remainingBalance = Number(newBalanceRaw ?? Math.max(0, balance - scanCost));
      creditsExhausted = remainingBalance <= 0;
    }

    // ── Log history for anyone with paid access (credits or BYOK) ─────────────
    if (paidAccess) {
      await supabaseAdmin.from('scans').insert({
        user_id: user.id,
        model_used: chosenModel,
        tokens_input: usage.prompt_tokens,
        tokens_output: usage.completion_tokens,
        cost_deducted: scanCost,
        risk_level: riskLevel,
        tier_at_scan: hasByok && !isPaidTier ? 'byok' : profile.tier,
      });
    }

    return res.json({
      tier: profile.tier,
      byok: hasByok,
      report,
      cost_deducted: scanCost,
      remaining_balance: remainingBalance,
      credits_exhausted: creditsExhausted,
      gated: {
        save_history: paidAccess,
        download_redacted: paidAccess,
        model_switcher: paidAccess,
      },
      ...(creditsExhausted && { code: 'CREDITS_EXHAUSTED' }),
    });
  }),
);
