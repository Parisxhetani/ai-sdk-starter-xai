import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const SUCCESS_MESSAGE =
  "If an account with that email exists, a password reset link has been sent. Check your inbox in a moment."

function getRedirectBase() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ||
    "http://localhost:3000"
  )
}

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    const normalizedEmail = String(email).trim().toLowerCase()
    const supabase = await createClient()

    const redirectTo = `${getRedirectBase()}/auth/reset-password`

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo,
    })

    if (resetError) {
      console.error("Error sending Supabase reset email:", resetError.message)
      return NextResponse.json({ error: "Failed to send reset email" }, { status: 500 })
    }

    try {
      await supabase.from("events").insert({
        type: "password_reset_email_sent",
        payload: {
          email: normalizedEmail,
          redirect_to: redirectTo,
          provider: "supabase",
        },
      })
    } catch (eventError) {
      console.warn("Failed to log password reset event:", eventError)
    }

    return NextResponse.json({
      success: true,
      message: SUCCESS_MESSAGE,
    })
  } catch (error) {
    console.error("Password reset request error:", error)
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 })
  }
}
