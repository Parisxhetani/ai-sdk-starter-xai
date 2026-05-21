# Teams — Multi-Tenant Layer Over the Portal

**Status:** Design / pre-implementation
**Date:** 2026-05-21
**Author:** Paris Xhetani (via Claude brainstorming session)

## Goal

Add a **team** layer over the existing Friday lunch ordering portal so that users only see and interact with members of their own team. Admins manage on a per-team basis, with a super-admin role retained for cross-team management. All current users migrate to a default team called **CORE**. Other teams are **BLUE, PURPLE, PINK, ORANGE, GREEN**.

## Decisions (locked)

| Topic | Decision |
|---|---|
| Teams | Dynamic `teams` table in DB. Seeded with CORE, BLUE, PURPLE, PINK, ORANGE, GREEN, each with a color. Super-admins can add/rename/recolor/deactivate teams later. |
| Membership | One team per user. Super-admins can reassign a user to another team. |
| CORE | Just a team — same shape and capabilities as the others. Default for existing users on migration. |
| Orders | **Per-team.** Each team has its own Friday order with its own lock state, ordering day, and vendor contact. Members only see their team's orders. |
| Menu | **Shared** — one global menu, all teams pick from it. |
| Chat | **Two channels:** global (`messages`, company-wide) and per-team (`team_messages`, scoped). |
| Admins | **Two-tier.** Super-admin (existing `users.role = 'admin'`) manages all teams. Team-admin (row in `team_admins`) manages a single team. |
| Settings (per-team) | `ordering_day_of_week`, `vendor_phone` live on the `teams` row. |
| Whitelist | Domain-based — `@facilization.com` auto-whitelisted, same as today. No per-team whitelist rules. |
| Signup | User registers, picks a team during signup, and is in immediately (auto-whitelist by domain still applies). |
| Isolation enforcement | **Hybrid:** RLS for member-level read isolation (DB safety net) + API route gates for admin actions (matches the existing `requireAdmin()` pattern). |
| Side fix | Audit and replace places in the UI that show raw Supabase user IDs as a fallback, in favor of name/email. |

## Approach: Hybrid Enforcement

Members are isolated by **Row-Level Security policies** on every team-scoped table — the DB refuses to return another team's rows even if a route forgets to filter. Admin operations (lock toggle, user management, vendor settings) are gated in API route handlers via a new `requireTeamAccess()` helper that extends the existing `requireAdmin()` pattern.

## Data Model

### New tables

```sql
CREATE TABLE public.teams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,    -- 'CORE', 'BLUE', 'PURPLE', 'PINK', 'ORANGE', 'GREEN'
  name        TEXT NOT NULL,
  color       TEXT NOT NULL,           -- e.g. '#6366f1'
  active      BOOLEAN NOT NULL DEFAULT true,
  ordering_day_of_week  SMALLINT NOT NULL DEFAULT 5 CHECK (ordering_day_of_week BETWEEN 0 AND 6),
  vendor_phone          TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.team_admins (
  user_id    UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  team_id    UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.team_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content    TEXT NOT NULL CHECK (length(trim(content)) > 0 AND length(content) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX team_messages_team_created_idx ON public.team_messages (team_id, created_at DESC);
CREATE INDEX team_admins_team_idx ON public.team_admins (team_id);
```

### Changes to existing tables

```sql
ALTER TABLE public.users
  ADD COLUMN team_id UUID REFERENCES public.teams(id);
-- backfill all rows to CORE
-- then:
ALTER TABLE public.users ALTER COLUMN team_id SET NOT NULL;
CREATE INDEX users_team_idx ON public.users (team_id);

ALTER TABLE public.orders
  ADD COLUMN team_id UUID REFERENCES public.teams(id);
-- backfill from users.team_id
ALTER TABLE public.orders ALTER COLUMN team_id SET NOT NULL;
CREATE INDEX orders_team_friday_idx ON public.orders (team_id, friday_date);

-- existing UNIQUE(user_id, friday_date) stays; team_id is derived from user
```

### Settings migration

The existing global `settings` table currently holds keys like `tony_phone` and `ordering_day_of_week`. These move to per-team columns on `teams`:

- `settings['tony_phone']` → `teams[CORE].vendor_phone` (then row deleted)
- `settings['ordering_day_of_week']` → `teams[CORE].ordering_day_of_week` (then row deleted)
- `settings['whitelisted_emails']` stays in `settings` (still global)

Other settings keys remain global on `settings`.

## Access Control

### Helper SQL functions

```sql
CREATE FUNCTION public.current_team_id() RETURNS UUID LANGUAGE SQL STABLE AS $$
  SELECT team_id FROM public.users WHERE id = auth.uid()
$$;

CREATE FUNCTION public.is_super_admin() RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
$$;

CREATE FUNCTION public.is_team_admin_of(target_team UUID) RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.team_admins WHERE user_id = auth.uid() AND team_id = target_team)
$$;
```

### RLS policy matrix

| Table              | Member SELECT             | Member write              | Team-admin                              | Super-admin |
|--------------------|---------------------------|---------------------------|-----------------------------------------|-------------|
| `users`            | own row + same-team rows  | own row only              | full on same-team rows                  | full        |
| `teams`            | all active rows (read)    | none                      | UPDATE own team's settings              | full        |
| `orders`           | same-team rows            | own rows, same team       | full on same-team rows                  | full        |
| `messages` (global)| all                       | own                       | own                                     | full        |
| `team_messages`    | same team                 | own, same team            | full on same-team                       | full        |
| `events`           | none                      | INSERT own                | SELECT same-team events                 | full        |
| `menu_items`       | all (read)                | none                      | none                                    | full        |
| `team_admins`      | own row                   | none                      | none                                    | full        |

### API-layer helpers

A new helper alongside the existing `requireAdmin()`:

```ts
// lib/supabase/auth-helpers.ts
async function requireTeamAccess(targetTeamId: string | null):
  Promise<{ admin, actorId, role: 'super-admin' | 'team-admin' | 'member', teamId }>
```

Semantics:
- Super-admin → any team (or null → must specify in payload)
- Team-admin of T → `targetTeamId === T` only, else 403
- Member of T → `targetTeamId === T` for read-only routes, write-only on own rows; else 403

The existing `requireAdmin()` continues to mean "super-admin only" (used for things like creating teams, editing the global whitelist).

## Admin UX

### Super-admin (`role = 'admin'`)

- Existing admin panel gains a **team picker** chip-row at the top (color-coded by `teams.color`). Picking a team filters orders, users, cash planner, lock state, vendor phone, audit log — everything currently in the panel.
- A new **"Teams" management card** lets super-admins:
  - Add / rename / recolor / deactivate teams
  - Move users between teams (and confirm — orders go with the user via trigger)
  - Promote/demote team-admins (add/remove rows in `team_admins`)
  - View cross-team summary (count of users, orders, locked state per team)

### Team-admin (`team_admins` row, `role = 'member'`)

- Sees the admin panel **scoped to their team only** — no team picker, no Teams card, no whitelist editor.
- Can: lock/unlock their team's Friday order; manage their team's users (add/remove from team, password reset; **not** delete the auth user — only super-admin); edit their team's vendor phone + ordering day; view per-team insights/cash planner; moderate their team's chat (delete messages in `team_messages`).

### Member

- Page shape unchanged. Every list is filtered to their team automatically (by RLS).
- Two chat tabs: **Team** (default) and **Global**.
- A colored team badge appears next to the user's name in the header.

### User-ID leak fix

Replace fallbacks to `user_id` with `user.name ?? user.email ?? '—'`. Known offenders (from initial code read of `components/admin-panel.tsx`): CSV export rows (around lines 327 and 386). Audit other admin views during implementation.

## Signup & Migration

### Signup flow

1. `/auth/register` adds a required **"Pick your team"** step (color buttons for each `teams.active = true` row).
2. Team `slug` is passed in `raw_user_meta_data.team_slug` on `supabase.auth.signUp`.
3. The existing `handle_new_user()` DB trigger (`scripts/003_user_profile_trigger.sql`) is updated to:
   - Continue auto-whitelisting on `@facilization.com` domain.
   - Resolve `team_slug` → `team_id` and write to `users.team_id`.
   - Fall back to CORE if `team_slug` missing or invalid (defensive).

### Migration: `scripts/010_add_teams.sql`

Single migration file performing, in order:

1. Create `teams`, `team_admins`, `team_messages`.
2. Seed CORE (`#84cc16`-ish neutral), BLUE, PURPLE, PINK, ORANGE, GREEN with chosen colors and a sensible default ordering day (5).
3. `ALTER users ADD COLUMN team_id`; UPDATE all rows to CORE; `SET NOT NULL`.
4. `ALTER orders ADD COLUMN team_id`; backfill from `users.team_id`; `SET NOT NULL`.
5. Move existing `settings['tony_phone']` and `settings['ordering_day_of_week']` into `teams[CORE]`; DELETE those settings rows.
6. Drop existing per-table RLS policies; create new team-aware policies (per matrix above).
7. Update `handle_new_user()` to honor `team_slug` from metadata.
8. Add a trigger on `orders` to auto-populate `team_id` from `users.team_id` on INSERT (so app code doesn't have to set it, and it stays consistent if a user is reassigned).

The migration is idempotent (`IF NOT EXISTS` / `DROP POLICY IF EXISTS` patterns) so it can be re-run safely against the production DB.

## Testing

- **Migration dry-run on a Supabase branch DB.** Apply `010_add_teams.sql`, verify: all existing users end up in CORE; all existing orders carry `team_id = CORE`; `settings['tony_phone']` is gone and `teams[CORE].vendor_phone` matches; existing admin can still see everything.
- **RLS regression scripts** (psql, committed to `scripts/test/rls_teams.sql`): impersonate three role types — member of BLUE, team-admin of BLUE, super-admin — and verify each can/can't read/write the rows in the matrix. Critical case: member of BLUE cannot `SELECT` a PURPLE order even with the row ID.
- **Manual browser smoke flows:**
  1. Register a new `@facilization.com` user, pick GREEN, place a Friday order. Confirm a BLUE member cannot see it.
  2. Promote that user to GREEN team-admin. Confirm they can lock GREEN's orders but not CORE's.
  3. As super-admin, swap a user CORE → ORANGE. Confirm their existing order's `team_id` updates via the trigger.
  4. Post in both global chat and team chat. Confirm scoping in both directions and from both sides.
- **No new test framework introduced** — repo has no test suite today and adding one is out of scope. Smoke flows + RLS scripts are proportional.

## Out of Scope

- Per-team menu (menu stays global).
- Cross-team analytics dashboards beyond per-team counts.
- Multi-team membership or an "active team" switcher.
- Per-team whitelist rules (domain rule covers it).
- Vendor integrations beyond existing wa.me / SMS link generation.
- New automated test framework.

## Risks & Open Items

- **Trigger correctness:** the `orders.team_id` auto-fill trigger must run on every INSERT and on UPDATE-of-user_id. Verify with the smoke flow that user reassignment carries orders.
- **RLS policy drift:** every new query path must respect the matrix. The plan includes an audit pass over `/api/**` routes during implementation.
- **`/auth/check-email` and existing routes:** changes to `handle_new_user()` must not break the existing flow for users who registered before teams existed (defensive CORE fallback handles this).
- **Team color tokens:** colors should be picked once and made theme-aware (dark/light); document them in the seed migration.
