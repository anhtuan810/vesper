-- APNs device tokens for push notifications. One row per (user, device token);
-- written via /api/push/register, read by the market-highlights cron sender.
-- Server-only access (service role): RLS enabled with no policies.

CREATE TABLE IF NOT EXISTS public.device_tokens (
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token      text NOT NULL,
  platform   text NOT NULL CHECK (platform IN ('ios')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, token)
);

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
