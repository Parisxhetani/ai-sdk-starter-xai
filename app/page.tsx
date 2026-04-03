import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { OrderingInterface } from "@/components/ordering-interface"

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

  // Get user profile to check if whitelisted
  const { data: userProfile } = await supabase.from("users").select("*").eq("id", user.id).single()

  if (!userProfile?.whitelisted) {
    redirect("/auth/not-whitelisted")
  }

  return <OrderingInterface user={userProfile} />
}
