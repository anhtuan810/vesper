-- Diary first-page query orders mutations by recorded_at (descending) filtered by
-- user_id (see src/app/(main)/diary/page.tsx fetchMutations). This composite index
-- backs that ORDER BY + filter so the paginated read stays fast as the table grows.

CREATE INDEX IF NOT EXISTS mutations_user_recorded_idx
  ON mutations (user_id, recorded_at DESC);

-- On an already-populated table, prefer running this once as a standalone
-- statement with CONCURRENTLY so it does not lock writes (it CANNOT run inside a
-- transaction, so apply it outside the migration runner if needed):
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS mutations_user_recorded_idx
--     ON mutations (user_id, recorded_at DESC);
