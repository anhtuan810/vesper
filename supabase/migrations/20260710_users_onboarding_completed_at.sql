-- Gated-onboarding flag. Set to now() when a user hits "Done" at the end of the
-- onboarding asset-collection flow (see POST /api/onboarding/complete). NULL means
-- the user has never finished onboarding, so the middleware gate redirects every
-- request to /onboarding until it is set. The value is server-set only (never taken
-- from the request body) so it cannot be spoofed by the client. Gate on the FLAG,
-- never on "has data": a user who later sells everything and sits at zero assets
-- keeps a non-null flag and stays in the app.
--
-- No new RLS policy is needed: `users` already carries an owner-only policy
-- (ALL USING auth.uid() = id), which is row-level and therefore already governs
-- reads and updates of this new column for the user's own row.
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

-- Backfill: mark every EXISTING user complete. They are already using the app, so
-- the new gate must never wall them. Only genuinely-new users — created AFTER this
-- runs, whose handle_new_user() insert leaves the column NULL — are ever gated.
-- Idempotent (only touches rows still NULL), so re-running is safe.
UPDATE users SET onboarding_completed_at = now() WHERE onboarding_completed_at IS NULL;
