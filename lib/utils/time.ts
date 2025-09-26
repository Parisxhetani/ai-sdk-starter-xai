/**
 * Time utilities for handling Friday ordering window in Europe/Tirane timezone
 */

import { createClient } from "@/lib/supabase/client"

// Default timeframe (fallback if settings not available)
const DEFAULT_START_TIME = "09:00"
const DEFAULT_END_TIME = "12:30"

export function getCurrentFriday(): Date {
  const now = new Date()
  const dayOfWeek = now.getDay() // 0 = Sunday, 5 = Friday
  const daysUntilFriday = (5 - dayOfWeek + 7) % 7

  if (dayOfWeek === 5) {
    // It's Friday, return today
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  } else if (dayOfWeek === 6 || dayOfWeek === 0) {
    // It's weekend, return next Friday
    const nextFriday = new Date(now)
    nextFriday.setDate(now.getDate() + daysUntilFriday)
    return new Date(nextFriday.getFullYear(), nextFriday.getMonth(), nextFriday.getDate())
  } else {
    // It's Monday-Thursday, return this Friday
    const thisFriday = new Date(now)
    thisFriday.setDate(now.getDate() + daysUntilFriday)
    return new Date(thisFriday.getFullYear(), thisFriday.getMonth(), thisFriday.getDate())
  }
}

export async function isOrderingWindowOpen(): Promise<boolean> {
  const now = new Date()
  const tiranaNow = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Tirane" }))

  // Check if it's Friday
  if (tiranaNow.getDay() !== 5) {
    return false
  }

  try {
    const supabase = createClient()
    const { data: settings } = await supabase
      .from("settings")
      .select("key, value")
      .in("key", ["ordering_start_time", "ordering_end_time"])

    const startTime = settings?.find((s) => s.key === "ordering_start_time")?.value || DEFAULT_START_TIME
    const endTime = settings?.find((s) => s.key === "ordering_end_time")?.value || DEFAULT_END_TIME

    const [startHour, startMinute] = startTime.split(":").map(Number)
    const [endHour, endMinute] = endTime.split(":").map(Number)

    const hours = tiranaNow.getHours()
    const minutes = tiranaNow.getMinutes()
    const currentTime = hours * 60 + minutes
    const startMinutes = startHour * 60 + startMinute
    const endMinutes = endHour * 60 + endMinute

    return currentTime >= startMinutes && currentTime <= endMinutes
  } catch (error) {
    console.error("Error checking ordering window:", error)
    // Fallback to default times
    const hours = tiranaNow.getHours()
    const minutes = tiranaNow.getMinutes()
    const currentTime = hours * 60 + minutes
    return currentTime >= 540 && currentTime <= 750 // 09:00 to 12:30
  }
}

export async function getTimeUntilNextWindow(): Promise<{ days: number; hours: number; minutes: number }> {
  const now = new Date()
  const tiranaNow = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Tirane" }))

  try {
    const supabase = createClient()
    const { data: settings } = await supabase.from("settings").select("key, value").in("key", ["ordering_start_time"])

    const startTime = settings?.find((s) => s.key === "ordering_start_time")?.value || DEFAULT_START_TIME
    const [startHour, startMinute] = startTime.split(":").map(Number)

    const nextFriday = new Date(tiranaNow)
    const dayOfWeek = tiranaNow.getDay()

    if (dayOfWeek === 5) {
      // It's Friday
      const hours = tiranaNow.getHours()
      const minutes = tiranaNow.getMinutes()
      const currentTime = hours * 60 + minutes
      const startMinutes = startHour * 60 + startMinute

      if (currentTime < startMinutes) {
        // Before start time, next window is today
        nextFriday.setHours(startHour, startMinute, 0, 0)
      } else {
        // After ordering window, next window is next Friday
        nextFriday.setDate(tiranaNow.getDate() + 7)
        nextFriday.setHours(startHour, startMinute, 0, 0)
      }
    } else {
      // Not Friday, find next Friday
      const daysUntilFriday = (5 - dayOfWeek + 7) % 7
      nextFriday.setDate(tiranaNow.getDate() + (daysUntilFriday || 7))
      nextFriday.setHours(startHour, startMinute, 0, 0)
    }

    const diff = nextFriday.getTime() - tiranaNow.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

    return { days, hours, minutes }
  } catch (error) {
    console.error("Error calculating time until next window:", error)
    // Fallback calculation
    const nextFriday = new Date(tiranaNow)
    const dayOfWeek = tiranaNow.getDay()

    if (dayOfWeek === 5) {
      const hours = tiranaNow.getHours()
      const minutes = tiranaNow.getMinutes()
      const currentTime = hours * 60 + minutes

      if (currentTime < 540) {
        nextFriday.setHours(9, 0, 0, 0)
      } else {
        nextFriday.setDate(tiranaNow.getDate() + 7)
        nextFriday.setHours(9, 0, 0, 0)
      }
    } else {
      const daysUntilFriday = (5 - dayOfWeek + 7) % 7
      nextFriday.setDate(tiranaNow.getDate() + (daysUntilFriday || 7))
      nextFriday.setHours(9, 0, 0, 0)
    }

    const diff = nextFriday.getTime() - tiranaNow.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

    return { days, hours, minutes }
  }
}

export async function getOrderingTimeframe(): Promise<{ startTime: string; endTime: string }> {
  try {
    const supabase = createClient()
    const { data: settings } = await supabase
      .from("settings")
      .select("key, value")
      .in("key", ["ordering_start_time", "ordering_end_time"])

    const startTime = settings?.find((s) => s.key === "ordering_start_time")?.value || DEFAULT_START_TIME
    const endTime = settings?.find((s) => s.key === "ordering_end_time")?.value || DEFAULT_END_TIME

    return { startTime, endTime }
  } catch (error) {
    console.error("Error fetching timeframe settings:", error)
    return { startTime: DEFAULT_START_TIME, endTime: DEFAULT_END_TIME }
  }
}

export function formatFridayDate(date: Date): string {
  return date.toISOString().split("T")[0]
}
