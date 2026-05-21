import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireSuperAdmin, isErrorResponse } from "@/lib/supabase/auth-helpers"

// GET: list all teams. Any authenticated user can read (matches RLS).
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("teams")
    .select("id, slug, name, color, active, ordering_day_of_week, vendor_phone, created_at, updated_at")
    .order("slug")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ teams: data ?? [] })
}

// POST: create a new team. Super-admin only.
export async function POST(request: NextRequest) {
  const gate = await requireSuperAdmin()
  if (isErrorResponse(gate)) return gate.errorResponse

  const { slug, name, color, ordering_day_of_week, vendor_phone } = await request.json()
  if (!slug || !name || !color) {
    return NextResponse.json({ error: "slug, name, and color are required" }, { status: 400 })
  }

  const cleanSlug = String(slug).trim().toUpperCase()
  if (!/^[A-Z][A-Z0-9_]{0,31}$/.test(cleanSlug)) {
    return NextResponse.json({ error: "slug must be uppercase letters, digits or underscore" }, { status: 400 })
  }

  const { data, error } = await gate.admin
    .from("teams")
    .insert({
      slug: cleanSlug,
      name: String(name).trim(),
      color: String(color).trim(),
      ordering_day_of_week: typeof ordering_day_of_week === "number" ? ordering_day_of_week : 5,
      vendor_phone: vendor_phone?.toString().trim() || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await gate.admin.from("events").insert({
    type: "team_created",
    user_id: gate.actorId,
    payload: { team_id: data.id, slug: cleanSlug },
  })

  return NextResponse.json({ team: data })
}

// PATCH: update a team (settings, color, name, active flag, vendor_phone, ordering_day).
// Super-admin: any team. Team-admin: only their team.
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createAdminClient()
  const { id, updates } = await request.json()
  if (!id || !updates) return NextResponse.json({ error: "id and updates required" }, { status: 400 })

  const { data: profile } = await admin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  const isSuper = profile?.role === "admin"

  if (!isSuper) {
    const { data: ta } = await admin
      .from("team_admins")
      .select("team_id")
      .eq("user_id", user.id)
      .maybeSingle()
    if (!ta || ta.team_id !== id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  // Restrict the columns team-admins can touch.
  const safeUpdates: Record<string, unknown> = {}
  const allowedForTeamAdmin = new Set(["ordering_day_of_week", "vendor_phone"])
  const allowedForSuper = new Set([...allowedForTeamAdmin, "name", "color", "active", "slug"])
  const allowed = isSuper ? allowedForSuper : allowedForTeamAdmin

  for (const [k, v] of Object.entries(updates as Record<string, unknown>)) {
    if (allowed.has(k)) safeUpdates[k] = v
  }

  if (Object.keys(safeUpdates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
  }

  if (typeof safeUpdates.ordering_day_of_week === "number") {
    const d = safeUpdates.ordering_day_of_week
    if (!Number.isInteger(d) || d < 0 || d > 6) {
      return NextResponse.json({ error: "ordering_day_of_week must be 0-6" }, { status: 400 })
    }
  }

  const { data, error } = await admin
    .from("teams")
    .update(safeUpdates)
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await admin.from("events").insert({
    type: "team_updated",
    user_id: user.id,
    payload: { team_id: id, updates: safeUpdates },
  })

  return NextResponse.json({ team: data })
}

// DELETE: soft-delete (set active=false). Super-admin only. CORE cannot be deleted.
export async function DELETE(request: NextRequest) {
  const gate = await requireSuperAdmin()
  if (isErrorResponse(gate)) return gate.errorResponse

  const url = new URL(request.url)
  const id = url.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { data: team } = await gate.admin.from("teams").select("slug").eq("id", id).maybeSingle()
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 })
  if (team.slug === "CORE") {
    return NextResponse.json({ error: "CORE cannot be deactivated" }, { status: 400 })
  }

  const { count } = await gate.admin
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("team_id", id)

  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: "Move members to another team before deactivating" }, { status: 400 })
  }

  const { error } = await gate.admin.from("teams").update({ active: false }).eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await gate.admin.from("events").insert({
    type: "team_deactivated",
    user_id: gate.actorId,
    payload: { team_id: id, slug: team.slug },
  })

  return NextResponse.json({ success: true })
}
