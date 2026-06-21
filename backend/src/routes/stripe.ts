import { Router, type Request, type Response } from 'express';
import type Stripe from 'stripe';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { stripe } from '../services/stripe.js';
import { env } from '../config/env.js';

/**
 * Authenticated checkout routes (JSON body). Mounted at /api/stripe.
 */
export const stripeRouter = Router();

/** POST /api/stripe/checkout — create a one-time Checkout Session. */
stripeRouter.post(
  '/checkout',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.user!;

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('stripe_customer_id, email')
      .eq('id', user.id)
      .single();

    let stripeCustomerId = profile?.stripe_customer_id ?? null;

    // Create the Stripe customer once and reuse it — no duplicate customers.
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? profile?.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      stripeCustomerId = customer.id;
      await supabaseAdmin
        .from('profiles')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', user.id);
    }

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{ price: env.STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${env.APP_URL}/dashboard/billing?status=success`,
      cancel_url: `${env.APP_URL}/dashboard/billing?status=cancelled`,
      // The webhook trusts ONLY this server-set metadata, never client input.
      metadata: {
        supabase_user_id: user.id,
        credits_granted_usd: String(env.CREDITS_GRANTED_USD),
      },
    });

    res.json({ url: session.url });
  }),
);

/**
 * Stripe webhook. Mounted SEPARATELY in index.ts with a raw body parser so the
 * signature can be verified. Do NOT put this behind requireAuth — Stripe calls
 * it directly. The signature IS the authentication.
 */
export async function stripeWebhookHandler(req: Request, res: Response) {
  const signature = req.header('stripe-signature');
  if (!signature) {
    return res.status(400).json({ error: 'Missing stripe-signature header.' });
  }

  let event: Stripe.Event;
  try {
    // req.body is a Buffer here (express.raw). constructEvent requires the
    // unparsed payload to validate the HMAC signature.
    event = stripe.webhooks.constructEvent(
      req.body as Buffer,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Webhook signature verification failed:', err);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;

    if (session.payment_status !== 'paid') {
      return res.json({ received: true });
    }

    const supabaseUserId = session.metadata?.supabase_user_id;
    const creditsGrantedUsd = Number(session.metadata?.credits_granted_usd ?? env.CREDITS_GRANTED_USD);

    if (!supabaseUserId) {
      // eslint-disable-next-line no-console
      console.error('Webhook: missing supabase_user_id in session metadata');
      return res.status(400).json({ error: 'Missing user ID' });
    }

    // Idempotency: if we've already recorded this event id, do nothing.
    const { data: existing } = await supabaseAdmin
      .from('stripe_events')
      .select('id')
      .eq('stripe_event_id', event.id)
      .maybeSingle();

    if (existing) {
      return res.json({ received: true, duplicate: true });
    }

    // Atomic credit grant + tier=paid via the Postgres function.
    const { error: rpcError } = await supabaseAdmin.rpc('increment_balance', {
      uid: supabaseUserId,
      amount: creditsGrantedUsd,
    });

    if (rpcError) {
      // eslint-disable-next-line no-console
      console.error('Failed to provision credits:', rpcError);
      // Return 500 so Stripe retries later (it will re-deliver the event).
      return res.status(500).json({ error: 'Credit provisioning failed' });
    }

    // Record the idempotency key AFTER the grant succeeds.
    await supabaseAdmin.from('stripe_events').insert({
      stripe_event_id: event.id,
      user_id: supabaseUserId,
      event_type: event.type,
      amount_usd: creditsGrantedUsd,
    });

    // eslint-disable-next-line no-console
    console.log(`Credits provisioned: $${creditsGrantedUsd} for user ${supabaseUserId}`);
  }

  res.json({ received: true });
}
