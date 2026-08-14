# After-Lunch Coffee Run — Design

**Date:** 2026-08-12
**Status:** Implemented

## Problem

Lunch is ordered through the portal from one vendor (Tony's, or whichever vendor
the team drew that Friday). Afterwards the team walks to a *different* place for
coffee. At 11+ people, taking that second order on the spot doesn't work —
everyone decides at once, nobody hears anybody, and the round takes ten minutes.

Deciding earlier fixes it. The portal already has everyone's attention at the
moment they order lunch, so that's where the coffee round gets settled.

## Options

Every teammate picks one of:

| Value | Label |
| --- | --- |
| `coffee` | ☕ Coffee |
| `coffee_water` | ☕💧 Coffee + Water |
| `coffee_sparkling` | ☕🫧 Coffee + Sparkling Water |
| `water` | 💧 Water |
| `sparkling` | 🫧 Sparkling Water |
| `other` | ✏️ Something else (free text, ≤60 chars) |
| `none` | — Not joining |

`NULL` is a real state and means **still deciding**, distinct from `none`
(**decided not to join**). Without that split the tally can't honestly say
"9 of 11 decided", and there's no way to know who to chase.

## Decisions

1. **Prompted by a modal right after the lunch order saves** — not an inline
   form field. The ask arrives at the moment of highest attention, and a field
   in a long form is too easy to scroll past. Reopenable afterwards from a strip
   in the order card, so the modal is the *only* place the picker is rendered.
2. **`none` is an explicit stored option**, per above.
3. **The tally lives inside the Team Orders card**, under "Who's eating" — the
   card that's already the team's shared view, and visible to everyone rather
   than admins only, since whoever walks to the bar isn't necessarily an admin.
4. **Coffee locks when lunch locks.** One window, one rule. Deciding *inside*
   the window is the entire point of the feature, so a second independent
   deadline would buy nothing and cost an extra enable/disable rule in three
   places.

## Two levels of counting

A person picks a *combo*; the bar takes *items*. "Four coffees and two
coffee-and-waters" isn't sayable at a counter — "six coffees, two waters" is.

So each entry in `COFFEE_CHOICES` declares what it decomposes into via an
`items` field, and the item totals are **derived** rather than maintained
separately:

| Combo | Items |
| --- | --- |
| `coffee` | coffee |
| `coffee_water` | coffee + water |
| `coffee_sparkling` | coffee + sparkling |
| `water` | water |
| `sparkling` | sparkling |
| `other`, `none` | — |

The `satisfies readonly {…, items: readonly CoffeeItem[]}[]` clause on
`COFFEE_CHOICES` makes a typo in an `items` array a compile error instead of a
silently missing drink.

Consequences worth stating, since conflating them is the easy bug:

- `joiningCount` counts **people** getting something.
- `itemCount` counts **drinks** to carry back. It's larger whenever anyone took
  a combo.
- Item totals appear in canonical order (coffee, water, sparkling), never by
  count, so the list reads the same way every week.
- `other` can't be decomposed, so each custom request stays its own named line
  in the bar order.

The per-person combo breakdown is only rendered when `hasCoffeeCombos()` is
true — with no combos present it would repeat the bar order verbatim. The card
and the copy payload share that one predicate so they can't disagree.

## Data model

Two nullable columns on `orders` (`scripts/014_add_order_coffee_choice.sql`):

```sql
coffee_choice TEXT NULL   -- the vocabulary above
coffee_note   TEXT NULL   -- only when coffee_choice = 'other'
```

Riding on the order row rather than a new table is right because the grain
already matches exactly — `orders` is `UNIQUE(user_id, friday_date)`, one row
per person per Friday. That inherits the team RLS policies, the realtime
subscription and every admin fetch for free.

Two CHECK constraints: one pins the vocabulary, one enforces that `coffee_note`
is non-blank exactly when the choice is `other` and NULL otherwise. The second
is written as a `CASE` rather than a boolean `OR` chain, because a CHECK
constraint passes on NULL as well as TRUE — an `OR` form evaluates to NULL when
`coffee_choice` is NULL and would silently admit a note with no choice attached.

**Known limitation:** no lunch order means no coffee slot. Somebody skipping
lunch but joining for coffee can't register. Left alone deliberately until it
actually happens.

## Components

- **`lib/coffee.ts`** — single source of truth. The option list, `formatCoffeeChoice`,
  `summarizeCoffee` (counts, named custom requests, not-joining, still-deciding)
  and `buildCoffeeRunMessage` (the Copy payload). Depends on nothing — no React,
  not even `lib/types` — so it's callable anywhere and testable with plain objects.
  Adding a drink later is a one-line edit in `COFFEE_CHOICES`.
- **`components/coffee-run-prompt.tsx`** — the modal. Tapping any of the five
  drinks saves and closes in one action; only `other` needs a second step.
- **`components/coffee-run-summary.tsx`** — the tally, in two blocks answering
  two different questions: **To order at the bar** (item totals, styled as the
  primary list, because it's the actionable one) and **Who picked what** (combos,
  muted, for handing the tray out). Plus the Copy button. Kept out of
  `ordering-interface.tsx`, which is already ~1500 lines.
- **`components/ordering-interface.tsx`** — owns the state, the strip, and
  `handleSaveCoffee`, the single write path for these two columns. It targets the
  row by `(user_id, friday_date)` rather than `currentOrder.id`, so it works in
  the window right after an insert when `currentOrder` hasn't been refetched yet.

## Outputs

The coffee is a different place from the lunch vendor, so it never enters the
Tony's WhatsApp message — that stays lunch-only. The coffee list travels via the
Copy button on the tally, in Albanian to match the existing vendor message —
leading with the bar order (`Për të porositur`) and only then the per-person
breakdown (`Sipas personit`). The admin CSV gains a per-order Coffee column plus
a standalone Coffee Run block carrying both levels, and the print sheet gains an
"After Lunch" column.

The Chrome extension (`extension/popup.*`) also writes orders, so it gets the
same field — otherwise its rows would read as permanently "still deciding" and
quietly dent the count. It's plain JS with no bundler and can't import from
`lib/`, so `COFFEE_CHOICES` is mirrored there by hand with a comment saying so.

## Verification

The repo has no test framework, so: `next build` for compile and typecheck (the
three pre-existing `@types/react` errors in `theme-provider.tsx`, `ui/badge.tsx`
and `ui/button.tsx` are unrelated and present on a clean tree), plus the pure
logic in `lib/coffee.ts` exercised directly — an 11-person tally, every combo's
decomposition one at a time, item totals checked against an independent
recomputation, drinks-vs-people never conflated, canonical item ordering,
count-tie ordering, suppression of the redundant breakdown, empty and
all-declined edges, unknown column values, and the copy payload text.
