-- The existing highlights_type_check constraint only allowed 'market',
-- silently blocking type='insight' inserts. Widen it to cover all three types.

ALTER TABLE public.highlights DROP CONSTRAINT IF EXISTS highlights_type_check;

ALTER TABLE public.highlights
  ADD CONSTRAINT highlights_type_check
  CHECK (type IN ('insight', 'market', 'portfolio'));
