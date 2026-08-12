-- 014_add_order_coffee_choice.sql
-- After-lunch coffee run: what each person wants at the second place.
-- Lunch is one vendor; the coffee happens somewhere else afterwards, so this
-- rides along on the order row (already one per person per Friday) instead of
-- becoming its own table. Team scoping, RLS and realtime come along for free.
--
--   coffee_choice IS NULL   -> still deciding (nobody has asked them yet)
--   coffee_choice = 'none'  -> decided, not joining
--   coffee_note             -> only allowed when coffee_choice = 'other'
--
-- Depends on 001_create_tables.sql.
-- Idempotent: safe to re-run.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS coffee_choice TEXT,
  ADD COLUMN IF NOT EXISTS coffee_note   TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_coffee_choice_valid'
  ) THEN
    ALTER TABLE public.orders
    ADD CONSTRAINT orders_coffee_choice_valid CHECK (
      coffee_choice IS NULL
      OR coffee_choice IN (
        'coffee',
        'coffee_water',
        'coffee_sparkling',
        'water',
        'sparkling',
        'other',
        'none'
      )
    );
  END IF;
END $$;

-- Written as a CASE so it always yields a real boolean. A bare
-- "(choice = 'other' AND note IS NOT NULL) OR (choice <> 'other' AND ...)"
-- evaluates to NULL when coffee_choice is NULL, and a CHECK that returns NULL
-- passes — which would quietly admit a note with no choice attached.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_coffee_note_matches_choice'
  ) THEN
    ALTER TABLE public.orders
    ADD CONSTRAINT orders_coffee_note_matches_choice CHECK (
      CASE
        WHEN coffee_choice = 'other'
          THEN coffee_note IS NOT NULL
           AND btrim(coffee_note) <> ''
           AND char_length(coffee_note) <= 60
        ELSE coffee_note IS NULL
      END
    );
  END IF;
END $$;

COMMENT ON COLUMN public.orders.coffee_choice IS
  'After-lunch drink pick. NULL = still deciding, ''none'' = decided not to join.';
COMMENT ON COLUMN public.orders.coffee_note IS
  'Free-text drink, set only when coffee_choice = ''other''.';

-- The tally always reads one team's single Friday, which the existing
-- orders_team_friday_idx already covers. No new index needed.
