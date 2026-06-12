-- One-time AI data-sharing acknowledgment. Set to now() the first time a user
-- continues past the AI disclosure sheet (see POST /api/users/ai-consent). NULL
-- means the user has not yet acknowledged, so the disclosure surface is shown
-- once on first authenticated load. The value is server-set only (never taken
-- from the request body) so it cannot be spoofed by the client.
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_consent_at timestamptz;
