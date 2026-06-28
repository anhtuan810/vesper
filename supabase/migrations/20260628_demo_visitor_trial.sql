-- Anchor the per-visitor demo trial to the BROWSER, not the per-entry anonymous
-- user, so re-entering the demo in the same browser (e.g. after bailing out of
-- Subscribe) never resets the one-hour clock.
--
-- demo_visitors is a long-lived tombstone keyed by a persistent `demo_visitor`
-- cookie. first_seen records when the browser first entered the demo; the trial
-- deadline is first_seen + TTL for every re-entry. It is deliberately NOT reaped
-- alongside the per-user demo_users rows (which the cron deletes within ~a day):
-- the reaper only prunes demo_visitors well past the cookie's life, so the
-- lockout survives the per-user data cleanup. Server-only (service role): RLS on,
-- no policies, matching demo_users / device_tokens / billing_events.
CREATE TABLE IF NOT EXISTS public.demo_visitors (
  visitor_id uuid PRIMARY KEY,
  first_seen timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.demo_visitors ENABLE ROW LEVEL SECURITY;

-- The reaper prunes old visitors by age; index first_seen for the range select.
CREATE INDEX IF NOT EXISTS demo_visitors_first_seen_idx ON public.demo_visitors (first_seen);

-- Link each anonymous demo user to its browser, so the session guard can find the
-- visitor's first entry and enforce the same deadline the entry route set.
-- Nullable: the native demo (/api/demo-session) has no cookie and keeps the
-- legacy per-user clock (created_at) until a device-token equivalent ships.
ALTER TABLE public.demo_users ADD COLUMN IF NOT EXISTS visitor_id uuid;
CREATE INDEX IF NOT EXISTS demo_users_visitor_id_idx ON public.demo_users (visitor_id);
