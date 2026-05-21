import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  requireSuperAdmin,
  requireTeamAdmin,
  isErrorResponse,
} from "@/lib/supabase/auth-helpers"

const DEFAULT_RESET_PASSWORD = "!Tirana1"

async function getTargetUser(adminSupabase: ReturnType<typeof createAdminClient>, userId: string) {
  const { data, error } = await adminSupabase
    .from("users")
    .select("id, name, email, role, team_id")
    .eq("id", userId)
    .maybeSingle()
  if (error) throw error
  return data
}

async function ensureAnotherAdminRemains(admin: ReturnType<typeof createAdminClient>) {
  const { count, error } = await admin
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin")
  if (error) throw error
  if ((count ?? 0) <= 1) {
    return NextResponse.json({ error: "You must keep at least one super-admin." }, { status: 400 })
  }
  return null
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const teamFilter = url.searchParams.get("teamId")

  const probe = await requireTeamAdmin(teamFilter)
  if (isErrorResponse(probe)) return probe.errorResponse

  let query = probe.admin
    .from("users")
    .select("id, name, email, phone, role, whitelisted, team_id, created_at, updated_at")
    .order("created_at", { ascending: false })

  if (probe.role === "team-admin") {
    query = query.eq("team_id", probe.teamAdminFor)
  } else if (teamFilter) {
    query = query.eq("team_id", teamFilter)
  }

  const [usersResult, teamAdminsResult] = await Promise.all([
    query,
    probe.admin.from("team_admins").select("user_id, team_id"),
  ])

  if (usersResult.error) {
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 })
  }

  const taMap = new Map<string, string>()
  ;(teamAdminsResult.data ?? []).forEach((row) => taMap.set(row.user_id, row.team_id))

  const users = (usersResult.data ?? []).map((u) => ({
    ...u,
    is_team_admin: taMap.has(u.id),
    team_admin_for: taMap.get(u.id) ?? null,
  }))

  return NextResponse.json({ users })
}

export async function PATCH(request: NextRequest) {
  const { userId, updates } = await request.json()
  if (!userId || !updates) {
    return NextResponse.json({ error: "User ID and updates are required" }, { status: 400 })
  }

  const probe = await requireTeamAdmin(null)
  if (isErrorResponse(probe)) return probe.errorResponse

  const targetUser = await getTargetUser(probe.admin, userId)
  if (!targetUser) return NextResponse.json({ error: "User not found" }, { status: 404 })

  // Team-admins cannot edit users outside their team.
  if (probe.role === "team-admin" && probe.teamAdminFor !== targetUser.team_id) {
    return NextResponse.json({ error: "Forbidden for this team" }, { status: 403 })
  }

  // Restrict what team-admins can change.
  if (probe.role === "team-admin") {
    const allowed = new Set(["name", "phone", "whitelisted"])
    for (const k of Object.keys(updates)) {
      if (!allowed.has(k)) {
        return NextResponse.json({ error: `Team admins cannot edit field: ${k}` }, { status: 403 })
      }
    }
  }

  // Self role-change guard.
  if (userId === probe.actorId && updates.role && updates.role !== "admin" && probe.role === "super-admin") {
    return NextResponse.json({ error: "Cannot change your own role" }, { status: 400 })
  }

  // Demoting last super-admin guard.
  if (targetUser.role === "admin" && updates.role && updates.role !== "admin") {
    const guard = await ensureAnotherAdminRemains(probe.admin)
    if (guard) return guard
  }

  // If team_id changes, team-admins demoted automatically (foreign key won't enforce — do it here).
  const teamChanging = Object.prototype.hasOwnProperty.call(updates, "team_id") && updates.team_id !== targetUser.team_id

  const { data: updated, error } = await probe.admin
    .from("users")
    .update(updates)
    .eq("id", userId)
    .select("id, name, email, phone, role, whitelisted, team_id, created_at, updated_at")
    .single()

  if (error) return NextResponse.json({ error: "Failed to update user" }, { status: 500 })

  if (teamChanging) {
    // If the user was a team-admin of the OLD team, demote them on the move.
    await probe.admin.from("team_admins").delete().eq("user_id", userId)
  }

  await probe.admin.from("events").insert({
    type: "admin_user_updated",
    user_id: probe.actorId,
    payload: { target_user_id: userId, target_email: targetUser.email, updates },
  })

  return NextResponse.json({ user: updated })
}

export async function POST(request: NextRequest) {
  // password reset
  const { userId, action } = await request.json()
  if (!userId || action !== "reset_password") {
    return NextResponse.json({ error: "A valid user ID and action are required" }, { status: 400 })
  }

  const probe = await requireTeamAdmin(null)
  if (isErrorResponse(probe)) return probe.errorResponse

  const targetUser = await getTargetUser(probe.admin, userId)
  if (!targetUser) return NextResponse.json({ error: "User not found" }, { status: 404 })

  if (probe.role === "team-admin" && probe.teamAdminFor !== targetUser.team_id) {
    return NextResponse.json({ error: "Forbidden for this team" }, { status: 403 })
  }

  if (userId === probe.actorId) {
    return NextResponse.json({ error: "You cannot reset your own password from this screen." }, { status: 400 })
  }

  const { error } = await probe.admin.auth.admin.updateUserById(userId, { password: DEFAULT_RESET_PASSWORD })
  if (error) return NextResponse.json({ error: "Failed to reset password" }, { status: 500 })

  await probe.admin.from("events").insert({
    type: "admin_user_password_reset",
    user_id: probe.actorId,
    payload: { target_user_id: userId, target_email: targetUser.email },
  })

  return NextResponse.json({ success: true, defaultPassword: DEFAULT_RESET_PASSWORD })
}

// Only super-admins can fully delete auth users.
export async function DELETE(request: NextRequest) {
  const gate = await requireSuperAdmin()
  if (isErrorResponse(gate)) return gate.errorResponse

  const url = new URL(request.url)
  const userId = url.searchParams.get("userId")
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 })
  if (userId === gate.actorId) {
    return NextResponse.json({ error: "You cannot delete your own account from this screen." }, { status: 400 })
  }

  const targetUser = await getTargetUser(gate.admin, userId)
  if (!targetUser) return NextResponse.json({ error: "User not found" }, { status: 404 })

  if (targetUser.role === "admin") {
    const guard = await ensureAnotherAdminRemains(gate.admin)
    if (guard) return guard
  }

  const { error } = await gate.admin.auth.admin.deleteUser(userId)
  if (error) return NextResponse.json({ error: "Failed to delete user" }, { status: 500 })

  await gate.admin.from("events").insert({
    type: "admin_user_deleted",
    user_id: gate.actorId,
    payload: { target_user_id: userId, target_email: targetUser.email, target_name: targetUser.name },
  })

  return NextResponse.json({ success: true })
}
