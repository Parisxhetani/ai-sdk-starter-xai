"use client"

import { useEffect, useState } from "react"
import { Clock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface CountdownTimerProps {
  targetTime: string // "12:30" format
  isWindowOpen: boolean
  className?: string
}

export function CountdownTimer({ targetTime, isWindowOpen, className }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState<{ hours: number; minutes: number; seconds: number } | null>(null)

  useEffect(() => {
    if (!isWindowOpen) {
      setTimeLeft(null)
      return
    }

    const calculateTimeLeft = () => {
      const now = new Date()
      const tiranaNow = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Tirane" }))
      
      const [targetHours, targetMinutes] = targetTime.split(":").map(Number)
      const target = new Date(tiranaNow)
      target.setHours(targetHours, targetMinutes, 0, 0)

      const diff = target.getTime() - tiranaNow.getTime()
      
      if (diff <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0 })
        return
      }

      const hours = Math.floor(diff / 3600000)
      const minutes = Math.floor((diff % 3600000) / 60000)
      const seconds = Math.floor((diff % 60000) / 1000)

      setTimeLeft({ hours, minutes, seconds })
    }

    calculateTimeLeft()
    const interval = setInterval(calculateTimeLeft, 1000)
    return () => clearInterval(interval)
  }, [targetTime, isWindowOpen])

  if (!isWindowOpen || !timeLeft) return null

  const isUrgent = timeLeft.hours === 0 && timeLeft.minutes <= 30

  return (
    <Badge
      variant={isUrgent ? "destructive" : "default"}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 text-sm font-medium",
        isUrgent ? "animate-pulse bg-red-500 hover:bg-red-600" : "bg-emerald-500 hover:bg-emerald-600",
        className
      )}
    >
      <Clock className={cn("h-4 w-4", isUrgent && "animate-bounce")} />
      <span className="tabular-nums">
        {String(timeLeft.hours).padStart(2, "0")}:
        {String(timeLeft.minutes).padStart(2, "0")}:
        {String(timeLeft.seconds).padStart(2, "0")}
      </span>
      <span className="hidden sm:inline">left to order</span>
    </Badge>
  )
}
