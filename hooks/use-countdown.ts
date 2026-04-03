"use client"

import { useState, useEffect, useCallback } from "react"

interface UseCountdownOptions {
  targetDate: Date | null
  onComplete?: () => void
}

export function useCountdown({ targetDate, onComplete }: UseCountdownOptions) {
  const [timeLeft, setTimeLeft] = useState<{
    days: number
    hours: number
    minutes: number
    seconds: number
    total: number
  } | null>(null)

  const calculateTimeLeft = useCallback(() => {
    if (!targetDate) return null

    const now = new Date().getTime()
    const target = targetDate.getTime()
    const difference = target - now

    if (difference <= 0) {
      setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 })
      onComplete?.()
      return { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 }
    }

    const days = Math.floor(difference / (1000 * 60 * 60 * 24))
    const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60))
    const seconds = Math.floor((difference % (1000 * 60)) / 1000)

    return { days, hours, minutes, seconds, total: difference }
  }, [targetDate, onComplete])

  useEffect(() => {
    if (!targetDate) {
      setTimeLeft(null)
      return
    }

    // Calculate immediately
    const initial = calculateTimeLeft()
    setTimeLeft(initial)

    // Update every second
    const timer = setInterval(() => {
      const result = calculateTimeLeft()
      setTimeLeft(result)
    }, 1000)

    return () => clearInterval(timer)
  }, [targetDate, calculateTimeLeft])

  return timeLeft
}

export function useCountdownToTime(targetTime: string, timezone: string = "Europe/Tirane") {
  const [timeLeft, setTimeLeft] = useState<{
    hours: number
    minutes: number
    seconds: number
    isUrgent: boolean
  } | null>(null)

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date()
      const tiranaNow = new Date(now.toLocaleString("en-US", { timeZone: timezone }))

      const [targetHours, targetMinutes] = targetTime.split(":").map(Number)
      const target = new Date(tiranaNow)
      target.setHours(targetHours, targetMinutes, 0, 0)

      const diff = target.getTime() - tiranaNow.getTime()

      if (diff <= 0) {
        setTimeLeft(null)
        return
      }

      const hours = Math.floor(diff / 3600000)
      const minutes = Math.floor((diff % 3600000) / 60000)
      const seconds = Math.floor((diff % 60000) / 1000)

      setTimeLeft({
        hours,
        minutes,
        seconds,
        isUrgent: hours === 0 && minutes <= 30,
      })
    }

    calculateTimeLeft()
    const timer = setInterval(calculateTimeLeft, 1000)

    return () => clearInterval(timer)
  }, [targetTime, timezone])

  return timeLeft
}
