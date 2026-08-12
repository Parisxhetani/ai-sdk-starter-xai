import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireTeamAdmin, isErrorResponse } from "@/lib/supabase/auth-helpers"
import { COFFEE_NOTE_MAX, isCoffeeChoice, type CoffeeChoice } from "@/lib/coffee"

const DEFAULT_DAY_OF_WEEK = 5

const COFFEE_ERROR = 'coffee_choice must be a known option, and "other" requires a note'

function nextDateStringForDay(dayOfWeek: number): string {
  const now = new Date()
  const day = now.getDay()
  const add = (dayOfWeek - day + 7) % 7
  const target = new Date(now)
  target.setDate(now.getDate() + add)
  target.setHours(0, 0, 0, 0)
  return target.toISOString().split("T")[0]
}

async function resolveOrderingDateForTeam(
  admin: ReturnType<typeof createAdminClient>,
  teamId: string,
): Promise<string> {
  const { data } = await admin
    .from("teams")
    .select("ordering_day_of_week")
    .eq("id", teamId)
    .maybeSingle()
  const day = data?.ordering_day_of_week
  const safe = Number.isInteger(day) && day! >= 0 && day! <= 6 ? day! : DEFAULT_DAY_OF_WEEK
  return nextDateStringForDay(safe)
}

function normalizeCashAvailableAll(value: unknown): number | null {
  if (value == null || value === "") return 0
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) return null
  return parsed
}

type CoffeeFields = { coffee_choice: CoffeeChoice | null; coffee_note: string | null }

/**
 * The two coffee columns only make sense as a pair, so they're normalized as
 * one — mirroring the orders_coffee_note_matches_choice DB constraint.
 * Returns null when the input can't be made valid.
 */
function normalizeCoffee(choice: unknown, note: unknown): CoffeeFields | null {
  if (choice == null || choice === "") return { coffee_choice: null, coffee_note: null }
  if (!isCoffeeChoice(choice)) return null

  if (choice === "other") {
    const trimmed = typeof note === "string" ? note.trim() : ""
    if (!trimmed) return null
    return { coffee_choice: "other", coffee_note: trimmed.slice(0, COFFEE_NOTE_MAX) }
  }

  return { coffee_choice: choice, coffee_note: null }
}

function resolveTargetTeam(url: URL, gate: { role: string; teamAdminFor: string | null; teamId: string }): string | null {
  const fromQuery = url.searchParams.get("teamId")
  if (fromQuery) return fromQuery
  if (gate.role === "team-admin" && gate.teamAdminFor) return gate.teamAdminFor
  if (gate.role === "super-admin") return null
  return gate.teamId
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const requestedTeam = url.searchParams.get("teamId")

  const gate = await requireTeamAdmin(requestedTeam)
  if (isErrorResponse(gate)) return gate.errorResponse

  const { admin } = gate
  const targetTeam = resolveTargetTeam(url, gate)

  const requestedDate = url.searchParams.get("fridayDate")
  const fridayDate =
    requestedDate ?? (targetTeam ? await resolveOrderingDateForTeam(admin, targetTeam) : nextDateStringForDay(DEFAULT_DAY_OF_WEEK))

  // Build orders query — filter by team unless super-admin asked for ALL
  let ordersQuery = admin
    .from("orders")
    .select("*, user:users(id, name, email, phone, team_id)")
    .eq("friday_date", fridayDate)
    .order("created_at")

  if (targetTeam) ordersQuery = ordersQuery.eq("team_id", targetTeam)

  let usersQuery = admin
    .from("users")
    .select("id, name, email, phone, role, whitelisted, team_id, created_at, updated_at")
    .order("created_at", { ascending: false })

  if (targetTeam) usersQuery = usersQuery.eq("team_id", targetTeam)

  let eventsQuery = admin.from("events").select("*").order("created_at", { ascending: false }).limit(50)
  if (targetTeam) {
    // Limit events to ones authored by members of this team.
    const { data: teamUserIds } = await admin.from("users").select("id").eq("team_id", targetTeam)
    const ids = (teamUserIds ?? []).map((u) => u.id)
    if (ids.length) eventsQuery = eventsQuery.in("user_id", ids)
  }

  const [ordersResult, eventsResult, menuResult, usersResult] = await Promise.all([
    ordersQuery,
    eventsQuery,
    admin.from("menu_items").select("*").order("item, variant"),
    usersQuery,
  ])

  return NextResponse.json({
    fridayDate,
    teamId: targetTeam,
    orders: ordersResult.data ?? [],
    events: eventsResult.data ?? [],
    menuItems: menuResult.data ?? [],
    users: usersResult.data ?? [],
  })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const {
    user_id,
    item,
    variant,
    notes,
    friday_date,
    cash_available_all,
    coffee_choice,
    coffee_note,
    team_id: requestTeamId,
  } = body

  if (!user_id || !item || !variant) {
    return NextResponse.json({ error: "user_id, item, and variant are required" }, { status: 400 })
  }

  // Resolve team from the target user, then gate the caller against that team.
  const probe = await requireTeamAdmin(null)
  if (isErrorResponse(probe)) return probe.errorResponse

  const { data: targetUser } = await probe.admin
    .from("users")
    .select("id, team_id")
    .eq("id", user_id)
    .maybeSingle()
  if (!targetUser) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const effectiveTeam = requestTeamId ?? targetUser.team_id

  if (probe.role === "team-admin" && probe.teamAdminFor !== effectiveTeam) {
    return NextResponse.json({ error: "Forbidden for this team" }, { status: 403 })
  }

  const normalizedCashAvailableAll = normalizeCashAvailableAll(cash_available_all)
  if (normalizedCashAvailableAll == null) {
    return NextResponse.json({ error: "cash_available_all must be a non-negative whole number" }, { status: 400 })
  }

  const coffee = normalizeCoffee(coffee_choice, coffee_note)
  if (coffee == null) {
    return NextResponse.json({ error: COFFEE_ERROR }, { status: 400 })
  }

  const fridayDate = friday_date || (await resolveOrderingDateForTeam(probe.admin, effectiveTeam))

  const { data, error } = await probe.admin
    .from("orders")
    .insert({
      user_id,
      team_id: effectiveTeam,
      item,
      variant,
      notes: notes?.trim() || null,
      cash_available_all: normalizedCashAvailableAll,
      ...coffee,
      friday_date: fridayDate,
    })
    .select("*, user:users(id, name, email, phone, team_id)")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ order: data })
}

export async function PATCH(request: NextRequest) {
  const { id, updates } = await request.json()
  if (!id || !updates) return NextResponse.json({ error: "id and updates are required" }, { status: 400 })

  const probe = await requireTeamAdmin(null)
  if (isErrorResponse(probe)) return probe.errorResponse

  const { data: target } = await probe.admin.from("orders").select("team_id").eq("id", id).maybeSingle()
  if (!target) return NextResponse.json({ error: "Order not found" }, { status: 404 })

  if (probe.role === "team-admin" && probe.teamAdminFor !== target.team_id) {
    return NextResponse.json({ error: "Forbidden for this team" }, { status: 403 })
  }

  // never let updates change team_id directly here
  if (Object.prototype.hasOwnProperty.call(updates, "team_id")) {
    delete updates.team_id
  }

  if (Object.prototype.hasOwnProperty.call(updates, "cash_available_all")) {
    const normalized = normalizeCashAvailableAll(updates.cash_available_all)
    if (normalized == null) {
      return NextResponse.json({ error: "cash_available_all must be a non-negative whole number" }, { status: 400 })
    }
    updates.cash_available_all = normalized
  }

  // Both coffee columns travel together — accepting a lone note would either
  // wipe the choice or break the DB constraint.
  const hasCoffeeChoice = Object.prototype.hasOwnProperty.call(updates, "coffee_choice")
  const hasCoffeeNote = Object.prototype.hasOwnProperty.call(updates, "coffee_note")

  if (hasCoffeeNote && !hasCoffeeChoice) {
    return NextResponse.json({ error: "coffee_note must be sent together with coffee_choice" }, { status: 400 })
  }

  if (hasCoffeeChoice) {
    const coffee = normalizeCoffee(updates.coffee_choice, updates.coffee_note)
    if (coffee == null) {
      return NextResponse.json({ error: COFFEE_ERROR }, { status: 400 })
    }
    updates.coffee_choice = coffee.coffee_choice
    updates.coffee_note = coffee.coffee_note
  }

  const { data, error } = await probe.admin
    .from("orders")
    .update(updates)
    .eq("id", id)
    .select("*, user:users(id, name, email, phone, team_id)")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ order: data })
}

export async function DELETE(request: NextRequest) {
  const url = new URL(request.url)
  const id = url.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

  const probe = await requireTeamAdmin(null)
  if (isErrorResponse(probe)) return probe.errorResponse

  const { data: target } = await probe.admin.from("orders").select("team_id").eq("id", id).maybeSingle()
  if (!target) return NextResponse.json({ error: "Order not found" }, { status: 404 })

  if (probe.role === "team-admin" && probe.teamAdminFor !== target.team_id) {
    return NextResponse.json({ error: "Forbidden for this team" }, { status: 403 })
  }

  const { error } = await probe.admin.from("orders").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
