/**
 * Time utilities for handling Friday ordering window in Europe/Tirane timezone
 */

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

export function isOrderingWindowOpen(): boolean {
  const now = new Date()
  const tiranaNow = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Tirane" }))

  // Check if it's Friday
  if (tiranaNow.getDay() !== 5) {
    return false
  }

  const hours = tiranaNow.getHours()
  const minutes = tiranaNow.getMinutes()
  const currentTime = hours * 60 + minutes

  // 09:00 = 540 minutes, 12:30 = 750 minutes
  return currentTime >= 540 && currentTime <= 750
}

export function getTimeUntilNextWindow(): { days: number; hours: number; minutes: number } {
  const now = new Date()
  const tiranaNow = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Tirane" }))

  const nextFriday = new Date(tiranaNow)
  const dayOfWeek = tiranaNow.getDay()

  if (dayOfWeek === 5) {
    // It's Friday
    const hours = tiranaNow.getHours()
    const minutes = tiranaNow.getMinutes()
    const currentTime = hours * 60 + minutes

    if (currentTime < 540) {
      // Before 09:00, next window is today at 09:00
      nextFriday.setHours(9, 0, 0, 0)
    } else {
      // After ordering window, next window is next Friday
      nextFriday.setDate(tiranaNow.getDate() + 7)
      nextFriday.setHours(9, 0, 0, 0)
    }
  } else {
    // Not Friday, find next Friday
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

export function formatFridayDate(date: Date): string {
  return date.toISOString().split("T")[0]
}
