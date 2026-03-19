// utils/time.ts
/**
 * Time utilities for handling Friday ordering window in Europe/Tirane timezone
 */
import { createClient } from "@/lib/supabase/client"

const DEFAULT_START_TIME = "09:00"
const DEFAULT_END_TIME = "12:30"
const DEFAULT_DAY_OF_WEEK = 5
const ORDERING_SETTING_KEYS = ["ordering_start_time", "ordering_end_time", "ordering_day_of_week"] as const
const CACHE_TTL_MS = 60_000

let cachedTimeframe: OrderingTimeframe | null = null
let cachedTimeframeAt = 0

export interface OrderingTimeframe {
  startTime: string
  endTime: string
  dayOfWeek: number
}

export function parseDayOfWeek(value: string | null | undefined): number {
  const parsed = Number(value)
  if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 6) {
    return parsed
  }
  return DEFAULT_DAY_OF_WEEK
}

export function getUpcomingDateForDay(dayOfWeek: number, reference: Date = new Date()): Date {
  const current = new Date(reference)
  const day = current.getDay()
  const add = (dayOfWeek - day + 7) % 7
  const target = new Date(current)
  target.setDate(current.getDate() + add)
  return new Date(target.getFullYear(), target.getMonth(), target.getDate())
}

export async function getOrderingTimeframe(): Promise<OrderingTimeframe> {
  const now = Date.now()
  if (cachedTimeframe && now - cachedTimeframeAt < CACHE_TTL_MS) {
    return cachedTimeframe
  }

  try {
    const supabase = createClient()
    const { data: settings } = await supabase
      .from("settings")
      .select("key, value")
      .in("key", ORDERING_SETTING_KEYS)

    const startTime = settings?.find((s) => s.key === "ordering_start_time")?.value || DEFAULT_START_TIME
    const endTime = settings?.find((s) => s.key === "ordering_end_time")?.value || DEFAULT_END_TIME
    const dayOfWeek = parseDayOfWeek(settings?.find((s) => s.key === "ordering_day_of_week")?.value)

    cachedTimeframe = { startTime, endTime, dayOfWeek }
    cachedTimeframeAt = now
    return cachedTimeframe
  } catch {
    const fallback = { startTime: DEFAULT_START_TIME, endTime: DEFAULT_END_TIME, dayOfWeek: DEFAULT_DAY_OF_WEEK }
    cachedTimeframe = fallback
    cachedTimeframeAt = now
    return fallback
  }
}

export function invalidateOrderingTimeframeCache(): void {
  cachedTimeframe = null
  cachedTimeframeAt = 0
}

export async function getCurrentFriday(): Promise<Date> {
  const { dayOfWeek } = await getOrderingTimeframe()
  return getUpcomingDateForDay(dayOfWeek)
}

export async function isOrderingWindowOpen(): Promise<boolean> {
  const now = new Date()
  const tiranaNow = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Tirane" }))

  const { startTime, endTime, dayOfWeek } = await getOrderingTimeframe()
  if (tiranaNow.getDay() !== dayOfWeek) return false

  const [sh, sm] = startTime.split(":").map(Number)
  const [eh, em] = endTime.split(":").map(Number)

  const cur = tiranaNow.getHours() * 60 + tiranaNow.getMinutes()
  return cur >= sh * 60 + sm && cur <= eh * 60 + em
}

export async function getTimeUntilNextWindow(): Promise<{ days: number; hours: number; minutes: number }> {
  const now = new Date()
  const tiranaNow = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Tirane" }))
  const { startTime, dayOfWeek } = await getOrderingTimeframe()
  const [sh, sm] = startTime.split(":").map(Number)

  const next = new Date(tiranaNow)
  const dow = tiranaNow.getDay()
  const start = sh * 60 + sm
  const currentMinutes = tiranaNow.getHours() * 60 + tiranaNow.getMinutes()
  if (dow === dayOfWeek) {
    if (currentMinutes < start) {
      next.setHours(sh, sm, 0, 0)
    } else {
      next.setDate(tiranaNow.getDate() + 7)
      next.setHours(sh, sm, 0, 0)
    }
  } else {
    const add = (dayOfWeek - dow + 7) % 7 || 7
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
