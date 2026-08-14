// The after-lunch coffee run.
//
// Lunch is Tony's (or whichever vendor the team drew this Friday). The coffee is
// somewhere else, walked to afterwards — so the point of this module is letting
// eleven people settle the round *before* they're standing at the bar shouting
// over each other.
//
// Single source of truth for the option list: the order form, the prompt modal,
// the team tally, the admin editor and the CSV all read COFFEE_CHOICES, so
// adding a drink later is a one-line edit here.
//
// Deliberately depends on nothing — no React, no `lib/types` — so it stays
// callable from anywhere and testable with plain objects.

export const COFFEE_NOTE_MAX = 60

/**
 * The things actually handed over the counter. A person picks a *combo*; the
 * bar takes *items* — "six coffees, two waters" is sayable, "four coffees and
 * two coffee-and-waters" is not. Listed in the order you'd read them out.
 */
export const COFFEE_ITEMS = [
  { key: "coffee", emoji: "☕", label: "Coffee", labelSq: "Kafe" },
  { key: "water", emoji: "💧", label: "Water", labelSq: "Ujë" },
  { key: "sparkling", emoji: "🫧", label: "Sparkling Water", labelSq: "Ujë me gaz" },
] as const

export type CoffeeItem = (typeof COFFEE_ITEMS)[number]["key"]

// `items` is what each combo decomposes into, so the bar totals are derived
// rather than maintained by hand. `satisfies` makes a typo in there a compile
// error instead of a silently missing drink.
export const COFFEE_CHOICES = [
  { value: "coffee", emoji: "☕", label: "Coffee", labelSq: "Kafe", items: ["coffee"] },
  { value: "coffee_water", emoji: "☕💧", label: "Coffee + Water", labelSq: "Kafe + Ujë", items: ["coffee", "water"] },
  { value: "coffee_sparkling", emoji: "☕🫧", label: "Coffee + Sparkling Water", labelSq: "Kafe + Ujë me gaz", items: ["coffee", "sparkling"] },
  { value: "water", emoji: "💧", label: "Water", labelSq: "Ujë", items: ["water"] },
  { value: "sparkling", emoji: "🫧", label: "Sparkling Water", labelSq: "Ujë me gaz", items: ["sparkling"] },
  // Free text and the opt-out have nothing countable; "other" is carried
  // through as its own named line instead.
  { value: "other", emoji: "✏️", label: "Something else", labelSq: "Diçka tjetër", items: [] },
  { value: "none", emoji: "—", label: "Not joining", labelSq: "Pa gjë", items: [] },
] as const satisfies readonly {
  value: string
  emoji: string
  label: string
  labelSq: string
  items: readonly CoffeeItem[]
}[]

export type CoffeeChoice = (typeof COFFEE_CHOICES)[number]["value"]
export type CoffeeChoiceOption = (typeof COFFEE_CHOICES)[number]

const OPTION_BY_VALUE = new Map<string, CoffeeChoiceOption>(COFFEE_CHOICES.map((option) => [option.value, option]))

// Normalized to `readonly CoffeeItem[]` on purpose: reading `.items` straight
// off the union of literal option types gives a union of differently-shaped
// tuples, which can't be iterated without a fight.
const ITEMS_BY_CHOICE = new Map<string, readonly CoffeeItem[]>(
  COFFEE_CHOICES.map((option) => [option.value, option.items]),
)

/** The five drinks that actually get carried back — no "other", no "not joining". */
export const CONCRETE_COFFEE_CHOICES = COFFEE_CHOICES.filter(
  (option) => option.value !== "other" && option.value !== "none",
)

export function isCoffeeChoice(value: unknown): value is CoffeeChoice {
  return typeof value === "string" && OPTION_BY_VALUE.has(value)
}

export function getCoffeeOption(value: unknown): CoffeeChoiceOption | null {
  return isCoffeeChoice(value) ? OPTION_BY_VALUE.get(value)! : null
}

/**
 * "☕💧 Coffee + Water" — or the person's own words when they picked "other".
 * Returns null for a choice nobody has made yet, so callers can branch on it.
 */
export function formatCoffeeChoice(choice?: string | null, note?: string | null): string | null {
  const option = getCoffeeOption(choice)
  if (!option) return null

  if (option.value === "other") {
    const trimmed = note?.trim()
    return trimmed ? `${option.emoji} ${trimmed}` : `${option.emoji} ${option.label}`
  }

  return `${option.emoji} ${option.label}`
}

/** Minimal shape the tally needs. `Order` satisfies it structurally. */
export interface CoffeeOrderLike {
  coffee_choice?: string | null
  coffee_note?: string | null
  user?: { name?: string | null; email?: string | null } | null
}

export interface CoffeeTallyRow {
  choice: CoffeeChoice
  emoji: string
  label: string
  labelSq: string
  count: number
}

export interface CoffeeItemRow {
  key: CoffeeItem
  emoji: string
  label: string
  labelSq: string
  count: number
}

export interface CoffeeOtherEntry {
  name: string
  note: string
}

export interface CoffeeTally {
  /**
   * What to ask for at the bar: combos split into their parts, so a
   * Coffee + Water adds one to coffee *and* one to water. Canonical item
   * order, not by count — you read this list out the same way every week.
   * Custom requests can't be decomposed and stay in `others`.
   */
  itemRows: CoffeeItemRow[]
  /** Countable picks, most wanted first. Excludes "other" and "not joining". */
  rows: CoffeeTallyRow[]
  /** Listed one by one on purpose — merging away a custom request defeats it. */
  others: CoffeeOtherEntry[]
  notJoining: string[]
  stillDeciding: string[]
  /** Answered anything at all, "not joining" included. */
  decidedCount: number
  /** People with a lunch order, i.e. everyone who could answer. */
  totalCount: number
  /** People getting something. Not the drink count — combos are two items. */
  joiningCount: number
  /** Individual drinks to carry back, custom requests included. */
  itemCount: number
}

function displayName(order: CoffeeOrderLike): string {
  return order.user?.name?.trim() || order.user?.email?.trim() || "—"
}

export function summarizeCoffee(orders: CoffeeOrderLike[]): CoffeeTally {
  const counts = new Map<CoffeeChoice, number>()
  const itemCounts = new Map<CoffeeItem, number>()
  const others: CoffeeOtherEntry[] = []
  const notJoining: string[] = []
  const stillDeciding: string[] = []

  orders.forEach((order) => {
    const name = displayName(order)

    if (!isCoffeeChoice(order.coffee_choice)) {
      stillDeciding.push(name)
      return
    }
    if (order.coffee_choice === "none") {
      notJoining.push(name)
      return
    }
    if (order.coffee_choice === "other") {
      others.push({ name, note: order.coffee_note?.trim() || "" })
      return
    }

    counts.set(order.coffee_choice, (counts.get(order.coffee_choice) ?? 0) + 1)

    // One combo can add two items — this is where "4 coffees + 2 combos"
    // becomes the "6 coffees, 2 waters" you can say out loud.
    const items = ITEMS_BY_CHOICE.get(order.coffee_choice) ?? []
    items.forEach((item) => itemCounts.set(item, (itemCounts.get(item) ?? 0) + 1))
  })

  // Built in canonical order first, so the stable sort below leaves ties
  // reading in menu order rather than whatever the orders happened to arrive in.
  const rows: CoffeeTallyRow[] = CONCRETE_COFFEE_CHOICES.filter((option) => counts.has(option.value))
    .map((option) => ({
      choice: option.value,
      emoji: option.emoji,
      label: option.label,
      labelSq: option.labelSq,
      count: counts.get(option.value)!,
    }))
    .sort((a, b) => b.count - a.count)

  const itemRows: CoffeeItemRow[] = COFFEE_ITEMS.filter((item) => itemCounts.has(item.key)).map((item) => ({
    key: item.key,
    emoji: item.emoji,
    label: item.label,
    labelSq: item.labelSq,
    count: itemCounts.get(item.key)!,
  }))

  return {
    itemRows,
    rows,
    others,
    notJoining,
    stillDeciding,
    decidedCount: orders.length - stillDeciding.length,
    totalCount: orders.length,
    joiningCount: rows.reduce((sum, row) => sum + row.count, 0) + others.length,
    itemCount: itemRows.reduce((sum, row) => sum + row.count, 0) + others.length,
  }
}

/**
 * True when at least one pick bundles two items, which is exactly when the
 * per-person breakdown says something the bar order doesn't. Shared by the
 * summary card and the copy payload so they never disagree.
 */
export function hasCoffeeCombos(tally: CoffeeTally): boolean {
  return tally.rows.some((row) => (ITEMS_BY_CHOICE.get(row.choice)?.length ?? 0) > 1)
}

/**
 * The list to paste into WhatsApp or read out at the bar. Albanian, matching
 * the vendor message the admin panel already sends.
 */
export function buildCoffeeRunMessage(tally: CoffeeTally): string {
  if (tally.joiningCount === 0) {
    return tally.decidedCount > 0
      ? "Asnjë kafe këtë javë — nuk po vjen njeri."
      : "Asnjë porosi kafeje deri tani."
  }

  const lines: string[] = [
    `Kafe pas buke — ${tally.itemCount} pije për ${tally.joiningCount} veta.`,
    "",
    "Për të porositur:",
    ...tally.itemRows.map((row) => `• ${row.labelSq}: ${row.count}`),
    ...tally.others.map((entry) => `• ${entry.name}: ${entry.note || "diçka tjetër"}`),
  ]

  // The per-person breakdown only earns its lines when somebody took a combo;
  // otherwise it repeats the order list verbatim.
  if (hasCoffeeCombos(tally)) {
    lines.push("", "Sipas personit:", ...tally.rows.map((row) => `• ${row.labelSq}: ${row.count}`))
  }

  if (tally.stillDeciding.length > 0) {
    lines.push("", `Pa vendosur: ${tally.stillDeciding.join(", ")}`)
  }

  return lines.join("\n")
}
