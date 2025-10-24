import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

async function requireAdmin(request: NextRequest) {
  const supabase = await createClient()
  const admin = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const { data: profile } = await admin
    .from("users")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle()

  if (profile?.role !== "admin") {
    return { errorResponse: NextResponse.json({ error: "Admin access required" }, { status: 403 }) }
  }

  return { admin, actorId: user.id }
}

export async function PATCH(request: NextRequest) {
  try {
    const result = await requireAdmin(request)
    if ("errorResponse" in result) return result.errorResponse

    const { admin, actorId } = result

    const { id, active } = await request.json()

    if (!id || typeof active !== "boolean") {
      return NextResponse.json({ error: "id and active are required" }, { status: 400 })
    }

    const { error } = await admin.from("menu_items").update({ active }).eq("id", id)

    if (error) {
      console.error("Admin menu update failed:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await admin.from("events").insert({
      type: active ? "menu_item_enabled" : "menu_item_disabled",
      user_id: actorId,
      payload: { menu_item_id: id, active },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Admin menu PATCH error:", error)
    return NextResponse.json({ error: "Failed to update menu item" }, { status: 500 })
  }
}
