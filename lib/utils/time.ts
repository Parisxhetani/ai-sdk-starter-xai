// utils/time.ts
/**
 * Time utilities for handling Friday ordering window in Europe/Tirane timezone
 */
import { createClient } from "@/lib/supabase/client"

const DEFAULT_START_TIME = "09:00"
const DEFAULT_END_TIME = "12:30"

export async function getOrderingTimeframe(): Promise<{ startTime: string; endTime: string }> {
  try {
    const supabase = createClient()
    const { data: settings } = await supabase
      .from("settings")
      .select("key, value")
      .in("key", ["ordering_start_time", "ordering_end_time"])

    const startTime = settings?.find((s) => s.key === "ordering_start_time")?.value || DEFAULT_START_TIME
    const endTime   = settings?.find((s) => s.key === "ordering_end_time")?.value || DEFAULT_END_TIME
    return { startTime, endTime }
  } catch {
    return { startTime: DEFAULT_START_TIME, endTime: DEFAULT_END_TIME }
  }
}

export function getCurrentFriday(): Date {
  const now = new Date()
  const day = now.getDay()
  const add = (5 - day + 7) % 7
  const target = new Date(now)
  target.setDate(now.getDate() + add)
  return new Date(target.getFullYear(), target.getMonth(), target.getDate())
}

export async function isOrderingWindowOpen(): Promise<boolean> {
  const now = new Date()
  const tiranaNow = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Tirane" }))
  if (tiranaNow.getDay() !== 5) return false

  const { startTime, endTime } = await getOrderingTimeframe()
  const [sh, sm] = startTime.split(":").map(Number)
  const [eh, em] = endTime.split(":").map(Number)

  const cur = tiranaNow.getHours() * 60 + tiranaNow.getMinutes()
  return cur >= sh * 60 + sm && cur <= eh * 60 + em
}

export async function getTimeUntilNextWindow(): Promise<{ days: number; hours: number; minutes: number }> {
  const now = new Date()
  const tiranaNow = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Tirane" }))
  const { startTime } = await getOrderingTimeframe()
  const [sh, sm] = startTime.split(":").map(Number)

  const next = new Date(tiranaNow)
  const dow = tiranaNow.getDay()
  if (dow === 5) {
    const cur = tiranaNow.getHours() * 60 + tiranaNow.getMinutes()
    const start = sh * 60 + sm
    if (cur < start) {
      next.setHours(sh, sm, 0, 0)
    } else {
      next.setDate(tiranaNow.getDate() + 7)
      next.setHours(sh, sm, 0, 0)
    }
  } else {
    const add = (5 - dow + 7) % 7 || 7
    next.setDate(tiranaNow.getDate() + add)
    next.setHours(sh, sm, 0, 0)
  }

  const diff = next.getTime() - tiranaNow.getTime()
  const days = Math.floor(diff / 86_400_000)
  const hours = Math.floor((diff % 86_400_000) / 3_600_000)
  const minutes = Math.floor((diff % 3_600_000) / 60_000)
  return { days, hours, minutes }
}

export function formatFridayDate(date: Date): string {
  return date.toISOString().split("T")[0]
}
