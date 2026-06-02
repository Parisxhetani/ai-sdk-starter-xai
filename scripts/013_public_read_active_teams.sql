-- 013_public_read_active_teams.sql
-- Fix: the signup page (/auth/register) shows "Loading teams…" forever.
--
-- The register page runs with the anon key (user isn't logged in yet), but
-- the only SELECT policy on public.teams from script 010 requires
-- auth.role() = 'authenticated'. So anonymous visitors get zero rows (no
-- error), the team picker stays empty, and the loading hint never clears.
--
-- Add a public read scoped to ACTIVE teams so the picker populates. Active
-- teams are inherently public-facing (shown on the open signup page).
-- Postgres ORs SELECT policies together, so authenticated users keep the
-- full access granted by the existing policy.
--
-- Idempotent: safe to re-run.

DROP POLICY IF EXISTS "Public read active teams" ON public.teams;

CREATE POLICY "Public read active teams"
  ON public.teams FOR SELECT
  TO anon, authenticated
  USING (active = true);
