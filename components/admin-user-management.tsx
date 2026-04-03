"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { User, Order, MenuItem } from "@/lib/types"
import { formatLekPrice, formatOrderLine, getMenuItemLookupKey } from "@/lib/utils"
import { ShieldCheck, ShieldOff, UsersRound, Edit3, KeyRound, Trash2 } from "lucide-react"

interface AdminUserManagementProps {
  users: User[]
  orders: Order[]
  menuItems: MenuItem[]
  currentUserId: string
  onRefresh: () => Promise<void>
  onManageOrder: (userId: string, order?: Order) => void
}

interface FeedbackState {
  type: "success" | "error"
  message: string
}

type PendingAction = {
  userId: string
  action: "update" | "reset-password" | "delete-user"
}

export function AdminUserManagement({ users, orders, menuItems, currentUserId, onRefresh, onManageOrder }: AdminUserManagementProps) {
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)

  useEffect(() => {
    if (!feedback) {
      return
    }
    const timeout = window.setTimeout(() => setFeedback(null), 5000)
    return () => window.clearTimeout(timeout)
  }, [feedback])

  const handleUpdate = async (userId: string, updates: Partial<User>, successMessage: string) => {
    setPendingAction({ userId, action: "update" })
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
      setPendingAction(null)
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

  const handleResetPassword = async (user: User) => {
    if (user.id === currentUserId) {
      setFeedback({ type: "error", message: "Use the regular reset flow for your own password." })
      return
    }

    const shouldReset = window.confirm(
      `Reset ${user.name}'s password to the default password !Tirana1?\n\nThey should change it again after signing in.`,
    )
    if (!shouldReset) return

    setPendingAction({ userId: user.id, action: "reset-password" })

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: user.id, action: "reset_password" }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to reset password")
      }

      setFeedback({
        type: "success",
        message: `Reset ${user.name}'s password to ${data.defaultPassword ?? "!Tirana1"}.`,
      })
      await onRefresh()
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to reset password",
      })
    } finally {
      setPendingAction(null)
    }
  }

  const handleDeleteUser = async (user: User) => {
    if (user.id === currentUserId) {
      setFeedback({ type: "error", message: "You cannot delete your own account from this screen." })
      return
    }

    const shouldDelete = window.confirm(
      `Delete ${user.name} (${user.email})?\n\nThis removes their account, orders, and related records.`,
    )
    if (!shouldDelete) return

    setPendingAction({ userId: user.id, action: "delete-user" })

    try {
      const response = await fetch(`/api/admin/users?userId=${encodeURIComponent(user.id)}`, {
        method: "DELETE",
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete user")
      }

      setFeedback({
        type: "success",
        message: `Deleted ${user.name}'s account.`,
      })
      await onRefresh()
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to delete user",
      })
    } finally {
      setPendingAction(null)
    }
  }

  const sortedUsers = [...users].sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email))
  const menuPriceMap = new Map(menuItems.map((item) => [getMenuItemLookupKey(item.item, item.variant), item.price_all]))

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

        {sortedUsers.length === 0 && <p className="text-sm text-muted-foreground">No users available.</p>}

        {sortedUsers.map((user) => {
          const currentOrder = orders.find((order) => order.user_id === user.id)
          const isSelf = user.id === currentUserId
          const isPendingForUser = pendingAction?.userId === user.id
          const activeAction = isPendingForUser ? pendingAction?.action : null
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
                  <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                    {user.role === "admin" ? "Admin" : "Member"}
                  </Badge>
                  {isSelf && <Badge variant="outline">You</Badge>}
                  {!user.whitelisted && <Badge variant="outline">Not Whitelisted</Badge>}
                </div>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>{user.email}</p>
                  {user.phone && <p>{user.phone}</p>}
                </div>
                {currentOrder ? (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      {formatOrderLine(
                        currentOrder.item,
                        currentOrder.variant,
                        menuPriceMap.get(getMenuItemLookupKey(currentOrder.item, currentOrder.variant)),
                      )}
                    </span>
                    {currentOrder.cash_available_all > 0 && <span>Cash: {formatLekPrice(currentOrder.cash_available_all)}</span>}
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
                    disabled={isPendingForUser}
                  />
                  <span>{user.whitelisted ? "Whitelisted" : "Blocked"}</span>
                </div>

                <div className="flex flex-wrap gap-2 md:justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRoleToggle(user)}
                    disabled={isPendingForUser || (isSelf && user.role === "admin")}
                    className="min-w-[140px]"
                  >
                    {activeAction === "update" ? "Updating..." : roleActionLabel}
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleResetPassword(user)}
                    disabled={isPendingForUser || isSelf}
                    className="min-w-[140px]"
                  >
                    <KeyRound className="mr-2 h-4 w-4" />
                    {activeAction === "reset-password" ? "Resetting..." : "Reset Password"}
                  </Button>

                  <Button
                    size="sm"
                    onClick={() => onManageOrder(user.id, currentOrder)}
                    disabled={isPendingForUser}
                    className="min-w-[140px]"
                  >
                    <Edit3 className="mr-2 h-4 w-4" />
                    {manageOrderLabel}
                  </Button>

                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDeleteUser(user)}
                    disabled={isPendingForUser || isSelf}
                    className="min-w-[140px]"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {activeAction === "delete-user" ? "Deleting..." : "Delete User"}
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
