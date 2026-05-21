import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { OrderingInterface } from "@/components/ordering-interface"
import type { User } from "@/lib/types"

type HomePageProps = {
  searchParams?: Record<string, string | string[] | undefined>
}

export default async function HomePage({ searchParams = {} }: HomePageProps) {
  const recoveryParams = new URLSearchParams()

  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") {
      recoveryParams.set(key, value)
      continue
    }

    if (Array.isArray(value)) {
      value.forEach((item) => recoveryParams.append(key, item))
    }
  }

  if (
    recoveryParams.has("code") ||
    recoveryParams.get("type") === "recovery" ||
    recoveryParams.has("error") ||
    recoveryParams.has("error_description")
  ) {
    redirect(`/auth/reset-password?${recoveryParams.toString()}`)
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const { data: userProfile } = await supabase
    .from("users")
    .select("*, team:teams(id, slug, name, color)")
    .eq("id", user.id)
    .single()

  if (!userProfile?.whitelisted) {
    redirect("/auth/not-whitelisted")
  }

  // Resolve team-admin flag (a separate query to keep RLS happy).
  const { data: teamAdminRow } = await supabase
    .from("team_admins")
    .select("team_id")
    .eq("user_id", user.id)
    .maybeSingle()

  const enriched: User = {
    ...userProfile,
    is_team_admin: Boolean(teamAdminRow),
    team_admin_for: teamAdminRow?.team_id ?? null,
  }

  return <OrderingInterface user={enriched} />
}
