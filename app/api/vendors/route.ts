import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireSuperAdmin, isErrorResponse } from "@/lib/supabase/auth-helpers"

// GET: list all vendors (any authenticated user)
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("vendors")
    .select("id, slug, name, icon, color, active, created_at, updated_at")
    .order("slug")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ vendors: data ?? [] })
}

// POST: create a vendor. Super-admin only.
export async function POST(request: NextRequest) {
  const gate = await requireSuperAdmin()
  if (isErrorResponse(gate)) return gate.errorResponse

  const { slug, name, icon, color } = await request.json()
  if (!slug || !name) return NextResponse.json({ error: "slug and name required" }, { status: 400 })

  const cleanSlug = String(slug).trim().toUpperCase()
  if (!/^[A-Z][A-Z0-9_]{0,31}$/.test(cleanSlug)) {
    return NextResponse.json({ error: "slug must be uppercase letters/digits/underscore" }, { status: 400 })
  }

  const { data, error } = await gate.admin
    .from("vendors")
    .insert({
      slug: cleanSlug,
      name: String(name).trim(),
      icon: (icon?.toString().trim() || "🍽️"),
      color: (color?.toString().trim() || "#64748b"),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await gate.admin.from("events").insert({
    type: "vendor_created",
    user_id: gate.actorId,
    payload: { vendor_id: data.id, slug: cleanSlug },
  })

  return NextResponse.json({ vendor: data })
}

// PATCH: edit a vendor (name, icon, color, active). Super-admin only.
export async function PATCH(request: NextRequest) {
  const gate = await requireSuperAdmin()
  if (isErrorResponse(gate)) return gate.errorResponse

  const { id, updates } = await request.json()
  if (!id || !updates) return NextResponse.json({ error: "id and updates required" }, { status: 400 })

  const allowed = new Set(["name", "icon", "color", "active"])
  const safeUpdates: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(updates as Record<string, unknown>)) {
    if (allowed.has(k)) safeUpdates[k] = v
  }
  if (Object.keys(safeUpdates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
  }

  const { data, error } = await gate.admin
    .from("vendors")
    .update(safeUpdates)
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await gate.admin.from("events").insert({
    type: "vendor_updated",
    user_id: gate.actorId,
    payload: { vendor_id: id, updates: safeUpdates },
  })

  return NextResponse.json({ vendor: data })
}
