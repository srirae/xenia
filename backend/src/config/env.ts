import 'dotenv/config';
import { z } from 'zod';

/**
 * Centralised, validated environment. We fail fast at boot if a required
 * secret is missing or malformed — never silently run with a half-configured
 * payment/credential surface.
 */
const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  CORS_ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((s) =>
      s
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),

  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  NVIDIA_NIM_API_KEY: z.string().min(1),
  OPENROUTER_API_KEY: z.string().min(1),

  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  STRIPE_PRICE_ID: z.string().min(1),
  CREDITS_GRANTED_USD: z.coerce.number().positive().default(5.0),

  APP_URL: z.string().url().default('http://localhost:3000'),
  SUPPORT_EMAIL: z.string().email().default('aegiswheil@gmail.com'),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  // Print which keys are wrong without leaking their values.
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  // eslint-disable-next-line no-console
  console.error(`\n✗ Invalid backend environment:\n${issues}\n`);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
