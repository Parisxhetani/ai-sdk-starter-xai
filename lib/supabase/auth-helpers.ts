import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export type CallerRole = "super-admin" | "team-admin" | "member"

export interface ResolvedCaller {
  admin: ReturnType<typeof createAdminClient>
  actorId: string
  role: CallerRole
  teamId: string
  teamAdminFor: string | null
}

export type GateResult<T> = T | { errorResponse: NextResponse }

export function isErrorResponse<T>(r: GateResult<T>): r is { errorResponse: NextResponse } {
  return (r as { errorResponse?: NextResponse }).errorResponse !== undefined
}

async function resolveCaller(): Promise<GateResult<ResolvedCaller>> {
  const supabase = await createClient()
  const admin = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const { data: profile, error } = await admin
    .from("users")
    .select("id, role, team_id, whitelisted")
    .eq("id", user.id)
    .maybeSingle()

  if (error || !profile) {
    return { errorResponse: NextResponse.json({ error: "Profile not found" }, { status: 404 }) }
  }

  if (!profile.whitelisted) {
    return { errorResponse: NextResponse.json({ error: "Not whitelisted" }, { status: 403 }) }
  }

  let role: CallerRole = "member"
  let teamAdminFor: string | null = null

  if (profile.role === "admin") {
    role = "super-admin"
  } else {
    const { data: ta } = await admin
      .from("team_admins")
      .select("team_id")
      .eq("user_id", profile.id)
      .maybeSingle()

    if (ta?.team_id) {
      role = "team-admin"
      teamAdminFor = ta.team_id
    }
  }

  return {
    admin,
    actorId: profile.id,
    role,
    teamId: profile.team_id,
    teamAdminFor,
  }
}

/**
 * Gate for super-admin only. Kept for endpoints that are inherently
 * cross-team (creating teams, editing the global whitelist, etc).
 */
export async function requireSuperAdmin(): Promise<GateResult<ResolvedCaller>> {
  const result = await resolveCaller()
  if (isErrorResponse(result)) return result
  if (result.role !== "super-admin") {
    return { errorResponse: NextResponse.json({ error: "Super-admin access required" }, { status: 403 }) }
  }
  return result
}

/**
 * Gate for team-scoped admin endpoints. Allows:
 *   - super-admin: any team
 *   - team-admin of T: only T
 *   - member: rejected
 *
 * If targetTeamId is null:
 *   - super-admin: returns ok with the resolved caller's team (caller should re-read)
 *   - team-admin: returns ok with their team
 *   - member: rejected
 */
export async function requireTeamAdmin(targetTeamId: string | null): Promise<GateResult<ResolvedCaller>> {
  const result = await resolveCaller()
  if (isErrorResponse(result)) return result

  if (result.role === "super-admin") {
    return result
  }

  if (result.role === "team-admin") {
    if (targetTeamId == null || targetTeamId === result.teamAdminFor) {
      return result
    }
    return { errorResponse: NextResponse.json({ error: "Forbidden for this team" }, { status: 403 }) }
  }

  return { errorResponse: NextResponse.json({ error: "Admin access required" }, { status: 403 }) }
}

/**
 * Gate for team-scoped read endpoints. Allows any caller in the same team,
 * plus team-admins of that team and super-admins.
 */
export async function requireTeamMember(targetTeamId: string | null): Promise<GateResult<ResolvedCaller>> {
  const result = await resolveCaller()
  if (isErrorResponse(result)) return result

  if (result.role === "super-admin") return result

  const effectiveTeam = targetTeamId ?? result.teamId
  if (result.teamId === effectiveTeam) return result
  if (result.role === "team-admin" && result.teamAdminFor === effectiveTeam) return result

  return { errorResponse: NextResponse.json({ error: "Forbidden for this team" }, { status: 403 }) }
}

/**
 * Just resolve who's calling. No gate. Useful for endpoints that want
 * to branch on role.
 */
export async function resolveAuthenticatedCaller(): Promise<GateResult<ResolvedCaller>> {
  return resolveCaller()
}
