-- Saved Current-vs-Scenario sandboxes (Decision 8: clone-and-modify, not a
-- modification surface). `assets_snapshot` is the cloned, hypothetical portfolio
-- captured at save time — it is NOT a write to real assets/mutations/snapshots.
--
-- Per-user table conventions match the existing ones (e.g. rate_limits): user_id
-- FK to users(id) ON DELETE CASCADE, RLS scoped by auth.uid() = user_id.

CREATE TABLE IF NOT EXISTS scenarios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            text NOT NULL,
  assets_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- List view: newest-first per user (mirrors the messages/snapshots index style).
CREATE INDEX IF NOT EXISTS scenarios_user_created_idx
  ON scenarios (user_id, created_at DESC);

ALTER TABLE scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scenarios_owner_all" ON scenarios
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
