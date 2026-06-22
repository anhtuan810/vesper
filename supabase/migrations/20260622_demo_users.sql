-- Per-visitor ephemeral demo sessions. One row per anonymous demo user, written
-- with the service role on demo entry (/demo on web, /api/demo-session on native).
-- created_at starts the hard one-hour session clock: the chat + mechanical
-- mutation routes wall a turn once now - created_at exceeds the TTL
-- (demoExpired), and the reap-demo cron selects rows past TTL + grace to delete
-- the auth user and all of its per-user data. The reaper only ever deletes uids
-- present here — it never enumerates auth.users.
--
-- Server-only access (service role): RLS enabled with no policies, matching the
-- other server-written tables (device_tokens, billing_events). user_id FK to
-- public.users(id) ON DELETE CASCADE, so removing the auth user (reaper or
-- account deletion) drops this tracking row with it.

CREATE TABLE IF NOT EXISTS public.demo_users (
  user_id    uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.demo_users ENABLE ROW LEVEL SECURITY;

-- The reaper scans by age; index created_at so the range select stays cheap as
-- demo sessions accumulate between cron runs.
CREATE INDEX IF NOT EXISTS demo_users_created_at_idx ON public.demo_users (created_at);
