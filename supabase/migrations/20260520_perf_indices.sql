-- Cursor-pagination index: messages loaded in reverse-chronological order per user
CREATE INDEX IF NOT EXISTS messages_user_created_idx
  ON messages (user_id, created_at DESC);

-- Net-worth chart queries: snapshots fetched by user + date
CREATE INDEX IF NOT EXISTS snapshots_user_date_idx
  ON snapshots (user_id, date DESC);
