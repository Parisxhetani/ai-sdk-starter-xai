-- 012_seed_zgara_korcare.sql
-- Seed a new vendor: "Zgara Korçare" (Albanian grill).
-- Pulls menu from Wolt (2026-05-25). Beer section was not exposed by the page,
-- so we seed common Albanian beer names with NULL price for the admin to fill in.
-- Depends on 011_add_vendors.sql.
-- Idempotent.

INSERT INTO public.vendors (slug, name, icon, color)
VALUES ('ZGARA', 'Zgara Korçare', '🍖', '#b91c1c')
ON CONFLICT (slug) DO NOTHING;

DO $$
DECLARE
  v UUID;
BEGIN
  SELECT id INTO v FROM public.vendors WHERE slug = 'ZGARA';
  IF v IS NULL THEN
    RAISE EXCEPTION 'Zgara vendor not found — seed step skipped';
  END IF;

  INSERT INTO public.menu_items (item, variant, price_all, active, vendor_id) VALUES
    -- Zgara (grills)
    ('Zgara',       'Shishqebab',                250,  true, v),
    ('Zgara',       'Biftek Gici',               450,  true, v),
    ('Zgara',       'Berxolle Gici',             450,  true, v),
    ('Zgara',       'Paidhaqe Qingji',          1300,  true, v),
    ('Zgara',       'Paidhaqe Gici 0.5 Kg',      800,  true, v),
    ('Zgara',       'Mish Mix',                 2200,  true, v),
    ('Zgara',       'Kërnacka',                   40,  true, v),
    ('Zgara',       'Fileto Pule',               200,  true, v),
    ('Zgara',       'Salçiçe',                    80,  true, v),
    ('Zgara',       'Krahë Pule 0.5 Kg',         500,  true, v),
    ('Zgara',       'Suxhuk',                    250,  true, v),
    ('Zgara',       'Perime Zgare',              400,  true, v),
    -- Sallata (salads)
    ('Sallata',     'Sallatë Greke',             400,  true, v),
    ('Sallata',     'Sallatë Jeshile',           250,  true, v),
    ('Sallata',     'Sallatë Mix',               250,  true, v),
    ('Sallata',     'Sallatë Çezar',             450,  true, v),
    ('Sallata',     'Sallatë Lakre',             250,  true, v),
    ('Sallata',     'Turshi',                    200,  true, v),
    ('Sallata',     'Ajkë Speci',                250,  true, v),
    ('Sallata',     'Xaxiq',                     250,  true, v),
    ('Sallata',     'Salcë Kosi',                200,  true, v),
    ('Sallata',     'Djathë Kaçkavall',          250,  true, v),
    ('Sallata',     'Djathë i Bardhë',           200,  true, v),
    ('Sallata',     'Simite',                     30,  true, v),
    -- Freskuese (beverages)
    ('Freskuese',   'Ujë me Gaz',                 80,  true, v),
    ('Freskuese',   'Ujë pa Gaz',                 80,  true, v),
    ('Freskuese',   'Dhallë',                    150,  true, v),
    ('Freskuese',   'Coca Cola',                 150,  true, v),
    ('Freskuese',   'Fanta',                     150,  true, v),
    ('Freskuese',   'Bravo',                     200,  true, v),
    ('Freskuese',   'B52',                       200,  true, v),
    -- Mëngjesore (breakfast/traditional dishes)
    ('Mëngjesore',  'Paçe Koke',                 350,  true, v),
    ('Mëngjesore',  'Tasqebab',                  400,  true, v),
    ('Mëngjesore',  'Pilaf',                     150,  true, v),
    ('Mëngjesore',  'Spageti',                   200,  true, v),
    ('Mëngjesore',  'Pastiçe',                   300,  true, v),
    ('Mëngjesore',  'Omletë',                    300,  true, v),
    ('Mëngjesore',  'Supë Pule',                 250,  true, v),
    ('Mëngjesore',  'Fasule',                    270,  true, v),
    -- Birra (beers) — common Albanian options, prices left NULL for admin to fill in
    ('Birra',       'Birra Korça',              NULL,  true, v),
    ('Birra',       'Birra Korça e Zezë',       NULL,  true, v),
    ('Birra',       'Birra Tirana',             NULL,  true, v),
    ('Birra',       'Birra Stela',              NULL,  true, v),
    ('Birra',       'Birra Peja',               NULL,  true, v),
    ('Birra',       'Birra Heineken',           NULL,  true, v)
  ON CONFLICT (vendor_id, item, variant) DO NOTHING;
END $$;
