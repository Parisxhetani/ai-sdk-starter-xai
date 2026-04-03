import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

const DEFAULT_RESET_PASSWORD = "!Tirana1"

async function requireAdmin() {
  const supabase = await createClient()
  const adminSupabase = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const { data: userProfile } = await adminSupabase
    .from("users")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle()

  if (userProfile?.role !== "admin") {
    return { errorResponse: NextResponse.json({ error: "Admin access required" }, { status: 403 }) }
  }

  return { adminSupabase, actorId: user.id, actorRole: userProfile.role }
}

async function getTargetUser(adminSupabase: ReturnType<typeof createAdminClient>, userId: string) {
  const { data: targetUser, error } = await adminSupabase
    .from("users")
    .select("id, name, email, role")
    .eq("id", userId)
    .maybeSingle()

  if (error) throw error

  return targetUser
}

async function ensureAnotherAdminRemains(adminSupabase: ReturnType<typeof createAdminClient>) {
  const { count, error } = await adminSupabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin")

  if (error) throw error

  if ((count ?? 0) <= 1) {
    return NextResponse.json({ error: "You must keep at least one admin user." }, { status: 400 })
  }

  return null
}

export async function GET(_request: NextRequest) {
  try {
    const result = await requireAdmin()
    if ("errorResponse" in result) return result.errorResponse

    const { adminSupabase } = result

    const { data: users, error } = await adminSupabase
      .from("users")
      .select("id, name, email, phone, role, whitelisted, created_at, updated_at")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Admin users query failed:", error.message)
      return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 })
    }

    return NextResponse.json({ users: users || [] })
  } catch (error) {
    console.error("Error fetching users:", error)
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { userId, updates } = await request.json()

    if (!userId || !updates) {
      return NextResponse.json({ error: "User ID and updates are required" }, { status: 400 })
    }

    const result = await requireAdmin()
    if ("errorResponse" in result) return result.errorResponse

    const { adminSupabase, actorId, actorRole } = result

    if (userId === actorId && updates.role && updates.role !== actorRole) {
      return NextResponse.json({ error: "Cannot change your own role" }, { status: 400 })
    }

    const targetUser = await getTargetUser(adminSupabase, userId)
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (targetUser.role === "admin" && updates.role && updates.role !== "admin") {
      const guardResponse = await ensureAnotherAdminRemains(adminSupabase)
      if (guardResponse) return guardResponse
    }

    const { data: updatedUser, error } = await adminSupabase
      .from("users")
      .update(updates)
      .eq("id", userId)
      .select("id, name, email, phone, role, whitelisted, created_at, updated_at")
      .single()

    if (error) {
      console.error("Error updating user:", error)
      return NextResponse.json({ error: "Failed to update user" }, { status: 500 })
    }

    await adminSupabase.from("events").insert({
      type: "admin_user_updated",
      user_id: actorId,
      payload: {
        target_user_id: userId,
        target_email: targetUser.email,
        updates,
      },
    })

    return NextResponse.json({ user: updatedUser })
  } catch (error) {
    console.error("Error updating user:", error)
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId, action } = await request.json()

    if (!userId || action !== "reset_password") {
      return NextResponse.json({ error: "A valid user ID and action are required" }, { status: 400 })
    }

    const result = await requireAdmin()
    if ("errorResponse" in result) return result.errorResponse

    const { adminSupabase, actorId } = result

    if (userId === actorId) {
      return NextResponse.json({ error: "You cannot reset your own password from this screen." }, { status: 400 })
    }

    const targetUser = await getTargetUser(adminSupabase, userId)
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const { error } = await adminSupabase.auth.admin.updateUserById(userId, {
      password: DEFAULT_RESET_PASSWORD,
    })

    if (error) {
      console.error("Admin password reset failed:", error)
      return NextResponse.json({ error: "Failed to reset password" }, { status: 500 })
    }

    await adminSupabase.from("events").insert({
      type: "admin_user_password_reset",
      user_id: actorId,
      payload: {
        target_user_id: userId,
        target_email: targetUser.email,
      },
    })

    return NextResponse.json({
      success: true,
      defaultPassword: DEFAULT_RESET_PASSWORD,
    })
  } catch (error) {
    console.error("Error resetting password:", error)
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const userId = url.searchParams.get("userId")

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 })
    }

    const result = await requireAdmin()
    if ("errorResponse" in result) return result.errorResponse

    const { adminSupabase, actorId } = result

    if (userId === actorId) {
      return NextResponse.json({ error: "You cannot delete your own account from this screen." }, { status: 400 })
    }

    const targetUser = await getTargetUser(adminSupabase, userId)
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (targetUser.role === "admin") {
      const guardResponse = await ensureAnotherAdminRemains(adminSupabase)
      if (guardResponse) return guardResponse
    }

    const { error } = await adminSupabase.auth.admin.deleteUser(userId)

    if (error) {
      console.error("Admin user delete failed:", error)
      return NextResponse.json({ error: "Failed to delete user" }, { status: 500 })
    }

    await adminSupabase.from("events").insert({
      type: "admin_user_deleted",
      user_id: actorId,
      payload: {
        target_user_id: userId,
        target_email: targetUser.email,
        target_name: targetUser.name,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting user:", error)
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 })
  }
}
