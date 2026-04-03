import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

const DEFAULT_DAY_OF_WEEK = 5

function parseDayOfWeek(value: string | null | undefined): number {
  const parsed = Number(value)
  if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 6) {
    return parsed
  }
  return DEFAULT_DAY_OF_WEEK
}

function nextDateStringForDay(dayOfWeek: number): string {
  const now = new Date()
  const day = now.getDay()
  const add = (dayOfWeek - day + 7) % 7
  const target = new Date(now)
  target.setDate(now.getDate() + add)
  target.setHours(0, 0, 0, 0)
  return target.toISOString().split("T")[0]
}

async function getCurrentOrderDateString(adminClient: ReturnType<typeof createAdminClient>): Promise<string> {
  try {
    const { data, error } = await adminClient
      .from("settings")
      .select("value")
      .eq("key", "ordering_day_of_week")
      .maybeSingle()

    if (error) {
      console.warn("Falling back to default ordering day due to settings query error:", error.message)
      return nextDateStringForDay(DEFAULT_DAY_OF_WEEK)
    }

    const dayOfWeek = parseDayOfWeek((data?.value as string | null | undefined) ?? undefined)
    return nextDateStringForDay(dayOfWeek)
  } catch (error) {
    console.error("Failed to resolve ordering day from settings:", error)
    return nextDateStringForDay(DEFAULT_DAY_OF_WEEK)
  }
}

async function requireAdmin(request: NextRequest) {
  const supabase = await createClient()
  const admin = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const { data: profile, error } = await admin.from("users").select("id, role").eq("id", user.id).maybeSingle()

  if (error || profile?.role !== "admin") {
    return { errorResponse: NextResponse.json({ error: "Admin access required" }, { status: 403 }) }
  }

  return { admin, userId: user.id }
}

function normalizeCashAvailableAll(value: unknown): number | null {
  if (value == null || value === "") {
    return 0
  }

  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null
  }

  return parsed
}

export async function GET(request: NextRequest) {
  try {
    const result = await requireAdmin(request)
    if ("errorResponse" in result) return result.errorResponse

    const { admin } = result

    const url = new URL(request.url)
    const requestedDate = url.searchParams.get("fridayDate")
    const fridayDate = requestedDate ?? (await getCurrentOrderDateString(admin))

    const [ordersResult, eventsResult, menuResult, usersResult] = await Promise.all([
      admin
        .from("orders")
        .select("*, user:users(id, name, email, phone)")
        .eq("friday_date", fridayDate)
        .order("created_at"),
      admin
        .from("events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
      admin.from("menu_items").select("*").order("item, variant"),
      admin
        .from("users")
        .select("id, name, email, phone, role, whitelisted, created_at, updated_at")
        .order("created_at", { ascending: false }),
    ])

    return NextResponse.json({
      fridayDate,
      orders: ordersResult.data ?? [],
      events: eventsResult.data ?? [],
      menuItems: menuResult.data ?? [],
      users: usersResult.data ?? [],
    })
  } catch (error) {
    console.error("Admin orders GET error:", error)
    return NextResponse.json({ error: "Failed to load admin data" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const result = await requireAdmin(request)
    if ("errorResponse" in result) return result.errorResponse

    const { admin } = result

    const { user_id, item, variant, notes, friday_date, cash_available_all } = await request.json()

    if (!user_id || !item || !variant) {
      return NextResponse.json({ error: "user_id, item, and variant are required" }, { status: 400 })
    }

    const normalizedCashAvailableAll = normalizeCashAvailableAll(cash_available_all)
    if (normalizedCashAvailableAll == null) {
      return NextResponse.json({ error: "cash_available_all must be a non-negative whole number" }, { status: 400 })
    }

    const fridayDate = friday_date || (await getCurrentOrderDateString(admin))

    const { data, error } = await admin
      .from("orders")
      .insert({
        user_id,
        item,
        variant,
        notes: notes?.trim() || null,
        cash_available_all: normalizedCashAvailableAll,
        friday_date: fridayDate,
      })
      .select("*, user:users(id, name, email, phone)")
      .single()

    if (error) {
      console.error("Admin order insert failed:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ order: data })
  } catch (error) {
    console.error("Admin orders POST error:", error)
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const result = await requireAdmin(request)
    if ("errorResponse" in result) return result.errorResponse

    const { admin } = result

    const { id, updates } = await request.json()

    if (!id || !updates) {
      return NextResponse.json({ error: "id and updates are required" }, { status: 400 })
    }

    if (Object.prototype.hasOwnProperty.call(updates, "cash_available_all")) {
      const normalizedCashAvailableAll = normalizeCashAvailableAll(updates.cash_available_all)
      if (normalizedCashAvailableAll == null) {
        return NextResponse.json({ error: "cash_available_all must be a non-negative whole number" }, { status: 400 })
      }
      updates.cash_available_all = normalizedCashAvailableAll
    }

    const { data, error } = await admin
      .from("orders")
      .update(updates)
      .eq("id", id)
      .select("*, user:users(id, name, email, phone)")
      .single()

    if (error) {
      console.error("Admin order update failed:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ order: data })
  } catch (error) {
    console.error("Admin orders PATCH error:", error)
    return NextResponse.json({ error: "Failed to update order" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const result = await requireAdmin(request)
    if ("errorResponse" in result) return result.errorResponse

    const { admin } = result

    const url = new URL(request.url)
    const id = url.searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 })
    }

    const { error } = await admin.from("orders").delete().eq("id", id)

    if (error) {
      console.error("Admin order delete failed:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Admin orders DELETE error:", error)
    return NextResponse.json({ error: "Failed to delete order" }, { status: 500 })
  }
}
