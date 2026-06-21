import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env, isProd } from './config/env.js';
import { globalRateLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFound } from './middleware/error.js';
import { analyzeRouter } from './routes/analyze.js';
import { userRouter } from './routes/user.js';
import { stripeRouter, stripeWebhookHandler } from './routes/stripe.js';

const app = express();

// Behind a proxy/load balancer (Render, Fly, Nginx) so rate-limit sees real IPs.
app.set('trust proxy', 1);

// Security headers. This is a JSON API, so a strict baseline is fine.
app.use(helmet());

// CORS allow-list — only our frontend origins may call the API with creds.
app.use(
  cors({
    origin(origin, cb) {
      // Allow same-origin / curl / server-to-server (no Origin header).
      if (!origin) return cb(null, true);
      if (env.CORS_ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error(`Origin not allowed by CORS: ${origin}`));
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

// ── Stripe webhook FIRST, with a raw body parser ─────────────────────────────
// Must be registered before express.json() so the signature can be verified
// against the exact bytes Stripe sent.
app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  stripeWebhookHandler,
);

// ── JSON parsing for everything else ─────────────────────────────────────────
// Large limit because /api/analyze carries a base64 image (capped again in the
// route's Zod schema).
app.use(express.json({ limit: '20mb' }));

app.use(globalRateLimiter);

// ── Health ───────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, env: env.NODE_ENV }));

// ── API routes ─────────────────────────────────────────────────────────────
app.use('/api/analyze', analyzeRouter);
app.use('/api/user', userRouter);
app.use('/api/stripe', stripeRouter);

// ── Fallbacks ────────────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(
    `Veil backend listening on :${env.PORT} (${env.NODE_ENV})` +
      (isProd ? '' : `\n  → CORS allows: ${env.CORS_ALLOWED_ORIGINS.join(', ')}`),
  );
});
