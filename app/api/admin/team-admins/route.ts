import { type NextRequest, NextResponse } from "next/server"
import { requireSuperAdmin, isErrorResponse } from "@/lib/supabase/auth-helpers"

// POST: promote user to team-admin of a team.
// body: { user_id, team_id }
export async function POST(request: NextRequest) {
  const gate = await requireSuperAdmin()
  if (isErrorResponse(gate)) return gate.errorResponse

  const { user_id, team_id } = await request.json()
  if (!user_id || !team_id) {
    return NextResponse.json({ error: "user_id and team_id required" }, { status: 400 })
  }

  // user must already belong to that team to be its admin
  const { data: targetUser } = await gate.admin
    .from("users")
    .select("id, team_id, email")
    .eq("id", user_id)
    .maybeSingle()

  if (!targetUser) return NextResponse.json({ error: "User not found" }, { status: 404 })
  if (targetUser.team_id !== team_id) {
    return NextResponse.json({ error: "User is not a member of that team" }, { status: 400 })
  }

  const { error } = await gate.admin
    .from("team_admins")
    .upsert({ user_id, team_id }, { onConflict: "user_id" })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await gate.admin.from("events").insert({
    type: "team_admin_promoted",
    user_id: gate.actorId,
    payload: { target_user_id: user_id, team_id, target_email: targetUser.email },
  })

  return NextResponse.json({ success: true })
}

// DELETE: demote a user from team-admin. ?userId=
export async function DELETE(request: NextRequest) {
  const gate = await requireSuperAdmin()
  if (isErrorResponse(gate)) return gate.errorResponse

  const url = new URL(request.url)
  const userId = url.searchParams.get("userId")
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 })

  const { error } = await gate.admin.from("team_admins").delete().eq("user_id", userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await gate.admin.from("events").insert({
    type: "team_admin_demoted",
    user_id: gate.actorId,
    payload: { target_user_id: userId },
  })

  return NextResponse.json({ success: true })
}

// GET: list all team-admins ({ user_id, team_id })
export async function GET() {
  const gate = await requireSuperAdmin()
  if (isErrorResponse(gate)) return gate.errorResponse

  const { data, error } = await gate.admin
    .from("team_admins")
    .select("user_id, team_id, created_at")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ team_admins: data ?? [] })
}
