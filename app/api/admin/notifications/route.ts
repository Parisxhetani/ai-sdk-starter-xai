import { type NextRequest, NextResponse } from "next/server"
import { requireTeamAdmin, isErrorResponse } from "@/lib/supabase/auth-helpers"

const RESEND_API_URL = "https://api.resend.com/emails"

function normalizeEmail(email: unknown): string | null {
  if (typeof email !== "string") return null
  const normalized = email.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null
}

export async function POST(request: NextRequest) {
  const probe = await requireTeamAdmin(null)
  if (isErrorResponse(probe)) return probe.errorResponse

  const body = await request.json()
  const subject = typeof body.subject === "string" ? body.subject.trim() : ""
  const message = typeof body.message === "string" ? body.message.trim() : ""
  const fridayDate = typeof body.fridayDate === "string" ? body.fridayDate : null
  const providedRecipients = Array.isArray(body.recipients) ? body.recipients : []
  const teamIdParam = typeof body.teamId === "string" ? body.teamId : null

  const recipients = Array.from(
    new Set(
      (providedRecipients as unknown[])
        .map((email) => normalizeEmail(email))
        .filter((value: string | null): value is string => Boolean(value)),
    ),
  )

  if (!subject) return NextResponse.json({ error: "Subject is required" }, { status: 400 })
  if (!message) return NextResponse.json({ error: "Message body is required" }, { status: 400 })
  if (!recipients.length)
    return NextResponse.json({ error: "At least one valid recipient email is required" }, { status: 400 })

  // Verify all recipients are members of the caller's team (team-admin)
  // or of the requested team (super-admin).
  const effectiveTeamId =
    probe.role === "team-admin" ? probe.teamAdminFor : teamIdParam ?? null

  if (probe.role === "team-admin" && teamIdParam && teamIdParam !== probe.teamAdminFor) {
    return NextResponse.json({ error: "Forbidden for this team" }, { status: 403 })
  }

  if (effectiveTeamId) {
    const { data: teamMembers } = await probe.admin
      .from("users")
      .select("email")
      .eq("team_id", effectiveTeamId)

    const allowed = new Set((teamMembers ?? []).map((m) => m.email.toLowerCase()))
    const blocked = recipients.filter((r) => !allowed.has(r))
    if (blocked.length) {
      return NextResponse.json({ error: `Recipients are not in the team: ${blocked.join(", ")}` }, { status: 403 })
    }
  }

  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.ORDER_REMINDER_FROM_EMAIL
  if (!apiKey || !fromEmail) {
    return NextResponse.json(
      { error: "Email sending is not configured. Please define RESEND_API_KEY and ORDER_REMINDER_FROM_EMAIL." },
      { status: 500 },
    )
  }

  const resendResponse = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: fromEmail, to: recipients, subject, text: message }),
  })

  if (!resendResponse.ok) {
    let details: unknown = null
    try {
      details = await resendResponse.json()
    } catch {
      // ignore
    }
    console.error("Failed to send reminder email:", details || resendResponse.statusText)
    return NextResponse.json({ error: "Failed to send reminder email" }, { status: 502 })
  }

  await probe.admin.from("events").insert({
    type: "reminder_email_sent",
    user_id: probe.actorId,
    payload: {
      subject,
      recipient_count: recipients.length,
      recipients,
      friday_date: fridayDate,
      team_id: effectiveTeamId,
    },
  })

  return NextResponse.json({ success: true })
}
