"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { TimeframeSettings } from "@/components/timeframe-settings"
import { AdminOrderManagement } from "@/components/admin-order-management"
import { getCurrentFriday, formatFridayDate } from "@/lib/utils/time"
import type { Order, Event, MenuItem, User } from "@/lib/types"
import { Lock, Unlock, Download, MessageSquare, Settings, Users, Eye, Send, AlertTriangle } from "lucide-react"

interface AdminPanelProps {
  user: User
}

export function AdminPanel({ user }: AdminPanelProps) {
  const [orders, setOrders] = useState<Order[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [isLocked, setIsLocked] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [smsStatus, setSmsStatus] = useState<{ sent: boolean; timestamp?: string }>({ sent: false })
  const [smsLoading, setSmsLoading] = useState(false)
  const [showResendDialog, setShowResendDialog] = useState(false)

  const supabase = createClient()
  const fridayDate = formatFridayDate(getCurrentFriday())

  useEffect(() => {
    if (user.role === "admin") {
      fetchAdminData()
    }
  }, [user.role])

  const fetchAdminData = async () => {
    try {
      // Fetch orders with user details
      const { data: ordersData } = await supabase
        .from("orders")
        .select(`
          *,
          user:users(name, email, phone)
        `)
        .eq("friday_date", fridayDate)
        .order("created_at")

      // Fetch recent events
      const { data: eventsData } = await supabase
        .from("events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50)

      // Fetch menu items
      const { data: menuData } = await supabase.from("menu_items").select("*").order("item, variant")

      // Fetch all users
      const { data: usersData } = await supabase.from("users").select("*").order("name")

      // Check if orders are locked
      const locked = ordersData?.some((order) => order.locked) || false

      // Check SMS status for this Friday
      const { data: smsEvent } = await supabase
        .from("events")
        .select("*")
        .eq("type", "sms_sent")
        .eq("payload->>friday_date", fridayDate)
        .order("created_at", { ascending: false })
        .limit(1)
        .single()

      setOrders(ordersData || [])
      setEvents(eventsData || [])
      setMenuItems(menuData || [])
      setAllUsers(usersData || [])
      setIsLocked(locked)
      setSmsStatus({
        sent: !!smsEvent,
        timestamp: smsEvent?.created_at,
      })
    } catch (error) {
      console.error("Error fetching admin data:", error)
    }
  }

  const handleLockToggle = async () => {
    setIsLoading(true)
    try {
      const newLockState = !isLocked

      // Update all orders for this Friday
      const { error } = await supabase.from("orders").update({ locked: newLockState }).eq("friday_date", fridayDate)

      if (error) throw error

      // Log the action
      await supabase.from("events").insert({
        type: newLockState ? "orders_locked" : "orders_unlocked",
        user_id: user.id,
        payload: { friday_date: fridayDate, order_count: orders.length },
      })

      setIsLocked(newLockState)
      await fetchAdminData()
    } catch (error) {
      console.error("Error toggling lock:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleExportCSV = async () => {
    try {
      // Log export action
      await supabase.from("events").insert({
        type: "csv_exported",
        user_id: user.id,
        payload: { friday_date: fridayDate, order_count: orders.length },
      })

      // Generate CSV content
      const csvHeaders = ["Name", "Email", "Phone", "Item", "Variant", "Notes", "Order Time"]
      const csvRows = orders.map((order) => [
        order.user?.name || "",
        order.user?.email || "",
        order.user?.phone || "",
        order.item,
        order.variant,
        order.notes || "",
        new Date(order.created_at).toLocaleString(),
      ])

      const csvContent = [csvHeaders, ...csvRows].map((row) => row.map((field) => `"${field}"`).join(",")).join("\n")

      // Download CSV
      const blob = new Blob([csvContent], { type: "text/csv" })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `friday-orders-${fridayDate}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Error exporting CSV:", error)
    }
  }

  const handleSendSMS = async () => {
    setSmsLoading(true)
    try {
      const response = await fetch("/api/send-sms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Failed to send SMS")
      }

      await fetchAdminData()
      alert(`SMS sent successfully! ${result.orderCount} orders sent to Tony's.`)
    } catch (error) {
      console.error("Error sending SMS:", error)
      alert(error instanceof Error ? error.message : "Failed to send SMS")
    } finally {
      setSmsLoading(false)
    }
  }

  const handleResendSMS = async () => {
    setSmsLoading(true)
    try {
      const response = await fetch("/api/resend-sms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirmed: true }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Failed to resend SMS")
      }

      await fetchAdminData()
      setShowResendDialog(false)
      alert(`SMS resent successfully! ${result.orderCount} orders sent to Tony's.`)
    } catch (error) {
      console.error("Error resending SMS:", error)
      alert(error instanceof Error ? error.message : "Failed to send SMS")
    } finally {
      setSmsLoading(false)
    }
  }

  const toggleMenuItem = async (itemId: string, currentActive: boolean) => {
    try {
      const { error } = await supabase.from("menu_items").update({ active: !currentActive }).eq("id", itemId)

      if (error) throw error

      // Log the action
      await supabase.from("events").insert({
        type: "menu_item_toggled",
        user_id: user.id,
        payload: { item_id: itemId, active: !currentActive },
      })

      await fetchAdminData()
    } catch (error) {
      console.error("Error toggling menu item:", error)
    }
  }

  const generateSMSText = () => {
    const orderSummary = orders.reduce(
      (acc, order) => {
        const key = `${order.item}: ${order.variant}`
        acc[key] = (acc[key] || 0) + 1
        return acc
      },
      {} as Record<string, number>,
    )

    const summaryText = Object.entries(orderSummary)
      .map(([item, count]) => `${item} x${count}`)
      .join(", ")

    return `Friday order – Tony's (Tirana): ${orders.length} meals. ${summaryText}. Contact: ${user.phone || "N/A"}.`
  }

  if (user.role !== "admin") {
    return null
  }

  const orderedUserIds = orders.map((order) => order.user_id)
  const missingUsers = allUsers.filter((u) => u.whitelisted && !orderedUserIds.includes(u.id))
  const canSendSMS = isLocked && orders.length > 0

  return (
    <div className="space-y-6">
      <TimeframeSettings user={user} />

      <AdminOrderManagement user={user} />

      {/* Admin Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Admin Controls
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <Button onClick={handleLockToggle} disabled={isLoading} variant={isLocked ? "destructive" : "default"}>
              {isLocked ? <Unlock className="mr-2 h-4 w-4" /> : <Lock className="mr-2 h-4 w-4" />}
              {isLocked ? "Unlock Orders" : "Lock Orders"}
            </Button>

            <Button onClick={handleExportCSV} variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>

            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" disabled={!canSendSMS}>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Preview SMS
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>SMS Preview</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Message to Tony's:</Label>
                    <Textarea value={generateSMSText()} readOnly className="mt-2" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    This message will be sent to Tony's restaurant when you click "Send to Tony's".
                  </p>
                </div>
              </DialogContent>
            </Dialog>

            <Button
              onClick={handleSendSMS}
              disabled={!canSendSMS || smsLoading || smsStatus.sent}
              variant={smsStatus.sent ? "secondary" : "default"}
            >
              <Send className="mr-2 h-4 w-4" />
              {smsLoading ? "Sending..." : smsStatus.sent ? "SMS Sent" : "Send to Tony's"}
            </Button>

            {smsStatus.sent && (
              <Dialog open={showResendDialog} onOpenChange={setShowResendDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" disabled={smsLoading}>
                    <Send className="mr-2 h-4 w-4" />
                    Resend SMS
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                      Confirm Resend SMS
                    </DialogTitle>
                  </DialogHeader>
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Are you sure you want to resend the SMS to Tony's? This will send a duplicate order message.
                    </AlertDescription>
                  </Alert>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowResendDialog(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleResendSMS} disabled={smsLoading}>
                      {smsLoading ? "Resending..." : "Confirm Resend"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Order Status */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{orders.length}</p>
                <p className="text-sm text-muted-foreground">Total Orders</p>
              </div>
              <Badge variant={isLocked ? "destructive" : "default"}>{isLocked ? "Locked" : "Open"}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{missingUsers.length}</p>
                <p className="text-sm text-muted-foreground">Missing Orders</p>
              </div>
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{smsStatus.sent ? "Sent" : "Not Sent"}</p>
                <p className="text-sm text-muted-foreground">SMS Status</p>
                {smsStatus.timestamp && (
                  <p className="text-xs text-muted-foreground">{new Date(smsStatus.timestamp).toLocaleString()}</p>
                )}
              </div>
              <Badge variant={smsStatus.sent ? "default" : "secondary"}>
                {smsStatus.sent ? "Delivered" : "Pending"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Missing Users */}
      {missingUsers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Missing Orders ({missingUsers.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {missingUsers.map((user) => (
                <Badge key={user.id} variant="outline">
                  {user.name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Menu Management */}
      <Card>
        <CardHeader>
          <CardTitle>Menu Management</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from(new Set(menuItems.map((item) => item.item))).map((itemName) => (
              <div key={itemName}>
                <h4 className="font-medium mb-2">{itemName}</h4>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {menuItems
                    .filter((item) => item.item === itemName)
                    .map((menuItem) => (
                      <div key={menuItem.id} className="flex items-center justify-between p-2 border rounded">
                        <span className={menuItem.active ? "" : "text-muted-foreground line-through"}>
                          {menuItem.variant}
                        </span>
                        <Switch
                          checked={menuItem.active}
                          onCheckedChange={() => toggleMenuItem(menuItem.id, menuItem.active)}
                        />
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Audit Log */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {events.map((event) => (
              <div key={event.id} className="flex justify-between items-start text-sm p-2 border-l-2 border-muted">
                <div>
                  <p className="font-medium">{event.type.replace(/_/g, " ").toUpperCase()}</p>
                  <p className="text-muted-foreground">{new Date(event.created_at).toLocaleString()}</p>
                  {event.payload && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {JSON.stringify(event.payload, null, 2).slice(0, 100)}...
                    </p>
                  )}
                </div>
              </div>
            ))}
            {events.length === 0 && <p className="text-sm text-muted-foreground">No recent activity</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
