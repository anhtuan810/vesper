-- Per-IP cap on demo-session minting (src/lib/demo-session.ts → demoMintAllowed).
-- Every per-visitor demo entry mints a fresh anonymous account with its own chat
-- allowance, so unthrottled minting is an Anthropic-spend amplifier. One row per
-- (sha256(ip), UTC hour) — no raw IP is ever stored; rows are pruned by the
-- reap-demo cron after ~2 days. The code FAILS OPEN until this is applied (the
-- demo works, just unthrottled), so it is safe to deploy first. Apply wherever
-- DEMO_ENABLED=true.

CREATE TABLE IF NOT EXISTS public.demo_ip_limits (
  ip_hash text NOT NULL,
  hour    text NOT NULL, -- UTC hour bucket, "YYYY-MM-DDTHH"
  count   int  NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, hour)
);

-- Server-only access (service role): RLS enabled with no policies, matching
-- rate_limits / demo_users / demo_visitors.
ALTER TABLE public.demo_ip_limits ENABLE ROW LEVEL SECURITY;

-- Atomically increments the counter and returns the new value — same shape and
-- hardening (security invoker, pinned search_path, service-role-only EXECUTE)
-- as increment_rate_limit.
CREATE OR REPLACE FUNCTION public.increment_demo_ip_limit(
  p_ip_hash text,
  p_hour    text
) RETURNS int
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  INSERT INTO public.demo_ip_limits (ip_hash, hour, count)
  VALUES (p_ip_hash, p_hour, 1)
  ON CONFLICT (ip_hash, hour)
  DO UPDATE SET count = public.demo_ip_limits.count + 1
  RETURNING count;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_demo_ip_limit(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_demo_ip_limit(text, text)
  TO service_role;
