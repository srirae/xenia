-- ============================================================================
--  Veil / Doxxing Shield — Supabase Schema
-- ============================================================================
--  Run this entire file in the Supabase SQL Editor (Dashboard → SQL → New query).
--  It is idempotent-friendly: safe to re-run. It creates:
--    1. public.profiles        — application user data (1:1 with auth.users)
--    2. public.scans           — paid-tier scan history
--    3. public.stripe_events   — webhook idempotency ledger
--    4. RLS policies           — users can only touch their own rows
--    5. increment_balance()    — atomic credit top-up (no race conditions)
--    6. deduct_balance()       — atomic credit burn-down for /api/analyze
--    7. handle_new_user()      — trigger that seeds a profile on first sign-in
--
--  SECURITY MODEL
--  --------------
--  * The browser (anon key) is bound by RLS and can ONLY read/update its own
--    profile + read its own scans. It can NEVER write scans, mutate balance,
--    or change tier — those are service-role-only operations done by the backend.
--  * The backend (service role) bypasses RLS and is the sole writer of money
--    fields (virtual_balance, tier) and scan history.
-- ============================================================================

-- Required for gen_random_uuid()
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. profiles
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  email              text not null,
  display_name       text,
  stripe_customer_id text unique,
  tier               text not null default 'free'
                       check (tier in ('free', 'paid')),
  virtual_balance    numeric(10,6) not null default 0.000000
                       check (virtual_balance >= 0),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.profiles is
  'Application data per user. Money columns (tier, virtual_balance) are written only by the service role.';

-- ----------------------------------------------------------------------------
-- 2. scans  (paid-tier history)
-- ----------------------------------------------------------------------------
create table if not exists public.scans (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  model_used    text not null,
  tokens_input  integer not null default 0 check (tokens_input  >= 0),
  tokens_output integer not null default 0 check (tokens_output >= 0),
  cost_deducted numeric(10,6) not null default 0.000000 check (cost_deducted >= 0),
  risk_level    text,           -- snapshot of the scan verdict (low|medium|high|critical)
  tier_at_scan  text not null,  -- tier at the moment the scan ran
  created_at    timestamptz not null default now()
);

create index if not exists scans_user_id_created_at_idx
  on public.scans (user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 3. stripe_events  (webhook idempotency — prevents double-crediting)
-- ----------------------------------------------------------------------------
create table if not exists public.stripe_events (
  id              uuid primary key default gen_random_uuid(),
  stripe_event_id text unique not null,
  user_id         uuid references public.profiles(id) on delete set null,
  event_type      text not null,
  amount_usd      numeric(10,6),
  processed_at    timestamptz not null default now()
);

-- ============================================================================
--  ATOMIC MONEY FUNCTIONS
--  These run with the privileges of the definer (service role) and are the
--  only sanctioned way to mutate virtual_balance. Using read-modify-write from
--  application code would create a lost-update race under concurrent scans.
-- ============================================================================

-- Add credits on a successful Stripe payment, flip the user to paid.
create or replace function public.increment_balance(uid uuid, amount numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance numeric(10,6);
begin
  if amount < 0 then
    raise exception 'increment_balance: amount must be non-negative';
  end if;

  update public.profiles
     set virtual_balance = virtual_balance + amount,
         tier            = 'paid',
         updated_at      = now()
   where id = uid
  returning virtual_balance into new_balance;

  return new_balance;
end;
$$;

-- Burn credits after a paid scan. Never goes below zero; flips the user back
-- to 'free' the moment the balance hits zero. Returns the resulting balance.
create or replace function public.deduct_balance(uid uuid, amount numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance numeric(10,6);
begin
  if amount < 0 then
    raise exception 'deduct_balance: amount must be non-negative';
  end if;

  update public.profiles
     set virtual_balance = greatest(0, virtual_balance - amount),
         updated_at      = now()
   where id = uid
  returning virtual_balance into new_balance;

  -- Exhausted → drop tier back to free so the gatekeeper blocks further scans.
  if new_balance <= 0 then
    update public.profiles
       set tier = 'free', updated_at = now()
     where id = uid;
  end if;

  return new_balance;
end;
$$;

-- ============================================================================
--  NEW USER TRIGGER
--  On first Google sign-in, Supabase inserts into auth.users; mirror that into
--  public.profiles with the free defaults.
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name',
             new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- keep updated_at fresh on profile writes
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ============================================================================
--  ROW-LEVEL SECURITY
-- ============================================================================
alter table public.profiles      enable row level security;
alter table public.scans         enable row level security;
alter table public.stripe_events enable row level security;

-- profiles --------------------------------------------------------------------
drop policy if exists "Users read own profile"   on public.profiles;
drop policy if exists "Users update own profile" on public.profiles;

create policy "Users read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Users may update their own row, but the WITH CHECK below stops the browser
-- from awarding itself credits or upgrading its own tier. Money/tier columns
-- are mutated only by the service role (which bypasses RLS entirely).
create policy "Users update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and tier = (select p.tier from public.profiles p where p.id = auth.uid())
    and virtual_balance = (select p.virtual_balance from public.profiles p where p.id = auth.uid())
  );

-- scans -----------------------------------------------------------------------
drop policy if exists "Users read own scans" on public.scans;

create policy "Users read own scans"
  on public.scans for select
  using (auth.uid() = user_id);
-- NOTE: no INSERT/UPDATE/DELETE policy for scans → the browser can never write
-- history. Only the service-role backend inserts scan rows.

-- stripe_events ---------------------------------------------------------------
-- No policies at all → table is invisible to the anon/auth role. Service role
-- (backend webhook) is the only accessor. This is intentional.

-- ============================================================================
--  GRANTS — least privilege for the money functions
--  Functions are EXECUTE-able by PUBLIC by default. Revoke that, then grant
--  EXECUTE back to service_role ONLY — so the anon/authenticated (browser)
--  roles can never call them, but the backend service role still can.
-- ============================================================================
revoke all on function public.increment_balance(uuid, numeric) from public;
revoke all on function public.deduct_balance(uuid, numeric)    from public;

grant execute on function public.increment_balance(uuid, numeric) to service_role;
grant execute on function public.deduct_balance(uuid, numeric)    to service_role;
