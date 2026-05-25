-- 011_add_vendors.sql
-- Add a vendor / food-chain concept.
-- Existing menu items are assigned to a "Tony" vendor (default).
-- A new "Veggies" vendor is seeded with the menu pulled from the Wolt page.
-- Each team has a default vendor and can override per Friday.
-- Idempotent.

-- =====================================================================
-- 1. vendors table
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.vendors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT '🍽️',   -- emoji shown in the order form
  color       TEXT NOT NULL DEFAULT '#64748b',
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_vendors_updated_at ON public.vendors;
CREATE TRIGGER update_vendors_updated_at BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO public.vendors (slug, name, icon, color)
VALUES
  ('TONY',    'Tony''s',  '🍕', '#f97316'),
  ('VEGGIES', 'Veggies',  '🥗', '#22c55e')
ON CONFLICT (slug) DO NOTHING;

-- =====================================================================
-- 2. menu_items.vendor_id (backfill all existing -> TONY)
-- =====================================================================
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.vendors(id);

UPDATE public.menu_items
SET vendor_id = (SELECT id FROM public.vendors WHERE slug = 'TONY')
WHERE vendor_id IS NULL;

ALTER TABLE public.menu_items ALTER COLUMN vendor_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS menu_items_vendor_idx ON public.menu_items (vendor_id);

-- Existing UNIQUE(item, variant) needs to be relaxed because different
-- vendors might both sell e.g. "Salad". Replace with (vendor_id, item, variant).
DO $$
DECLARE
  con_name TEXT;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'public.menu_items'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) LIKE '%(item, variant)%';

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.menu_items DROP CONSTRAINT %I', con_name);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.menu_items'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) LIKE '%(vendor_id, item, variant)%'
  ) THEN
    ALTER TABLE public.menu_items
      ADD CONSTRAINT menu_items_vendor_item_variant_key UNIQUE (vendor_id, item, variant);
  END IF;
END $$;

-- =====================================================================
-- 3. teams.default_vendor_id (every team gets a default vendor)
-- =====================================================================
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS default_vendor_id UUID REFERENCES public.vendors(id);

UPDATE public.teams
SET default_vendor_id = (SELECT id FROM public.vendors WHERE slug = 'TONY')
WHERE default_vendor_id IS NULL;

-- =====================================================================
-- 4. team_vendor_overrides (per-Friday override)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.team_vendor_overrides (
  team_id      UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  friday_date  DATE NOT NULL,
  vendor_id    UUID NOT NULL REFERENCES public.vendors(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, friday_date)
);

ALTER TABLE public.team_vendor_overrides ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS team_vendor_overrides_team_idx
  ON public.team_vendor_overrides (team_id);

-- =====================================================================
-- 5. RLS policies
-- =====================================================================

-- vendors: read by all authenticated, write by super-admin
DROP POLICY IF EXISTS "Vendors read all authenticated" ON public.vendors;
DROP POLICY IF EXISTS "Vendors super admin all" ON public.vendors;

CREATE POLICY "Vendors read all authenticated"
  ON public.vendors FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Vendors super admin all"
  ON public.vendors FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- team_vendor_overrides: read/write by team-admin of that team, or super-admin
DROP POLICY IF EXISTS "Team vendor overrides read" ON public.team_vendor_overrides;
DROP POLICY IF EXISTS "Team vendor overrides team admin" ON public.team_vendor_overrides;
DROP POLICY IF EXISTS "Team vendor overrides super admin" ON public.team_vendor_overrides;

CREATE POLICY "Team vendor overrides read"
  ON public.team_vendor_overrides FOR SELECT
  USING (
    team_id = public.current_team_id()
    OR public.is_super_admin()
    OR public.is_team_admin_of(team_id)
  );

CREATE POLICY "Team vendor overrides team admin write"
  ON public.team_vendor_overrides FOR ALL
  USING (public.is_team_admin_of(team_id))
  WITH CHECK (public.is_team_admin_of(team_id));

CREATE POLICY "Team vendor overrides super admin all"
  ON public.team_vendor_overrides FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- menu_items: existing "authenticated can read" stays — vendor scoping is
-- enforced in the order form UI (we don't want to block the catalog at the DB
-- level, since admins need to browse and assign vendors).

-- =====================================================================
-- 6. Helper view: resolve a team's vendor for a given date
-- =====================================================================
CREATE OR REPLACE FUNCTION public.team_vendor_for(target_team UUID, target_date DATE)
RETURNS UUID LANGUAGE SQL STABLE AS $$
  SELECT COALESCE(
    (SELECT vendor_id FROM public.team_vendor_overrides
      WHERE team_id = target_team AND friday_date = target_date),
    (SELECT default_vendor_id FROM public.teams WHERE id = target_team)
  )
$$;

-- =====================================================================
-- 7. Seed Veggies menu items (Wolt: veggies-tirana, 2026-05-25)
-- Prices are in ALL (Albanian Lek).
-- =====================================================================
DO $$
DECLARE
  v UUID;
BEGIN
  SELECT id INTO v FROM public.vendors WHERE slug = 'VEGGIES';
  IF v IS NULL THEN
    RAISE EXCEPTION 'Veggies vendor not found — seed step skipped';
  END IF;

  INSERT INTO public.menu_items (item, variant, price_all, active, vendor_id) VALUES
    -- Breakfast (Mëngjesi)
    ('Breakfast',        'Egg Frittata',                            500, true, v),
    ('Breakfast',        'Avo Toast',                                600, true, v),
    ('Breakfast',        'Yogurt Granola & Spirulina',               550, true, v),
    -- Antipasta
    ('Antipasta',        'Spring Rolls',                             750, true, v),
    ('Antipasta',        'Springrolls me lakra',                     730, true, v),
    ('Antipasta',        'Hummus & Pite',                            550, true, v),
    ('Antipasta',        'Hummus i kuq me karrote & kastravec',      500, true, v),
    ('Antipasta',        'Qofte falafeli & hummus',                  800, true, v),
    ('Antipasta',        'Patate te embla — salce tartufi',          550, true, v),
    ('Antipasta',        'Patate te embla — salce guakamole',        600, true, v),
    -- Burger & Wraps
    ('Burger & Wraps',   'Burger Vegan',                             800, true, v),
    ('Burger & Wraps',   'Sushi Burger',                             900, true, v),
    ('Burger & Wraps',   'Falafel Pite',                             600, true, v),
    ('Burger & Wraps',   'Guacamole Quesadillas',                    600, true, v),
    ('Burger & Wraps',   'New Burrito',                              700, true, v),
    ('Burger & Wraps',   'Classic Burrito',                          700, true, v),
    -- Asian (Aziatika)
    ('Asian',            'Thai Curry',                               850, true, v),
    ('Asian',            'Noodles me Tofu',                          790, true, v),
    ('Asian',            'Vegetable Noodles',                        680, true, v),
    ('Asian',            'Ramen',                                    680, true, v),
    ('Asian',            'Oriz Basmati',                             750, true, v),
    ('Asian',            'Budha',                                    700, true, v),
    -- Pasta
    ('Pasta',            'Farfalle në Salcë Tartufi',                700, true, v),
    ('Pasta',            'Pasta Avo Pistachio',                      690, true, v),
    ('Pasta',            'Penne Integrale',                          550, true, v),
    -- Mains (Kryesore)
    ('Kryesore',         'Oriz i Zi',                                750, true, v),
    -- Sushi
    ('Sushi',            'Avo Philadelfia',                          800, true, v),
    ('Sushi',            'Sushi me Tartuf',                          800, true, v),
    -- Bowls
    ('Bowl',             'Falafel Bowl',                             850, true, v),
    ('Bowl',             'Shiva Bowl',                              1000, true, v),
    -- Soup
    ('Supë',             'Supë me Thjerrëza',                        400, true, v),
    -- Drinks
    ('Drink',            'Lëngu i Jetës',                            350, true, v)
  ON CONFLICT (vendor_id, item, variant) DO NOTHING;
END $$;
