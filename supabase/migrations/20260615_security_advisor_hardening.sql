-- Security Advisor remediation (2026-06)
--
-- Context: fx_rates, diary_summaries, vital_highlights, vital_snapshots, and
-- increment_rate_limit() are accessed exclusively by server code through the
-- service-role client, which bypasses RLS and role grants. No browser code
-- (anon key) touches them, so the correct posture for all of them is
-- deny-all for anon/authenticated.

-- 1) RLS was disabled: with PostgREST's default grants, anyone holding the
--    public anon key could read AND write these tables.
ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diary_summaries ENABLE ROW LEVEL SECURITY;

-- 2) vital_highlights / vital_snapshots carried USING (true) policies, so any
--    signed-in user could read/write every user's rows. Drop all policies;
--    with RLS enabled and no policies the tables are server-only.
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('vital_highlights', 'vital_snapshots')
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $$;

ALTER TABLE public.vital_highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vital_snapshots ENABLE ROW LEVEL SECURITY;

-- 3) increment_rate_limit was executable by anon/authenticated, letting
--    anyone exhaust another user's daily AI quota by calling the RPC with an
--    arbitrary user id. Recreate it security-invoker with a pinned
--    search_path (advisor: "Function Search Path Mutable" /
--    "Public Can Execute SECURITY DEFINER"), then restrict EXECUTE to the
--    service role, the only caller.
CREATE OR REPLACE FUNCTION public.increment_rate_limit(
  p_user_id uuid,
  p_bucket  text,
  p_date    date
) RETURNS int
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  INSERT INTO public.rate_limits (user_id, bucket, date, count)
  VALUES (p_user_id, p_bucket, p_date, 1)
  ON CONFLICT (user_id, bucket, date)
  DO UPDATE SET count = public.rate_limits.count + 1
  RETURNING count;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_rate_limit(uuid, text, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_rate_limit(uuid, text, date)
  TO service_role;

-- 4) handle_new_user is a signup trigger function; it must never be callable
--    directly by clients. Revoking EXECUTE does not affect trigger firing.
--    Pin search_path to public (not '') because its body lives only in the
--    live database and may reference tables unqualified.
REVOKE EXECUTE ON FUNCTION public.handle_new_user()
  FROM PUBLIC, anon, authenticated;
ALTER FUNCTION public.handle_new_user() SET search_path = public;
