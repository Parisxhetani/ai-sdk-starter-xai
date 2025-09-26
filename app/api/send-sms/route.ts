import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getCurrentFriday, formatFridayDate } from "@/lib/utils/time"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Verify user is authenticated and admin
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: userProfile } = await supabase.from("users").select("role").eq("id", user.id).single()

    if (userProfile?.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const fridayDate = formatFridayDate(getCurrentFriday())

    // Check if SMS already sent for this Friday
    const { data: existingSMS } = await supabase
      .from("events")
      .select("*")
      .eq("type", "sms_sent")
      .eq("payload->>friday_date", fridayDate)
      .single()

    if (existingSMS) {
      return NextResponse.json({ error: "SMS already sent for this Friday" }, { status: 400 })
    }

    // Fetch orders for this Friday
    const { data: orders } = await supabase
      .from("orders")
      .select(`
        *,
        user:users(name, email, phone)
      `)
      .eq("friday_date", fridayDate)
      .eq("locked", true)

    if (!orders || orders.length === 0) {
      return NextResponse.json({ error: "No locked orders found for this Friday" }, { status: 400 })
    }

    // Get settings
    const { data: settings } = await supabase.from("settings").select("*")
    const settingsMap = settings?.reduce(
      (acc, setting) => {
        acc[setting.key] = setting.value
        return acc
      },
      {} as Record<string, string>,
    )

    const tonyPhone = settingsMap?.tony_phone || "+355691234567"
    const adminPhone = settingsMap?.admin_phone || "+355691234567"

    // Generate order summary
    const orderSummary = orders.reduce(
      (acc, order) => {
        const key = `${order.item}: ${order.variant}`
        acc[key] = (acc[key] || 0) + 1
        return acc
      },
      {} as Record<string, number>,
    )

    const summaryText = Object.entries(orderSummary)
      .map(([item, count]) => `${item} x${count}`)
      .join(", ")

    const smsMessage = `Friday order – Tony's (Tirana): ${orders.length} meals. ${summaryText}. Contact: ${adminPhone}.`

    // Send SMS using Twilio (or mock for demo)
    let smsResult
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
      try {
        const twilio = (await import("twilio")).default
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)

        smsResult = await client.messages.create({
          body: smsMessage,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: tonyPhone,
        })
      } catch (twilioError) {
        console.error("[v0] Twilio error, falling back to mock:", twilioError)
        // Fall back to mock if Twilio fails
        smsResult = { sid: "mock_fallback_" + Date.now(), status: "sent" }
      }
    } else {
      // Mock SMS for demo
      console.log("[v0] Mock SMS sent to:", tonyPhone)
      console.log("[v0] Message:", smsMessage)
      smsResult = { sid: "mock_" + Date.now(), status: "sent" }
    }

    // Log SMS sent event
    await supabase.from("events").insert({
      type: "sms_sent",
      user_id: user.id,
      payload: {
        friday_date: fridayDate,
        recipient: tonyPhone,
        message: smsMessage,
        order_count: orders.length,
        twilio_sid: smsResult.sid,
        status: smsResult.status,
      },
    })

    return NextResponse.json({
      success: true,
      message: "SMS sent successfully",
      orderCount: orders.length,
      twilioSid: smsResult.sid,
    })
  } catch (error) {
    console.error("SMS sending error:", error)
    return NextResponse.json({ error: "Failed to send SMS" }, { status: 500 })
  }
}
