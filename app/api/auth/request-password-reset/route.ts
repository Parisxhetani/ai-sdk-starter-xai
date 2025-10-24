import { type NextRequest, NextResponse } from "next/server"
import crypto from "node:crypto"
import { createClient } from "@/lib/supabase/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"

const SUCCESS_MESSAGE =
  "If an account with that email exists, a password reset link has been sent. Check your inbox in a moment."
const DURATION_MINUTES = parseInt(process.env.RESET_LINK_DURATION_MINUTES || "1440", 10)

const normalizeBase = (value?: string | null) => {
  if (!value) return undefined
  return value.endsWith("/") ? value.slice(0, -1) : value
}

function getRedirectBase(request: NextRequest) {
  const originFromUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`
  return (
    normalizeBase(process.env.NEXT_PUBLIC_APP_URL) ??
    normalizeBase(request.headers.get("origin")) ??
    normalizeBase(originFromUrl) ??
    normalizeBase(process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL) ??
    "http://localhost:3000"
  )
}

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
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    const normalizedEmail = String(email).trim().toLowerCase()
    const supabase = await createClient()
    const admin = createAdmin()

    const redirectBase = getRedirectBase(request)

    const expiresInMinutes = Math.max(DURATION_MINUTES, 1)
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60_000)
    const token = crypto.randomBytes(48).toString("hex")

    const { data: userRow } = await admin
      .from("users")
      .select("id, email")
      .eq("email", normalizedEmail)
      .maybeSingle()

    let userId = userRow?.id ?? null

    if (!userId) {
      const { data: listData, error: listError } = await admin.auth.admin.listUsers({
        email: normalizedEmail,
        perPage: 1,
      })
      if (listError) {
        console.error("Supabase admin listUsers error:", listError.message)
      }
      userId = listData?.users?.[0]?.id ?? null
    }

    if (userId) {
      const { error: insertError } = await admin.from("password_reset_tokens").insert({
        user_id: userId,
        token,
        expires_at: expiresAt.toISOString(),
      })
      if (insertError) {
        console.error("Failed to store password reset token:", insertError.message)
      }
    }

    const redirectTo = `${redirectBase}/auth/reset-password?token=${token}`

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo,
      expiresIn: expiresInMinutes * 60,
    })

    if (resetError) {
      console.error("Error sending Supabase reset email:", resetError.message)
      return NextResponse.json({ error: "Failed to send reset email" }, { status: 500 })
    }

    try {
      await admin.from("events").insert({
        type: "password_reset_email_sent",
        user_id: userId,
        payload: {
          email: normalizedEmail,
          redirect_to: redirectTo,
          provider: "supabase",
          expires_in_minutes: expiresInMinutes,
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
