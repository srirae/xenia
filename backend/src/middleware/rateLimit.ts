import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

/**
 * Per-user limiter for the expensive /api/analyze route: 10 requests / 60s.
 * Keyed by the authenticated user id (falls back to IP if unauthenticated,
 * though requireAuth runs first so a user is always present here).
 */
export const analyzeRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.id ?? req.ip ?? 'anonymous',
  handler: (_req, res) => {
    res.setHeader('Retry-After', '60');
    res.status(429).json({
      error: "You're scanning too fast — wait a moment and try again.",
      code: 'RATE_LIMITED',
    });
  },
});

/** Coarse global limiter to blunt blunt-force abuse on all other routes. */
export const globalRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});
