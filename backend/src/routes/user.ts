import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { publicModelCatalog } from '../lib/models.js';

export const userRouter = Router();

/** GET /api/user/balance — real-time tier + balance for the header/UI. */
userRouter.get(
  '/balance',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.user!;
    const { data } = await supabaseAdmin
      .from('profiles')
      .select('tier, virtual_balance, display_name, email')
      .eq('id', user.id)
      .single();

    res.json({
      tier: data?.tier ?? 'free',
      balance: Number(data?.virtual_balance ?? 0),
      display_name: data?.display_name ?? null,
      email: data?.email ?? user.email ?? null,
    });
  }),
);

/** GET /api/user/history — paid-tier scan history (most recent first). */
const HistoryQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

userRouter.get(
  '/history',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.user!;
    const { limit } = HistoryQuery.parse(req.query);

    const { data, error } = await supabaseAdmin
      .from('scans')
      .select('id, model_used, tokens_input, tokens_output, cost_deducted, risk_level, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return res.status(500).json({ error: 'Could not load scan history.' });
    res.json({ scans: data ?? [] });
  }),
);

/** GET /api/user/models — price-only catalog, safe for the billing page. */
userRouter.get('/models', (_req, res) => {
  res.json({ models: publicModelCatalog() });
});
