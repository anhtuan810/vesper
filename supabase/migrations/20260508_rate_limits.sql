-- Atomic per-user rate limiting table.
-- Replaces the non-atomic count-then-check pattern in /api/chat and /api/diary-summary.

CREATE TABLE IF NOT EXISTS rate_limits (
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  bucket  text    NOT NULL,
  date    date    NOT NULL,
  count   int     NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, bucket, date)
);

-- Atomically increments the counter and returns the new value.
CREATE OR REPLACE FUNCTION increment_rate_limit(
  p_user_id uuid,
  p_bucket  text,
  p_date    date
) RETURNS int
LANGUAGE sql
AS $$
  INSERT INTO rate_limits (user_id, bucket, date, count)
  VALUES (p_user_id, p_bucket, p_date, 1)
  ON CONFLICT (user_id, bucket, date)
  DO UPDATE SET count = rate_limits.count + 1
  RETURNING count;
$$;
