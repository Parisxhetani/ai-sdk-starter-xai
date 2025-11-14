import { type NextRequest, NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendReminderEmail } from "@/lib/notifications/mailjet"

interface RequireAdminSuccess {
  admin: ReturnType<typeof createAdminClient>
  userId: string
}

async function requireAdmin(request: NextRequest): Promise<RequireAdminSuccess | { errorResponse: NextResponse }> {
  const supabase = await createClient()
  const admin = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const { data: profile, error } = await admin.from("users").select("id, role").eq("id", user.id).maybeSingle()
  if (error || profile?.role !== "admin") {
    return { errorResponse: NextResponse.json({ error: "Admin access required" }, { status: 403 }) }
  }

  return { admin, userId: user.id }
}

function normalizeEmail(email: unknown): string | null {
  if (typeof email !== "string") return null
  const normalized = email.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null
}

export async function POST(request: NextRequest) {
  try {
    const result = await requireAdmin(request)
    if ("errorResponse" in result) return result.errorResponse

    const { admin, userId } = result

    const body = await request.json()
    const subject = typeof body.subject === "string" ? body.subject.trim() : ""
    const message = typeof body.message === "string" ? body.message.trim() : ""
    const fridayDate = typeof body.fridayDate === "string" ? body.fridayDate : null
    const providedRecipients = Array.isArray(body.recipients) ? body.recipients : []

    const recipients = Array.from(
      new Set(
        providedRecipients
          .map((email) => normalizeEmail(email))
          .filter((value): value is string => Boolean(value)),
      ),
    )

    if (!subject) {
      return NextResponse.json({ error: "Subject is required" }, { status: 400 })
    }

    if (!message) {
      return NextResponse.json({ error: "Message body is required" }, { status: 400 })
    }

    if (!recipients.length) {
      return NextResponse.json({ error: "At least one valid recipient email is required" }, { status: 400 })
    }

    try {
      await sendReminderEmail({ recipients, subject, message })
    } catch (error) {
      console.error("Mailjet reminder send failed:", error)
      return NextResponse.json({ error: (error as Error).message ?? "Failed to send reminder email" }, { status: 502 })
    }

    await admin.from("events").insert({
      type: "reminder_email_sent",
      user_id: userId,
      payload: {
        subject,
        recipient_count: recipients.length,
        recipients,
        friday_date: fridayDate,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Admin reminder notification error:", error)
    return NextResponse.json({ error: "Failed to send reminder" }, { status: 500 })
  }
}
