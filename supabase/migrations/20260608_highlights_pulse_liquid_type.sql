-- Add 'pulse_liquid' to the highlights type allowlist so the split-out pulse
-- route (/api/vitals/pulse) can cache the liquid-lens Pulse sentence in its own
-- row. Without this the insert silently violates the check constraint and the
-- liquid pulse is regenerated (a Haiku call) on every mixed-portfolio load.
-- Re-adds every value the constraint already allowed; this is additive only.

ALTER TABLE public.highlights DROP CONSTRAINT IF EXISTS highlights_type_check;

ALTER TABLE public.highlights
  ADD CONSTRAINT highlights_type_check
  CHECK (type IN ('insight', 'market', 'portfolio', 'pulse', 'pulse_liquid'));
