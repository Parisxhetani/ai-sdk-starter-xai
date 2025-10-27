import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET() {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("id, whitelisted")
      .eq("id", user.id)
      .maybeSingle()

    if (profileError) {
      console.error("Failed to verify requester profile", profileError)
      return NextResponse.json({ error: "Unable to verify access" }, { status: 500 })
    }

    if (!profile?.whitelisted) {
      return NextResponse.json({ error: "Access restricted" }, { status: 403 })
    }

    const { data: roster, error } = await adminSupabase
      .from("users")
      .select("id, name, email")
      .eq("whitelisted", true)

    if (error) {
      console.error("Admin roster query failed", error)
      return NextResponse.json({ error: "Failed to load chat users" }, { status: 500 })
    }

    const users = (roster ?? []).map((entry) => ({
      id: entry.id,
      name: entry.name ?? null,
      email: entry.email ?? null,
    }))

    return NextResponse.json({ users })
  } catch (error) {
    console.error("Unexpected error loading chat users", error)
    return NextResponse.json({ error: "Failed to load chat users" }, { status: 500 })
  }
}
