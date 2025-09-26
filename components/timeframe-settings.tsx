// TimeframeSettings.tsx
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

interface TimeframeSettingsProps { user: User }

export function TimeframeSettings({ user }: TimeframeSettingsProps) {
  const [startTimeVal, setStartTimeVal] = useState("")
  const [endTimeVal, setEndTimeVal] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const supabase = createClient()

  useEffect(() => { void fetchTimeframe() }, [])

  const fetchTimeframe = async () => {
    try {
      const { startTime, endTime } = await getOrderingTimeframe()
      setStartTimeVal(startTime)
      setEndTimeVal(endTime)
    } catch (e) {
      console.error("Error fetching timeframe:", e)
    }
  }

  const handleSave = async () => {
    setIsLoading(true); setError(null); setSuccess(false)

    if (!startTimeVal || !endTimeVal) {
      setError("Both start and end times are required"); setIsLoading(false); return
    }

    const [sh, sm] = startTimeVal.split(":").map(Number)
    const [eh, em] = endTimeVal.split(":").map(Number)
    const s = sh * 60 + sm, e = eh * 60 + em
    if (s >= e) { setError("Start time must be before end time"); setIsLoading(false); return }

    try {
      // upsert both with a unique constraint on key (ensure DB has UNIQUE(settings.key))
      const payload = [
        { key: "ordering_start_time", value: startTimeVal, updated_at: new Date().toISOString() },
        { key: "ordering_end_time",   value: endTimeVal,   updated_at: new Date().toISOString() },
      ]

      const { error: upsertErr } = await supabase
        .from("settings")
        .upsert(payload, { onConflict: "key" })

      if (upsertErr) throw upsertErr

      await supabase.from("events").insert({
        type: "timeframe_updated",
        user_id: user.id,
        payload: { start_time: startTimeVal, end_time: endTimeVal },
      })

      setSuccess(true)
      setTimeout(() => setSuccess(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update timeframe")
    } finally {
      setIsLoading(false)
    }
  }

  if (user.role !== "admin") return null

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
            <Input id="start-time" type="time" value={startTimeVal}
                   onChange={(e) => setStartTimeVal(e.target.value)} disabled={isLoading}/>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="end-time">End Time</Label>
            <Input id="end-time" type="time" value={endTimeVal}
                   onChange={(e) => setEndTimeVal(e.target.value)} disabled={isLoading}/>
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
            Current window: {startTimeVal || "—"} - {endTimeVal || "—"} (Europe/Tirane)
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
