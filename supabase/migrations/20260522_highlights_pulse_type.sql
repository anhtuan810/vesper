-- Add 'pulse' to the highlights type allowlist so route.ts can cache
-- the Pulse banner sentence. Without this the insert silently violated
-- the check constraint and pulse was regenerated on every request.

ALTER TABLE public.highlights DROP CONSTRAINT IF EXISTS highlights_type_check;

ALTER TABLE public.highlights
  ADD CONSTRAINT highlights_type_check
  CHECK (type IN ('insight', 'market', 'portfolio', 'pulse'));
