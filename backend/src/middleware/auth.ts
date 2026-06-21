import type { NextFunction, Request, Response } from 'express';
import type { User } from '@supabase/supabase-js';
import { getUserFromToken } from '../lib/supabase.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/**
 * Requires a valid Supabase access token in `Authorization: Bearer <jwt>`.
 * Attaches the verified user to `req.user`. The token is verified against
 * Supabase Auth on every request — we never trust a client-supplied user id.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);

  if (!match) {
    return res.status(401).json({ error: 'Unauthorized', code: 'NO_TOKEN' });
  }

  const user = await getUserFromToken(match[1]!.trim());
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized', code: 'INVALID_TOKEN' });
  }

  req.user = user;
  next();
}
