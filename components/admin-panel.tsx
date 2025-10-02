"use client"

import { useEffect, useState, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { TimeframeSettings } from "@/components/timeframe-settings"
import { AdminOrderManagement } from "@/components/admin-order-management"
import type { AdminOrderManagementHandle } from "@/components/admin-order-management"
import { AdminUserManagement } from "@/components/admin-user-management"
import { getCurrentFriday, formatFridayDate } from "@/lib/utils/time"
import type { Order, Event, MenuItem, User } from "@/lib/types"
import { Lock, Unlock, Download, Settings, Users, Eye, Printer } from "lucide-react"

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

  const orderManagementRef = useRef<AdminOrderManagementHandle | null>(null)

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

      // Fetch all users via admin API (service role)
      const usersResponse = await fetch("/api/admin/users", { credentials: "include", cache: "no-store" })
      if (!usersResponse.ok) {
        throw new Error("Failed to load users")
      }
      const usersJson = await usersResponse.json()
      const usersData = ((usersJson?.users as any[]) ?? []).map((entry) => {
        const { orders: _orders, ...user } = entry
        return user as User
      })

      // Check if orders are locked
      const locked = ordersData?.some((order) => order.locked) || false

    } catch (error) {
      console.error("Error fetching admin data:", error)
    }
  }

  const handleManageUserOrder = (targetUserId: string, order?: Order) => {
    if (order) {
      orderManagementRef.current?.openEditOrder(order)
    } else {
      orderManagementRef.current?.openCreateOrderForUser(targetUserId)
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

  const handlePrintOrders = () => {
    if (!orders.length) {
      alert('No orders available to print yet.')
      return
    }

    const normalize = (value?: unknown) => (value ? String(value) : '')

    const rowsHtml = orders
      .map((order) => {
        const createdAt = new Date(order.created_at).toLocaleString()
        return [
          '        <tr>',
          '          <td>' + normalize(order.user?.name) + '</td>',
          '          <td>' + normalize(order.user?.email) + '</td>',
          '          <td>' + normalize(order.user?.phone) + '</td>',
          '          <td>' + normalize(order.item) + '</td>',
          '          <td>' + normalize(order.variant) + '</td>',
          '          <td>' + normalize(order.notes) + '</td>',
          '          <td>' + createdAt + '</td>',
          '        </tr>',
        ].join("\n")
      })
      .join("\n")

    const summaryItems = Object.entries(
      orders.reduce((acc, order) => {
        const key = order.item + ' - ' + order.variant
        acc[key] = (acc[key] || 0) + 1
        return acc
      }, {} as Record<string, number>),
    )
      .map(([key, total]) => '        <li>' + key + ': <strong>' + total + '</strong></li>')
      .join("\n")

    const documentHtml = [
      '<!DOCTYPE html>',
      '<html>',
      '  <head>',
      '    <meta charSet="utf-8" />',
      '    <title>Friday Orders - ' + fridayDate + '</title>',
      '    <style>',
      '      body { font-family: Arial, sans-serif; padding: 24px; color: #0b1d12; }',
      '      h1 { margin-bottom: 8px; }',
      '      .summary { margin-bottom: 24px; }',
      '      table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }',
      '      th, td { border: 1px solid #8bc4a3; padding: 8px; text-align: left; font-size: 13px; }',
      '      th { background: #cff0d6; }',
      '      tr:nth-child(even) { background: #f5fbff; }',
      '      .badge { display: inline-block; padding: 4px 8px; border-radius: 12px; background: #7dc3ff; color: #04213b; font-size: 12px; margin-right: 12px; }',
      '      ul { list-style: none; padding-left: 0; margin: 12px 0 0 0; }',
      '      li { margin-bottom: 4px; }',
      '    </style>',
      '  </head>',
      '  <body>',
      '    <h1>Friday Orders - ' + fridayDate + '</h1>',
      '    <div class="summary">',
      '      <span class="badge">' + orders.length + ' meals</span>',
      '      <span>Locked: <strong>' + (isLocked ? 'Yes' : 'No') + '</strong></span>',
      '      <ul>',
      summaryItems,
      '      </ul>',
      '    </div>',
      '    <table>',
      '      <thead>',
      '        <tr>',
      '          <th>Name</th>',
      '          <th>Email</th>',
      '          <th>Phone</th>',
      '          <th>Item</th>',
      '          <th>Variant</th>',
      '          <th>Notes</th>',
      '          <th>Placed At</th>',
      '        </tr>',
      '      </thead>',
      '      <tbody>',
      rowsHtml,
      '      </tbody>',
      '    </table>',
      '  </body>',
      '</html>',
    ].join("\n")

    const printWindow = window.open('', '_blank', 'noopener,noreferrer')
    if (!printWindow) {
      alert('Unable to open print preview. Please allow popups for this site.')
      return
    }

    printWindow.document.open()
    printWindow.document.write(documentHtml)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
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

  if (user.role !== "admin") {
    return null
  }

  const orderedUserIds = orders.map((order) => order.user_id)
  const missingUsers = allUsers.filter((u) => u.whitelisted && !orderedUserIds.includes(u.id))
  const uniqueItemsCount = new Set(orders.map((order) => `${order.item}::${order.variant}`)).size

  return (
    <div className="space-y-6">
      <TimeframeSettings user={user} />

      <AdminOrderManagement ref={orderManagementRef} user={user} onChange={fetchAdminData} />

      <AdminUserManagement
        users={allUsers}
        orders={orders}
        currentUserId={user.id}
        onRefresh={fetchAdminData}
        onManageOrder={handleManageUserOrder}
      />

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

            <Button onClick={handlePrintOrders} variant="outline">
              <Printer className="mr-2 h-4 w-4" />
              Print Order Sheet
            </Button>
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
                <p className="text-2xl font-bold">{uniqueItemsCount}</p>
                <p className="text-sm text-muted-foreground">Distinct Items</p>
              </div>
              <Badge variant="outline">Menu</Badge>
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
