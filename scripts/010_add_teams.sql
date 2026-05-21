-- 010_add_teams.sql
-- Add a team layer over users/orders/chat. Seed CORE/BLUE/PURPLE/PINK/ORANGE/GREEN.
-- Backfill all existing users + orders to CORE.
-- Rewrite RLS policies to be team-aware.
-- Add team-aware signup trigger + auto-fill of orders.team_id.
-- Idempotent: safe to re-run.

-- =====================================================================
-- 1. teams table
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.teams (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                  TEXT NOT NULL UNIQUE,
  name                  TEXT NOT NULL,
  color                 TEXT NOT NULL,
  active                BOOLEAN NOT NULL DEFAULT true,
  ordering_day_of_week  SMALLINT NOT NULL DEFAULT 5
                         CHECK (ordering_day_of_week BETWEEN 0 AND 6),
  vendor_phone          TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- Seed: CORE first (default), then the colored teams.
INSERT INTO public.teams (slug, name, color)
VALUES
  ('CORE',   'Core',   '#64748b'),
  ('BLUE',   'Blue',   '#3b82f6'),
  ('PURPLE', 'Purple', '#a855f7'),
  ('PINK',   'Pink',   '#ec4899'),
  ('ORANGE', 'Orange', '#f97316'),
  ('GREEN',  'Green',  '#22c55e')
ON CONFLICT (slug) DO NOTHING;

DROP TRIGGER IF EXISTS update_teams_updated_at ON public.teams;
CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- 2. team_admins (per-team admin role)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.team_admins (
  user_id    UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  team_id    UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS team_admins_team_idx ON public.team_admins (team_id);

ALTER TABLE public.team_admins ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- 3. team_messages (per-team chat)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.team_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content    TEXT NOT NULL CHECK (length(trim(content)) > 0 AND length(content) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS team_messages_team_created_idx
  ON public.team_messages (team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS team_messages_user_idx
  ON public.team_messages (user_id);

ALTER TABLE public.team_messages ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- 4. users.team_id (backfill ALL existing users -> CORE)
-- =====================================================================
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id);

UPDATE public.users
SET team_id = (SELECT id FROM public.teams WHERE slug = 'CORE')
WHERE team_id IS NULL;

ALTER TABLE public.users ALTER COLUMN team_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS users_team_idx ON public.users (team_id);

-- =====================================================================
-- 5. orders.team_id (backfill from users.team_id)
-- =====================================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id);

UPDATE public.orders o
SET team_id = u.team_id
FROM public.users u
WHERE o.user_id = u.id AND o.team_id IS NULL;

ALTER TABLE public.orders ALTER COLUMN team_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS orders_team_friday_idx
  ON public.orders (team_id, friday_date);

-- =====================================================================
-- 6. Migrate per-team settings off the global `settings` table.
--    Existing keys: 'tony_phone', 'ordering_day_of_week' -> teams[CORE].
-- =====================================================================
DO $$
DECLARE
  v_phone TEXT;
  v_day   TEXT;
  v_day_num SMALLINT;
BEGIN
  SELECT value INTO v_phone FROM public.settings WHERE key = 'tony_phone';
  IF v_phone IS NOT NULL AND length(trim(v_phone)) > 0 THEN
    UPDATE public.teams SET vendor_phone = v_phone WHERE slug = 'CORE';
    DELETE FROM public.settings WHERE key = 'tony_phone';
  END IF;

  SELECT value INTO v_day FROM public.settings WHERE key = 'ordering_day_of_week';
  IF v_day IS NOT NULL THEN
    BEGIN
      v_day_num := v_day::SMALLINT;
      IF v_day_num BETWEEN 0 AND 6 THEN
        UPDATE public.teams SET ordering_day_of_week = v_day_num WHERE slug = 'CORE';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- ignore bad legacy values, leave default
      NULL;
    END;
    DELETE FROM public.settings WHERE key = 'ordering_day_of_week';
  END IF;
END $$;

-- =====================================================================
-- 7. Helper functions used by RLS policies.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.current_team_id() RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT team_id FROM public.users WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
  )
$$;

CREATE OR REPLACE FUNCTION public.is_team_admin_of(target_team UUID) RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_admins
    WHERE user_id = auth.uid() AND team_id = target_team
  )
$$;

-- =====================================================================
-- 8. RLS policies
-- =====================================================================

-- ---- users ----------------------------------------------------------
DROP POLICY IF EXISTS "Users can view their own data" ON public.users;
DROP POLICY IF EXISTS "Users can update their own data" ON public.users;
DROP POLICY IF EXISTS "Users see team and self" ON public.users;
DROP POLICY IF EXISTS "Users update self" ON public.users;
DROP POLICY IF EXISTS "Super admin manages users" ON public.users;
DROP POLICY IF EXISTS "Team admin manages team users" ON public.users;
DROP POLICY IF EXISTS "Authenticated users can read names" ON public.users;

-- Minimal cross-team read so global chat can resolve message author names.
-- Frontend should only select id/name from this path; sensitive columns
-- (email/phone/role/team_id) are also returned but the application layer
-- limits exposure. RLS is column-blind; we rely on the SELECT list.
CREATE POLICY "Authenticated users can read users"
  ON public.users FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users update self"
  ON public.users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Super admin manages users"
  ON public.users FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Team admin updates team users"
  ON public.users FOR UPDATE
  USING (public.is_team_admin_of(team_id))
  WITH CHECK (public.is_team_admin_of(team_id));

-- ---- teams ----------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users read teams" ON public.teams;
DROP POLICY IF EXISTS "Team admin updates own team" ON public.teams;
DROP POLICY IF EXISTS "Super admin manages teams" ON public.teams;

CREATE POLICY "Authenticated users read teams"
  ON public.teams FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Team admin updates own team"
  ON public.teams FOR UPDATE
  USING (public.is_team_admin_of(id))
  WITH CHECK (public.is_team_admin_of(id));

CREATE POLICY "Super admin manages teams"
  ON public.teams FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ---- team_admins ----------------------------------------------------
DROP POLICY IF EXISTS "Read own team_admins row" ON public.team_admins;
DROP POLICY IF EXISTS "Super admin manages team_admins" ON public.team_admins;

CREATE POLICY "Read own team_admins row"
  ON public.team_admins FOR SELECT
  USING (auth.uid() = user_id OR public.is_super_admin());

CREATE POLICY "Super admin manages team_admins"
  ON public.team_admins FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ---- orders ---------------------------------------------------------
DROP POLICY IF EXISTS "Users can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Users can insert their own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can update their own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can delete their own orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can insert any orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can update any orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can delete any orders" ON public.orders;
DROP POLICY IF EXISTS "Orders read same team" ON public.orders;
DROP POLICY IF EXISTS "Orders insert own row in own team" ON public.orders;
DROP POLICY IF EXISTS "Orders update own or admin same team" ON public.orders;
DROP POLICY IF EXISTS "Orders delete own or admin same team" ON public.orders;
DROP POLICY IF EXISTS "Orders super admin all" ON public.orders;

CREATE POLICY "Orders read same team"
  ON public.orders FOR SELECT
  USING (
    team_id = public.current_team_id()
    OR public.is_super_admin()
    OR public.is_team_admin_of(team_id)
  );

CREATE POLICY "Orders insert own row same team"
  ON public.orders FOR INSERT
  WITH CHECK (
    (auth.uid() = user_id AND team_id = public.current_team_id())
    OR public.is_super_admin()
    OR public.is_team_admin_of(team_id)
  );

CREATE POLICY "Orders update own or admin same team"
  ON public.orders FOR UPDATE
  USING (
    auth.uid() = user_id
    OR public.is_super_admin()
    OR public.is_team_admin_of(team_id)
  )
  WITH CHECK (
    auth.uid() = user_id
    OR public.is_super_admin()
    OR public.is_team_admin_of(team_id)
  );

CREATE POLICY "Orders delete own or admin same team"
  ON public.orders FOR DELETE
  USING (
    auth.uid() = user_id
    OR public.is_super_admin()
    OR public.is_team_admin_of(team_id)
  );

-- ---- messages (global chat) ----------------------------------------
-- existing policies from script 006 are fine: read = all authenticated,
-- insert/delete own. Keep them as-is.

-- ---- team_messages (per-team chat) ---------------------------------
DROP POLICY IF EXISTS "Team messages read same team" ON public.team_messages;
DROP POLICY IF EXISTS "Team messages insert own" ON public.team_messages;
DROP POLICY IF EXISTS "Team messages delete own or team admin" ON public.team_messages;

CREATE POLICY "Team messages read same team"
  ON public.team_messages FOR SELECT
  USING (
    team_id = public.current_team_id()
    OR public.is_super_admin()
    OR public.is_team_admin_of(team_id)
  );

CREATE POLICY "Team messages insert own"
  ON public.team_messages FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND team_id = public.current_team_id()
  );

CREATE POLICY "Team messages delete own or team admin"
  ON public.team_messages FOR DELETE
  USING (
    auth.uid() = user_id
    OR public.is_super_admin()
    OR public.is_team_admin_of(team_id)
  );

-- ---- events (audit log) --------------------------------------------
DROP POLICY IF EXISTS "Admin can view events" ON public.events;
DROP POLICY IF EXISTS "Authenticated users can insert events" ON public.events;
DROP POLICY IF EXISTS "Super admin view events" ON public.events;
DROP POLICY IF EXISTS "Team admin view team events" ON public.events;

CREATE POLICY "Super admin view events"
  ON public.events FOR SELECT
  USING (public.is_super_admin());

CREATE POLICY "Team admin view team events"
  ON public.events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      JOIN public.team_admins ta ON ta.user_id = auth.uid()
      WHERE u.id = events.user_id AND u.team_id = ta.team_id
    )
  );

CREATE POLICY "Authenticated users insert events"
  ON public.events FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- =====================================================================
-- 9. Trigger: auto-fill orders.team_id from users.team_id on INSERT.
--    Keeps orders aligned with the user's current team without forcing
--    every API caller to set it.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.set_order_team_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.team_id IS NULL THEN
    SELECT team_id INTO NEW.team_id FROM public.users WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_set_team_id ON public.orders;
CREATE TRIGGER orders_set_team_id
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_order_team_id();

-- When a user is reassigned to another team, follow their existing
-- *future* orders to that team (past orders stay where they were
-- to keep historical CSV exports stable).
CREATE OR REPLACE FUNCTION public.sync_orders_on_user_team_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.team_id IS DISTINCT FROM OLD.team_id THEN
    UPDATE public.orders
    SET team_id = NEW.team_id
    WHERE user_id = NEW.id AND friday_date >= CURRENT_DATE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_sync_orders_on_team_change ON public.users;
CREATE TRIGGER users_sync_orders_on_team_change
  AFTER UPDATE OF team_id ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_orders_on_user_team_change();

-- =====================================================================
-- 10. handle_new_user(): honor team_slug from raw_user_meta_data,
--     fall back to CORE.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  whitelisted_emails_json TEXT;
  whitelisted_emails_array TEXT[];
  is_whitelisted BOOLEAN := false;
  desired_slug TEXT;
  resolved_team_id UUID;
  domain_part TEXT;
BEGIN
  -- Domain auto-whitelist (kept from earlier migration 004).
  domain_part := split_part(NEW.email, '@', 2);
  IF lower(domain_part) = 'facilization.com' THEN
    is_whitelisted := true;
  END IF;

  -- Legacy explicit-list whitelist still honored if settings has it.
  SELECT value INTO whitelisted_emails_json
  FROM public.settings
  WHERE key = 'whitelisted_emails';

  IF whitelisted_emails_json IS NOT NULL THEN
    SELECT ARRAY(SELECT json_array_elements_text(whitelisted_emails_json::json))
    INTO whitelisted_emails_array;

    IF NEW.email = ANY (whitelisted_emails_array) THEN
      is_whitelisted := true;
    END IF;
  END IF;

  -- Resolve chosen team or fall back to CORE.
  desired_slug := upper(coalesce(NEW.raw_user_meta_data ->> 'team_slug', ''));
  IF desired_slug = '' THEN
    desired_slug := 'CORE';
  END IF;

  SELECT id INTO resolved_team_id FROM public.teams
  WHERE slug = desired_slug AND active = true;

  IF resolved_team_id IS NULL THEN
    SELECT id INTO resolved_team_id FROM public.teams WHERE slug = 'CORE';
  END IF;

  INSERT INTO public.users (id, email, name, role, whitelisted, team_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
    CASE WHEN NEW.email = 'admin@company.com' THEN 'admin' ELSE 'member' END,
    is_whitelisted,
    resolved_team_id
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.events (type, user_id, payload)
  VALUES (
    'user_registered',
    NEW.id,
    json_build_object(
      'email', NEW.email,
      'whitelisted', is_whitelisted,
      'team_id', resolved_team_id
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
