import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

/**
 * Service-role client. Bypasses RLS — use ONLY on the server for trusted
 * operations (crediting balances, writing scan history, webhook provisioning).
 * Never expose this client or its key to the browser.
 */
export const supabaseAdmin: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false },
  },
);

/**
 * Verifies a user access token (the JWT minted by Supabase Auth in the
 * browser) and returns the authenticated user, or null. Uses the anon key so
 * the token — not a privileged key — is what authorises the lookup.
 */
export async function getUserFromToken(accessToken: string) {
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return data.user;
}
