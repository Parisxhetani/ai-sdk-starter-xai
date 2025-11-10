"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { TimeframeSettings } from "@/components/timeframe-settings"
import { AdminOrderManagement } from "@/components/admin-order-management"
import { AdminOrderInsights } from "@/components/admin-order-insights"
import type { AdminOrderManagementHandle } from "@/components/admin-order-management"
import { AdminUserManagement } from "@/components/admin-user-management"
import { getCurrentFriday, formatFridayDate } from "@/lib/utils/time"
import type { Order, Event, MenuItem, User } from "@/lib/types"
import { Lock, Unlock, Download, Settings, Users, Eye, Printer, MessageCircle, MessageSquare } from "lucide-react"

function getFriendlyOrderDate(orderDate: string | null): string {
  if (!orderDate) return "këtë javë"
  const safeDate = new Date(`${orderDate}T00:00:00`)
  if (Number.isNaN(safeDate.getTime())) {
    return orderDate
  }
  return safeDate.toLocaleDateString("sq-AL", { weekday: "long", month: "long", day: "numeric" })
}

function buildOrderSummaryMessage(orders: Order[], fridayDate: string | null): string {
  if (!orders.length) {
    return "Përmbledhja e porosive do të shfaqet sapo të kemi porosi të konfirmuara."
  }

  const summaryMap = new Map<string, number>()
  orders.forEach((order) => {
    const label = order.variant ? `${order.item} (${order.variant})` : order.item
    summaryMap.set(label, (summaryMap.get(label) ?? 0) + 1)
  })

  const summaryLines = Array.from(summaryMap.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1]
      return a[0].localeCompare(b[0])
    })
    .map(([label, count]) => `• ${label}: ${count}`)

  const noteLines = orders
    .map((entry) => {
      const trimmed = entry.notes?.trim()
      if (!trimmed) return null
      const name = entry.user?.name || entry.user?.email || "I panjohur"
      return `- ${name}: ${trimmed}`
    })
    .filter((line): line is string => Boolean(line))

  const parts = [
    `Përshëndetje! Ja porosia jonë për ${getFriendlyOrderDate(fridayDate)}.`,
    `${orders.length} porosi gjithsej.`,
    "",
    ...summaryLines,
  ]

  if (noteLines.length) {
    parts.push("", "Shënime:", ...noteLines)
  }

  parts.push("", "Njofto na sapo ta marrësh. Faleminderit!")
  return parts.join("\n")
}

function formatPhoneForWhatsApp(value: string): string {
  return value.replace(/\D/g, "")
}

const DEFAULT_TEST_PHONE = "+355694006070"

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
  const [fridayDate, setFridayDate] = useState<string | null>(null)
  const [tonyPhone, setTonyPhone] = useState("")
  const [isSavingTonyPhone, setIsSavingTonyPhone] = useState(false)
  const [contactError, setContactError] = useState<string | null>(null)
  const [contactSaved, setContactSaved] = useState(false)
  const [testPhone, setTestPhone] = useState(DEFAULT_TEST_PHONE)

  const orderManagementRef = useRef<AdminOrderManagementHandle | null>(null)

  const supabase = useMemo(() => createClient(), [])
  const orderSummaryMessage = useMemo(() => buildOrderSummaryMessage(orders, fridayDate), [orders, fridayDate])
  const sanitizedTonyPhone = useMemo(() => formatPhoneForWhatsApp(tonyPhone), [tonyPhone])
  const sanitizedTestPhone = useMemo(() => formatPhoneForWhatsApp(testPhone), [testPhone])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const date = await getCurrentFriday()
        if (!cancelled) {
          setFridayDate(formatFridayDate(date))
        }
      } catch (error) {
        console.error("Failed to resolve ordering date:", error)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (user.role === "admin" && fridayDate) {
      void fetchAdminData(fridayDate)
    }
  }, [user.role, fridayDate])

  useEffect(() => {
    if (user.role !== "admin" || !fridayDate) return

    const channel = supabase
      .channel("orders-admin-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, () => fetchAdminData(fridayDate))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, () => fetchAdminData(fridayDate))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "orders" }, () => fetchAdminData(fridayDate))
      .subscribe()

    const usersChannel = supabase
      .channel("users-admin-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "users" }, () => fetchAdminData(fridayDate))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "users" }, () => fetchAdminData(fridayDate))
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
      void supabase.removeChannel(usersChannel)
    }
    }, [user.role, supabase, fridayDate])

  useEffect(() => {
    if (user.role !== "admin") return

    let cancelled = false
    const loadTonyPhone = async () => {
      try {
        const { data, error } = await supabase
          .from("settings")
          .select("value")
          .eq("key", "tony_phone")
          .maybeSingle()

        if (error) throw error

        if (!cancelled) {
          setTonyPhone(data?.value ?? "")
          setContactError(null)
        }
      } catch (error) {
        console.error("Failed to load Tony's phone number:", error)
        if (!cancelled) {
          setContactError("Unable to load Tony's phone number. Please save it again.")
        }
      }
    }

    void loadTonyPhone()

    return () => {
      cancelled = true
    }
  }, [user.role, supabase])

  const fetchAdminData = async (targetDate: string | null = fridayDate) => {
    if (!targetDate) return
    try {
      const response = await fetch(`/api/admin/orders?fridayDate=${targetDate}`, { cache: "no-store", credentials: "include" })
      if (!response.ok) {
        throw new Error("Failed to load admin data")
      }
      const data = await response.json()
      setOrders(data.orders || [])
      setEvents(data.events || [])
      setMenuItems(data.menuItems || [])
      setAllUsers(data.users || [])
      setIsLocked((data.orders || []).some((order: Order) => order.locked))
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
    if (!fridayDate) {
      console.error("Cannot toggle lock without a target order date")
      return
    }
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
      await fetchAdminData(fridayDate)
    } catch (error) {
      console.error("Error toggling lock:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleExportCSV = async () => {
    if (!fridayDate) {
      console.error("Cannot export CSV without a target order date")
      return
    }
    try {
      // Log export action
      await supabase.from("events").insert({
        type: "csv_exported",
        user_id: user.id,
        payload: { friday_date: fridayDate, order_count: orders.length },
      })

      const formatCsvField = (value: string | number | null | undefined) => {
        const raw = value ?? ""
        const normalized = typeof raw === "string" ? raw : String(raw)
        return `"${normalized.replace(/"/g, '""')}"`
      }

      const groupedOrders = orders.reduce((map, order) => {
        const key = `${order.item}::${order.variant}`
        if (!map.has(key)) {
          map.set(key, { item: order.item, variant: order.variant, orders: [] as Order[] })
        }
        map.get(key)!.orders.push(order)
        return map
      }, new Map<string, { item: string; variant: string; orders: Order[] }>())

      const sortedGroups = Array.from(groupedOrders.values()).sort((a, b) => {
        const itemCompare = a.item.localeCompare(b.item)
        if (itemCompare !== 0) return itemCompare
        return a.variant.localeCompare(b.variant)
      })

      const csvLines: string[] = []
      const pushRow = (fields: Array<string | number | null | undefined>) => {
        csvLines.push(fields.map(formatCsvField).join(","))
      }

      pushRow(["Report", "Friday Orders"])
      pushRow(["Friday Date", fridayDate])
      pushRow(["Generated At", new Date().toLocaleString()])
      pushRow(["Total Orders", orders.length])
      csvLines.push("")

      pushRow(["Section", "Item", "Variant", "Quantity", "Names", "Emails", "Phones", "Notes", "Order Times"])
      sortedGroups.forEach((group) => {
        const names = Array.from(
          new Set(
            group.orders
              .map((entry) => entry.user?.name || entry.user?.email || entry.user_id)
              .filter((value): value is string => Boolean(value)),
          ),
        ).join("; ")
        const emails = Array.from(
          new Set(group.orders.map((entry) => entry.user?.email).filter((value): value is string => Boolean(value))),
        ).join("; ")
        const phones = Array.from(
          new Set(group.orders.map((entry) => entry.user?.phone).filter((value): value is string => Boolean(value))),
        ).join("; ")
        const notesSummary = group.orders
          .map((entry) => entry.notes?.trim())
          .filter((note): note is string => Boolean(note))
          .join(" | ")
        const orderTimes = group.orders
          .map((entry) => new Date(entry.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
          .join("; ")

        pushRow(["Summary", group.item, group.variant, group.orders.length, names, emails, phones, notesSummary, orderTimes])
      })

      csvLines.push("")
      pushRow(["Section", "Item", "Variant", "Quantity", "Name", "Email", "Phone", "Notes", "Order Time"])
      sortedGroups.forEach((group) => {
        pushRow(["Group Total", group.item, group.variant, group.orders.length, "", "", "", "", ""])

        const sortedOrders = [...group.orders].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        )

        sortedOrders.forEach((entry) => {
          const displayName = entry.user?.name || entry.user?.email || entry.user_id
          pushRow([
            "Order",
            group.item,
            group.variant,
            1,
            displayName,
            entry.user?.email ?? "",
            entry.user?.phone ?? "",
            entry.notes ?? "",
            new Date(entry.created_at).toLocaleString(),
          ])
        })
      })

      const csvContent = csvLines.join("\n")

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
    if (!fridayDate) {
      console.error("Cannot print orders without a target order date")
      return
    }
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
      const response = await fetch("/api/admin/menu", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: itemId, active: !currentActive }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || "Failed to toggle menu item")
      }

      await fetchAdminData()
    } catch (error) {
      console.error("Error toggling menu item:", error)
    }
  }

  const handleSaveTonyPhone = async () => {
    const normalized = tonyPhone.trim()

    if (!normalized) {
      setContactError("Please enter Tony's phone number in international format.")
      return
    }

    if (formatPhoneForWhatsApp(normalized).length < 8) {
      setContactError("Please include the full international number (e.g. +355 69 123 4567).")
      return
    }

    setIsSavingTonyPhone(true)
    setContactError(null)
    setContactSaved(false)

    try {
      const payload = { key: "tony_phone", value: normalized, updated_at: new Date().toISOString() }
      const { error } = await supabase.from("settings").upsert(payload, { onConflict: "key" })

      if (error) throw error

      await supabase.from("events").insert({
        type: "tony_phone_updated",
        user_id: user.id,
        payload: { tony_phone: normalized },
      })

      setContactSaved(true)
      setTimeout(() => setContactSaved(false), 2500)
    } catch (error) {
      console.error("Failed to save Tony's phone number:", error)
      setContactError(error instanceof Error ? error.message : "Failed to save Tony's number")
    } finally {
      setIsSavingTonyPhone(false)
    }
  }

  const openWhatsAppWindow = (phoneDigits: string, message: string, onMissingPopup?: () => void) => {
    const whatsappUrl = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`
    const popup = window.open(whatsappUrl, "_blank", "noopener,noreferrer")

    if (!popup && onMissingPopup) {
      onMissingPopup()
    }
  }

  const openSmsWindow = (phoneDigits: string, message: string) => {
    const smsUrl = `sms:${phoneDigits}?&body=${encodeURIComponent(message)}`
    const popup = window.open(smsUrl, "_blank", "noopener,noreferrer")
    if (!popup) {
      window.location.href = smsUrl
    }
  }

  const handleSendWhatsApp = () => {
    if (!sanitizedTonyPhone) {
      setContactError("Please save Tony's phone number first.")
      return
    }

    if (!orders.length) {
      alert("No orders available to send yet.")
      return
    }

    openWhatsAppWindow(sanitizedTonyPhone, orderSummaryMessage, () => {
      alert("Please allow pop-ups so we can open WhatsApp Web.")
    })
  }

  const handleSendTestWhatsApp = () => {
    if (!sanitizedTestPhone) {
      alert("Enter the phone number you want to test with first.")
      return
    }

    openWhatsAppWindow(sanitizedTestPhone, orderSummaryMessage, () => {
      alert("Please allow pop-ups so we can open WhatsApp Web.")
    })
  }

  const handleSendSMS = () => {
    if (!sanitizedTonyPhone) {
      setContactError("Please save Tony's phone number first.")
      return
    }

    if (!orders.length) {
      alert("No orders available to send yet.")
      return
    }

    openSmsWindow(sanitizedTonyPhone, orderSummaryMessage)
  }

  const handleSendTestSMS = () => {
    if (!sanitizedTestPhone) {
      alert("Enter the phone number you want to test with first.")
      return
    }

    openSmsWindow(sanitizedTestPhone, orderSummaryMessage)
  }

  if (user.role !== "admin") {
    return null
  }

  const orderedUserIds = orders.map((order) => order.user_id)
  const missingUsers = allUsers.filter((u) => u.whitelisted && !orderedUserIds.includes(u.id))
  const uniqueItemsCount = new Set(orders.map((order) => `${order.item}::${order.variant}`)).size
  const messagePreview = orderSummaryMessage
  const messagePreviewRows = Math.min(12, Math.max(5, messagePreview.split("\n").length + 1))

  return (
    <div className="space-y-6">
      <TimeframeSettings user={user} />

      <AdminOrderManagement ref={orderManagementRef} user={user} onChange={fetchAdminData} />\r\n\r\n      <AdminOrderInsights orders={orders} users={allUsers} />

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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            WhatsApp & SMS
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Save Tony's number once and share the weekly order via free WhatsApp or a regular SMS.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="tony-phone">Tony's phone number</Label>
              <Input
                id="tony-phone"
                placeholder="+355 69 123 4567"
                value={tonyPhone}
                onChange={(event) => {
                  setTonyPhone(event.target.value)
                  setContactError(null)
                  setContactSaved(false)
                }}
                disabled={isSavingTonyPhone}
              />
            </div>
            <Button onClick={handleSaveTonyPhone} disabled={isSavingTonyPhone}>
              {isSavingTonyPhone ? "Saving..." : "Save Number"}
            </Button>
          </div>
          {contactError && <p className="text-sm text-destructive">{contactError}</p>}
          {contactSaved && <p className="text-sm text-emerald-600">Number saved. Ready to ping Tony.</p>}
          <div className="space-y-2">
            <Label htmlFor="whatsapp-preview">Message preview</Label>
            <Textarea
              id="whatsapp-preview"
              value={messagePreview}
              rows={messagePreviewRows}
              readOnly
              className="min-h-[160px] resize-none"
            />
          </div>
          <div className="space-y-3 rounded-lg border border-dashed border-border/70 p-4">
            <p className="text-sm font-medium">Send yourself a test first</p>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div className="space-y-2">
                <Label htmlFor="test-phone">Test recipient</Label>
                <Input
                  id="test-phone"
                  placeholder="+355 69 40 06 070"
                  value={testPhone}
                  onChange={(event) => setTestPhone(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Button variant="outline" onClick={handleSendTestWhatsApp}>
                  Send Test WhatsApp
                </Button>
                <Button variant="outline" onClick={handleSendTestSMS}>
                  Send Test SMS
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Uses the same Albanian message but only reaches the number above. Perfect for double-checking formatting before Tony sees it.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={handleSendWhatsApp}
              disabled={!orders.length || !sanitizedTonyPhone}
              className="bg-[#25D366] text-white hover:bg-[#1DAA52] disabled:pointer-events-none disabled:opacity-60"
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              Send via WhatsApp
            </Button>
            <Button variant="outline" onClick={handleSendSMS} disabled={!orders.length || !sanitizedTonyPhone}>
              <MessageSquare className="mr-2 h-4 w-4" />
              Send via SMS
            </Button>
            <p className="text-xs text-muted-foreground">
              WhatsApp opens wa.me in a new tab, while SMS launches the default messaging app—no integrations needed.
            </p>
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
                          className="data-[state=checked]:bg-primary"
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



















