"use client"

import { useEffect, useMemo, useState } from "react"
import { Mail } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import type { Order, User } from "@/lib/types"

interface NotificationSenderProps {
  fridayDate: string | null
  users: User[]
  orders: Order[]
}

function formatFriendlyDate(orderDate: string | null): string {
  if (!orderDate) return "këtë javë"
  const safeDate = new Date(`${orderDate}T00:00:00`)
  if (Number.isNaN(safeDate.getTime())) return orderDate
  return safeDate.toLocaleDateString("sq-AL", { weekday: "long", month: "long", day: "numeric" })
}

function buildDefaultMessage(friendlyDate: string): string {
  return [
    "Hey team,",
    "",
    `Final reminder to lock in your Friday lunch order before exactly 12:00 today (${friendlyDate}).`,
    "We have to hand Tony the final list at noon, so please hop in and submit yours right now if you haven't already.",
    "",
    "Thanks!",
  ].join("\n")
}

export function NotificationSender({ fridayDate, users, orders }: NotificationSenderProps) {
  const orderedUserIds = useMemo(() => new Set(orders.map((order) => order.user_id)), [orders])
  const missingUsers = useMemo(() => users.filter((user) => user.whitelisted && !orderedUserIds.has(user.id)), [users, orderedUserIds])
  const missingEmails = useMemo(
    () =>
      Array.from(
        new Set(
          missingUsers
            .map((user) => user.email?.trim().toLowerCase())
            .filter((email): email is string => Boolean(email)),
        ),
      ),
    [missingUsers],
  )

  const friendlyDate = useMemo(() => formatFriendlyDate(fridayDate), [fridayDate])

  const defaultSubject = useMemo(() => {
    if (!fridayDate) return "Reminder: Friday lunch order closes at 12:00"
    return `Reminder: Order closes at 12:00 (${friendlyDate})`
  }, [fridayDate, friendlyDate])

  const defaultMessage = useMemo(() => buildDefaultMessage(friendlyDate), [friendlyDate])

  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [additionalRecipients, setAdditionalRecipients] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!subject) {
      setSubject(defaultSubject)
    }
  }, [defaultSubject, subject])

  useEffect(() => {
    if (!message) {
      setMessage(defaultMessage)
    }
  }, [defaultMessage, message])

  const manualEmails = useMemo(
    () =>
      additionalRecipients
        .split(/[,;\n]+/)
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.includes("@")),
    [additionalRecipients],
  )

  const finalRecipients = useMemo(() => {
    const combined = [...missingEmails, ...manualEmails]
    return Array.from(new Set(combined.filter(Boolean)))
  }, [missingEmails, manualEmails])

  const handleSend = async () => {
    if (!finalRecipients.length) return
    setIsSending(true)
    setStatusMessage(null)
    setErrorMessage(null)
    try {
      const response = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          message,
          recipients: finalRecipients,
          fridayDate,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || "Unable to send reminder email")
      }

      setStatusMessage(`Reminder sent to ${finalRecipients.length} teammate${finalRecipients.length > 1 ? "s" : ""}.`)
      setAdditionalRecipients("")
    } catch (error) {
      console.error("Reminder email failed:", error)
      setErrorMessage(error instanceof Error ? error.message : "Failed to send reminder email")
    } finally {
      setIsSending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Notification Sender
        </CardTitle>
        <CardDescription>Give the stragglers a friendly nudge before noon hits.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Recipients</Label>
          {missingUsers.length > 0 ? (
            <>
              <p className="text-sm text-muted-foreground">
                Automatically includes everyone who has not ordered yet ({missingUsers.length} teammate
                {missingUsers.length > 1 ? "s" : ""}).
              </p>
              <div className="flex flex-wrap gap-2">
                {missingUsers.map((user) => (
                  <Badge key={user.id} variant="outline">
                    {user.name || user.email}
                  </Badge>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Nice! Everyone already ordered. Add extra emails below if needed.</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="additional-recipients">Additional emails (comma or line separated)</Label>
          <Input
            id="additional-recipients"
            placeholder="press@company.com, manager@company.com"
            value={additionalRecipients}
            onChange={(event) => setAdditionalRecipients(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            We will merge these with the missing teammates above and remove duplicates automatically.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="reminder-subject">Email subject</Label>
          <Input id="reminder-subject" value={subject} onChange={(event) => setSubject(event.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="reminder-message">Email body</Label>
          <Textarea
            id="reminder-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={8}
          />
          <p className="text-xs text-muted-foreground">Keep it short and mention the 12:00 deadline so nobody misses it.</p>
        </div>

        {statusMessage && <p className="text-sm text-emerald-600">{statusMessage}</p>}
        {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}

        <Button onClick={handleSend} disabled={isSending || !finalRecipients.length}>
          {isSending ? "Sending…" : "Send Email Reminder"}
        </Button>
        {!finalRecipients.length && (
          <p className="text-xs text-muted-foreground">Add at least one valid email above to enable sending.</p>
        )}
      </CardContent>
    </Card>
  )
}
