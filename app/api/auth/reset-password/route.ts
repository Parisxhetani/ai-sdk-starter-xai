import { type NextRequest, NextResponse } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"

function createAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase service role configuration missing")
  }

  return createAdminClient(url, serviceRoleKey)
}

export async function POST(request: NextRequest) {
  try {
    const { token, password } = await request.json()

    if (!token || !password) {
      return NextResponse.json({ error: "Token and password are required" }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 })
    }

    const admin = createAdmin()

    const { data: resetToken } = await admin
      .from("password_reset_tokens")
      .select("id, user_id, expires_at, used, user:users(id, email, name)")
      .eq("token", token)
      .eq("used", false)
      .maybeSingle()

    if (!resetToken) {
      return NextResponse.json({ error: "Invalid or expired reset token" }, { status: 400 })
    }

    if (new Date(resetToken.expires_at) < new Date()) {
      return NextResponse.json({ error: "Reset token has expired" }, { status: 400 })
    }

    const resetUser = Array.isArray(resetToken.user) ? resetToken.user[0] : resetToken.user
    const { error: updateError } = await admin.auth.admin.updateUserById(resetToken.user_id, { password })

    if (updateError) {
      console.error("Error updating password:", updateError)
      return NextResponse.json({ error: "Failed to update password" }, { status: 500 })
    }

    await admin.from("password_reset_tokens").update({ used: true }).eq("id", resetToken.id)

    await admin.from("events").insert({
      type: "password_reset_completed",
      user_id: resetToken.user_id,
      payload: {
        email: resetUser?.email,
        reset_token_id: resetToken.id,
      },
    })

    return NextResponse.json({
      success: true,
      message: "Password has been reset successfully",
    })
  } catch (error) {
    console.error("Password reset error:", error)
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 })
  }
}
