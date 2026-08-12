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

export const COFFEE_CHOICES = [
  { value: "coffee", emoji: "☕", label: "Coffee", labelSq: "Kafe" },
  { value: "coffee_water", emoji: "☕💧", label: "Coffee + Water", labelSq: "Kafe + Ujë" },
  { value: "coffee_sparkling", emoji: "☕🫧", label: "Coffee + Sparkling Water", labelSq: "Kafe + Ujë me gaz" },
  { value: "water", emoji: "💧", label: "Water", labelSq: "Ujë" },
  { value: "sparkling", emoji: "🫧", label: "Sparkling Water", labelSq: "Ujë me gaz" },
  { value: "other", emoji: "✏️", label: "Something else", labelSq: "Diçka tjetër" },
  { value: "none", emoji: "—", label: "Not joining", labelSq: "Pa gjë" },
] as const

export type CoffeeChoice = (typeof COFFEE_CHOICES)[number]["value"]
export type CoffeeChoiceOption = (typeof COFFEE_CHOICES)[number]

const OPTION_BY_VALUE = new Map<string, CoffeeChoiceOption>(COFFEE_CHOICES.map((option) => [option.value, option]))

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

export interface CoffeeOtherEntry {
  name: string
  note: string
}

export interface CoffeeTally {
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
  /** Drinks to actually order. */
  joiningCount: number
}

function displayName(order: CoffeeOrderLike): string {
  return order.user?.name?.trim() || order.user?.email?.trim() || "—"
}

export function summarizeCoffee(orders: CoffeeOrderLike[]): CoffeeTally {
  const counts = new Map<CoffeeChoice, number>()
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

  return {
    rows,
    others,
    notJoining,
    stillDeciding,
    decidedCount: orders.length - stillDeciding.length,
    totalCount: orders.length,
    joiningCount: rows.reduce((sum, row) => sum + row.count, 0) + others.length,
  }
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
    `Kafe pas buke — ${tally.joiningCount} porosi:`,
    "",
    ...tally.rows.map((row) => `• ${row.labelSq}: ${row.count}`),
    ...tally.others.map((entry) => `• ${entry.name}: ${entry.note || "diçka tjetër"}`),
  ]

  if (tally.stillDeciding.length > 0) {
    lines.push("", `Pa vendosur: ${tally.stillDeciding.join(", ")}`)
  }

  return lines.join("\n")
}
