import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { OrderingInterface } from "@/components/ordering-interface"

export default async function HomePage() {
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
