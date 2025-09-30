"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { User, Order } from "@/lib/types"
import { ShieldCheck, ShieldOff, UsersRound, Edit3 } from "lucide-react"

interface AdminUserManagementProps {
  users: User[]
  orders: Order[]
  currentUserId: string
  onRefresh: () => Promise<void>
  onManageOrder: (userId: string, order?: Order) => void
}

interface FeedbackState {
  type: "success" | "error"
  message: string
}

export function AdminUserManagement({ users, orders, currentUserId, onRefresh, onManageOrder }: AdminUserManagementProps) {
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)

  useEffect(() => {
    if (!feedback) {
      return
    }
    const timeout = window.setTimeout(() => setFeedback(null), 4000)
    return () => window.clearTimeout(timeout)
  }, [feedback])

  const handleUpdate = async (userId: string, updates: Partial<User>, successMessage: string) => {
    setUpdatingUserId(userId)
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId, updates }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to update user")
      }

      setFeedback({ type: "success", message: successMessage })
      await onRefresh()
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to update user",
      })
    } finally {
      setUpdatingUserId(null)
    }
  }

  const handleRoleToggle = async (user: User) => {
    const nextRole = user.role === "admin" ? "member" : "admin"
    if (user.id === currentUserId && nextRole !== user.role) {
      setFeedback({ type: "error", message: "You cannot change your own role." })
      return
    }
    await handleUpdate(user.id, { role: nextRole }, `Updated ${user.name}'s role to ${nextRole}.`)
  }

  const handleWhitelistToggle = async (user: User, whitelisted: boolean) => {
    await handleUpdate(user.id, { whitelisted }, `${whitelisted ? "Enabled" : "Disabled"} access for ${user.name}.`)
  }

  const sortedUsers = [...users].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UsersRound className="h-5 w-5" />
          User Management
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {feedback && (
          <Alert variant={feedback.type === "error" ? "destructive" : "default"}>
            {feedback.type === "error" ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
            <AlertDescription>{feedback.message}</AlertDescription>
          </Alert>
        )}

        {sortedUsers.length === 0 && (
          <p className="text-sm text-muted-foreground">No users available.</p>
        )}

        {sortedUsers.map((user) => {
          const currentOrder = orders.find((order) => order.user_id === user.id)
          const isSelf = user.id === currentUserId
          const isUpdating = updatingUserId === user.id
          const roleActionLabel = user.role === "admin" ? "Set as Member" : "Make Admin"
          const manageOrderLabel = currentOrder ? "Manage Order" : "Create Order"

          return (
            <div
              key={user.id}
              className="flex flex-col gap-4 rounded-lg border border-border bg-card/60 p-4 transition-colors md:flex-row md:items-start md:justify-between"
            >
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-base">{user.name}</span>
                  <Badge variant={user.role === "admin" ? "default" : "secondary"}>{user.role === "admin" ? "Admin" : "Member"}</Badge>
                  {!user.whitelisted && <Badge variant="outline">Not Whitelisted</Badge>}
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>{user.email}</p>
                  {user.phone && <p>{user.phone}</p>}
                </div>
                {currentOrder ? (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      {currentOrder.item} � {currentOrder.variant}
                    </span>
                    {currentOrder.notes && <span className="italic">"{currentOrder.notes}"</span>}
                    {currentOrder.locked && <Badge variant="outline">Locked</Badge>}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No order submitted for this Friday.</p>
                )}
              </div>

              <div className="flex flex-col items-start gap-3 md:items-end">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch
                    checked={user.whitelisted}
                    onCheckedChange={(value) => handleWhitelistToggle(user, value)}
                    disabled={isUpdating}
                  />
                  <span>{user.whitelisted ? "Whitelisted" : "Blocked"}</span>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRoleToggle(user)}
                  disabled={isUpdating || (isSelf && user.role === "admin")}
                  className="min-w-[140px]"
                >
                  {isUpdating ? "Updating..." : roleActionLabel}
                </Button>

                <Button
                  size="sm"
                  onClick={() => onManageOrder(user.id, currentOrder)}
                  className="min-w-[140px]"
                >
                  <Edit3 className="mr-2 h-4 w-4" />
                  {manageOrderLabel}
                </Button>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
