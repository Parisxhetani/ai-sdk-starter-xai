import { NextResponse, type NextRequest } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { sendReminderEmail } from "@/lib/notifications/mailjet"

const DEFAULT_DAY_OF_WEEK = 5
const TARGET_HOUR = 11
const TARGET_WINDOW_MINUTES = 7

function parseDayOfWeek(value: string | null | undefined): number {
  const parsed = Number(value)
  if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 6) {
    return parsed
  }
  return DEFAULT_DAY_OF_WEEK
}

function nextDateStringForDay(dayOfWeek: number): string {
  const now = new Date()
  const day = now.getDay()
  const add = (dayOfWeek - day + 7) % 7
  const target = new Date(now)
  target.setDate(now.getDate() + add)
  target.setHours(0, 0, 0, 0)
  return target.toISOString().split("T")[0]!
}

async function getCurrentOrderDateString(adminClient: ReturnType<typeof createAdminClient>): Promise<string> {
  try {
    const { data, error } = await adminClient.from("settings").select("value").eq("key", "ordering_day_of_week").maybeSingle()
    if (error) throw error
    const dayOfWeek = parseDayOfWeek((data?.value as string | null | undefined) ?? undefined)
    return nextDateStringForDay(dayOfWeek)
  } catch (error) {
    console.error("Failed to resolve ordering day:", error)
    return nextDateStringForDay(DEFAULT_DAY_OF_WEEK)
  }
}

function formatFriendlyDate(orderDate: string): string {
  const safeDate = new Date(`${orderDate}T00:00:00`)
  if (Number.isNaN(safeDate.getTime())) return orderDate
  return safeDate.toLocaleDateString("sq-AL", { weekday: "long", month: "long", day: "numeric" })
}

function isWithinTargetWindow(now: Date): boolean {
  const tiranaNow = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Tirane" }))
  if (tiranaNow.getHours() !== TARGET_HOUR) return false
  return tiranaNow.getMinutes() < TARGET_WINDOW_MINUTES
}

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret")
  if (!process.env.CRON_REMINDER_SECRET) {
    return NextResponse.json({ error: "CRON_REMINDER_SECRET is not configured" }, { status: 500 })
  }

  if (secret !== process.env.CRON_REMINDER_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!isWithinTargetWindow(new Date())) {
    return NextResponse.json({ skipped: "outside target window" })
  }

  const admin = createAdminClient()
  const fridayDate = await getCurrentOrderDateString(admin)

  const [ordersResult, usersResult, existingEventResult] = await Promise.all([
    admin.from("orders").select("user_id").eq("friday_date", fridayDate),
    admin.from("users").select("id, email, whitelisted"),
    admin
      .from("events")
      .select("id")
      .eq("type", "automated_reminder_email")
      .contains("payload", { friday_date: fridayDate })
      .maybeSingle(),
  ])

  if (ordersResult.error) {
    console.error("Automated reminder orders query failed:", ordersResult.error)
    return NextResponse.json({ error: "Failed to load orders" }, { status: 500 })
  }

  if (usersResult.error) {
    console.error("Automated reminder users query failed:", usersResult.error)
    return NextResponse.json({ error: "Failed to load users" }, { status: 500 })
  }

  if (existingEventResult.data) {
    return NextResponse.json({ skipped: "already sent" })
  }

  const orderedUserIds = new Set((ordersResult.data ?? []).map((order) => order.user_id))
  const recipients = (usersResult.data ?? [])
    .filter((user) => user.whitelisted && user.email && !orderedUserIds.has(user.id))
    .map((user) => user.email!.trim().toLowerCase())

  if (!recipients.length) {
    return NextResponse.json({ skipped: "no recipients" })
  }

  const friendlyDate = formatFriendlyDate(fridayDate)
  const subject = `Reminder: Friday order closes at 12:00 (${friendlyDate})`
  const message = [
    "Hey team,",
    "",
    `It's 11:00 and we still need your lunch order for ${friendlyDate}.`,
    "Please add it in the Friday portal ASAP so Tony gets everything before the 12:00 deadline.",
    "",
    "Thanks!",
  ].join("\n")

  try {
    await sendReminderEmail({ recipients, subject, message })
  } catch (error) {
    console.error("Automated reminder Mailjet error:", error)
    return NextResponse.json({ error: (error as Error).message ?? "Failed to send reminder" }, { status: 500 })
  }

  await admin.from("events").insert({
    type: "automated_reminder_email",
    user_id: null,
    payload: { friday_date: fridayDate, recipient_count: recipients.length, mode: "cron" },
  })

  return NextResponse.json({ success: true, recipients: recipients.length })
}
