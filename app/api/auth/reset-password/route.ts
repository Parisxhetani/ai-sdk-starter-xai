import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const { token, password } = await request.json()

    if (!token || !password) {
      return NextResponse.json({ error: "Token and password are required" }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 })
    }

    const supabase = await createClient()

    // Find and validate token
    const { data: resetToken } = await supabase
      .from("password_reset_tokens")
      .select(`
        id,
        user_id,
        expires_at,
        used,
        user:users(id, email, name)
      `)
      .eq("token", token)
      .eq("used", false)
      .single()

    if (!resetToken) {
      return NextResponse.json({ error: "Invalid or expired reset token" }, { status: 400 })
    }

    // Check if token is expired
    if (new Date(resetToken.expires_at) < new Date()) {
      return NextResponse.json({ error: "Reset token has expired" }, { status: 400 })
    }

    // Update user password using Supabase Admin API
    const { error: updateError } = await supabase.auth.admin.updateUserById(resetToken.user_id, { password })

    if (updateError) {
      console.error("Error updating password:", updateError)
      return NextResponse.json({ error: "Failed to update password" }, { status: 500 })
    }

    // Mark token as used
    await supabase.from("password_reset_tokens").update({ used: true }).eq("id", resetToken.id)

    // Log the event
    await supabase.from("events").insert({
      type: "password_reset_completed",
      user_id: resetToken.user_id,
      payload: {
        email: resetToken.user?.email,
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
