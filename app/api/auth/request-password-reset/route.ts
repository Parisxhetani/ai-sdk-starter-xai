import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import crypto from "crypto"

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    const supabase = await createClient()

    // Check if user exists and is whitelisted
    const { data: user } = await supabase
      .from("users")
      .select("id, email, name, whitelisted")
      .eq("email", email.toLowerCase())
      .single()

    if (!user) {
      // Don't reveal if user exists or not for security
      return NextResponse.json({
        success: true,
        message: "If an account with that email exists, a password reset link has been sent.",
      })
    }

    if (!user.whitelisted) {
      return NextResponse.json({
        success: true,
        message: "If an account with that email exists, a password reset link has been sent.",
      })
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString("hex")
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now

    // Store token in database
    const { error: tokenError } = await supabase.from("password_reset_tokens").insert({
      user_id: user.id,
      token,
      expires_at: expiresAt.toISOString(),
    })

    if (tokenError) {
      console.error("Error storing password reset token:", tokenError)
      return NextResponse.json({ error: "Failed to process request" }, { status: 500 })
    }

    // In a real app, you would send an email here
    // For now, we'll just log it and return success
    const resetUrl = `${process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || "http://localhost:3000"}/auth/reset-password?token=${token}`

    console.log(`[v0] Password reset requested for ${email}`)
    console.log(`[v0] Reset URL: ${resetUrl}`)
    console.log(`[v0] Token expires at: ${expiresAt.toISOString()}`)

    // Log the event
    await supabase.from("events").insert({
      type: "password_reset_requested",
      user_id: user.id,
      payload: {
        email: user.email,
        token_expires_at: expiresAt.toISOString(),
      },
    })

    return NextResponse.json({
      success: true,
      message: "If an account with that email exists, a password reset link has been sent.",
      // In development, include the reset URL for testing
      ...(process.env.NODE_ENV === "development" && { resetUrl }),
    })
  } catch (error) {
    console.error("Password reset request error:", error)
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 })
  }
}
