"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { getOrderingTimeframe } from "@/lib/utils/time"
import type { User } from "@/lib/types"
import { Clock, Save, AlertCircle } from "lucide-react"

interface TimeframeSettingsProps {
  user: User
}

export function TimeframeSettings({ user }: TimeframeSettingsProps) {
  const [startTime, setStartTime] = useState("09:00")
  const [endTime, setEndTime] = useState("12:30")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    fetchTimeframe()
  }, [])

  const fetchTimeframe = async () => {
    try {
      const { startTime: currentStart, endTime: currentEnd } = await getOrderingTimeframe()
      setStartTime(currentStart)
      setEndTime(currentEnd)
    } catch (error) {
      console.error("Error fetching timeframe:", error)
    }
  }

  const handleSave = async () => {
    setIsLoading(true)
    setError(null)
    setSuccess(false)

    // Validate times
    if (!startTime || !endTime) {
      setError("Both start and end times are required")
      setIsLoading(false)
      return
    }

    const [startHour, startMinute] = startTime.split(":").map(Number)
    const [endHour, endMinute] = endTime.split(":").map(Number)
    const startMinutes = startHour * 60 + startMinute
    const endMinutes = endHour * 60 + endMinute

    if (startMinutes >= endMinutes) {
      setError("Start time must be before end time")
      setIsLoading(false)
      return
    }

    try {
      // Update settings
      const { error: startError } = await supabase
        .from("settings")
        .upsert({ key: "ordering_start_time", value: startTime, updated_at: new Date().toISOString() })

      const { error: endError } = await supabase
        .from("settings")
        .upsert({ key: "ordering_end_time", value: endTime, updated_at: new Date().toISOString() })

      if (startError || endError) {
        throw new Error(startError?.message || endError?.message)
      }

      // Log the change
      await supabase.from("events").insert({
        type: "timeframe_updated",
        user_id: user.id,
        payload: { start_time: startTime, end_time: endTime },
      })

      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to update timeframe")
    } finally {
      setIsLoading(false)
    }
  }

  if (user.role !== "admin") {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Ordering Timeframe
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="start-time">Start Time</Label>
            <Input
              id="start-time"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              disabled={isLoading}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="end-time">End Time</Label>
            <Input
              id="end-time"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              disabled={isLoading}
            />
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Timeframe updated successfully!</AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Current window: {startTime} - {endTime} (Europe/Tirane timezone)
          </p>
          <Button onClick={handleSave} disabled={isLoading}>
            <Save className="mr-2 h-4 w-4" />
            {isLoading ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
