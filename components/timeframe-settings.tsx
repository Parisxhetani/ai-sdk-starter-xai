// TimeframeSettings.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getOrderingTimeframe, invalidateOrderingTimeframeCache } from "@/lib/utils/time"
import type { User } from "@/lib/types"
import { Clock, Save, AlertCircle } from "lucide-react"

interface TimeframeSettingsProps {
  user: User
}

const WEEKDAY_OPTIONS = [
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
  { value: "0", label: "Sunday" },
] as const

export function TimeframeSettings({ user }: TimeframeSettingsProps) {
  const [startTimeVal, setStartTimeVal] = useState("")
  const [endTimeVal, setEndTimeVal] = useState("")
  const [dayOfWeekVal, setDayOfWeekVal] = useState("5")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    void fetchTimeframe()
  }, [])

  const fetchTimeframe = async () => {
    try {
      const { startTime, endTime, dayOfWeek } = await getOrderingTimeframe()
      setStartTimeVal(startTime)
      setEndTimeVal(endTime)
      setDayOfWeekVal(String(dayOfWeek))
    } catch (e) {
      console.error("Error fetching timeframe:", e)
    }
  }

  const handleSave = async () => {
    setIsLoading(true)
    setError(null)
    setSuccess(false)

    if (!startTimeVal || !endTimeVal || dayOfWeekVal === "") {
      setError("Start time, end time, and day are required")
      setIsLoading(false)
      return
    }

    const [sh, sm] = startTimeVal.split(":").map(Number)
    const [eh, em] = endTimeVal.split(":").map(Number)
    const startMinutes = sh * 60 + sm
    const endMinutes = eh * 60 + em
    if (startMinutes >= endMinutes) {
      setError("Start time must be before end time")
      setIsLoading(false)
      return
    }

    try {
      const payload = [
        { key: "ordering_start_time", value: startTimeVal, updated_at: new Date().toISOString() },
        { key: "ordering_end_time", value: endTimeVal, updated_at: new Date().toISOString() },
        { key: "ordering_day_of_week", value: dayOfWeekVal, updated_at: new Date().toISOString() },
      ]

      const { error: upsertErr } = await supabase.from("settings").upsert(payload, { onConflict: "key" })

      if (upsertErr) throw upsertErr

      await supabase.from("events").insert({
        type: "timeframe_updated",
        user_id: user.id,
        payload: { start_time: startTimeVal, end_time: endTimeVal, day_of_week: dayOfWeekVal },
      })

      invalidateOrderingTimeframeCache()

      setSuccess(true)
      setTimeout(() => setSuccess(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update timeframe")
    } finally {
      setIsLoading(false)
    }
  }

  if (user.role !== "admin") return null

  const currentDayLabel = useMemo(() => {
    return WEEKDAY_OPTIONS.find((option) => option.value === dayOfWeekVal)?.label ?? "Friday"
  }, [dayOfWeekVal])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Ordering Timeframe
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="start-time">Start Time</Label>
            <Input
              id="start-time"
              type="time"
              value={startTimeVal}
              onChange={(event) => setStartTimeVal(event.target.value)}
              disabled={isLoading}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="end-time">End Time</Label>
            <Input
              id="end-time"
              type="time"
              value={endTimeVal}
              onChange={(event) => setEndTimeVal(event.target.value)}
              disabled={isLoading}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="weekday-select">Order Day</Label>
            <Select value={dayOfWeekVal} onValueChange={setDayOfWeekVal} disabled={isLoading}>
              <SelectTrigger
                id="weekday-select"
                className="bg-background text-foreground border-border"
              >
                <SelectValue placeholder="Select a day" />
              </SelectTrigger>
              <SelectContent className="bg-background text-foreground border border-border">
                {WEEKDAY_OPTIONS.map((option) => (
                  <SelectItem
                    className="focus:bg-accent focus:text-accent-foreground"
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            Current window: {currentDayLabel}, {startTimeVal || "-"} - {endTimeVal || "-"} (Europe/Tirane)
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
