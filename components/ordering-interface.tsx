// OrderingInterface.tsx
"use client"

import { useEffect, useState, useMemo } from "react"
import Image from "next/image"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { useAuth } from "@/components/auth-provider"
import { AdminPanel } from "@/components/admin-panel"
import { AdminOrderInsights } from "@/components/admin-order-insights"
import { ChatPanel } from "@/components/chat-panel"
import { ThemeToggle } from "@/components/theme-toggle"
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip, Bar, Cell } from "recharts"

import {
  getCurrentFriday,
  isOrderingWindowOpen,
  getTimeUntilNextWindow,
  formatFridayDate,
  getOrderingTimeframe,
} from "@/lib/utils/time"
import type { User, MenuItem, Order, OrderSummary } from "@/lib/types"
import { Clock, Users, ShoppingBag, LogOut } from "lucide-react"

interface OrderingInterfaceProps { user: User }

const FACILIZATION_COLORS = [
  "#1492E6",
  "#3A88CF",
  "#84BB2A",
  "#0693E3",
  "#1D1D1D",
] as const


export function OrderingInterface({ user }: OrderingInterfaceProps) {
  const { signOut } = useAuth()
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null)
  const [isWindowOpen, setIsWindowOpen] = useState(false)
  const [timeUntilNext, setTimeUntilNext] = useState({ days: 0, hours: 0, minutes: 0 })
  const [timeframe, setTimeframe] = useState<{ startTime: string; endTime: string }>({ startTime: "", endTime: "" })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedItem, setSelectedItem] = useState("")
  const [selectedVariant, setSelectedVariant] = useState("")
  const [notes, setNotes] = useState("")
  const [phone, setPhone] = useState(user.phone || "")

  const supabase = createClient()
  const fridayDate = formatFridayDate(getCurrentFriday())

  const availableVariants = menuItems.filter((i) => i.item === selectedItem && i.active)

  const { orderSummary, topItemData } = useMemo(() => {
    const summaryMap = new Map<string, OrderSummary>()

    orders.forEach((orderItem) => {
      const key = `${orderItem.item}::${orderItem.variant}`
      const existing = summaryMap.get(key)

      if (existing) {
        existing.count += 1
      } else {
        summaryMap.set(key, {
          item: orderItem.item,
          variant: orderItem.variant,
          count: 1,
        })
      }
    })

    const summaryList = Array.from(summaryMap.values()).sort((a, b) => b.count - a.count)

    const chartData = summaryList.slice(0, 5).map((entry) => ({
      label: entry.variant ? `${entry.item} (${entry.variant})` : entry.item,
      value: entry.count,
    }))

    return { orderSummary: summaryList, topItemData: chartData }
  }, [orders])

  useEffect(() => {
    void fetchEverything()
    const interval = setInterval(() => { void updateWindowStatus() }, 60_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => { void updateWindowStatus() }, [])

  const fetchEverything = async () => {
    await Promise.all([fetchData(), fetchTimeframe()])
  }

  const updateWindowStatus = async () => {
    const [open, timeUntil, tf] = await Promise.all([
      isOrderingWindowOpen(),
      getTimeUntilNextWindow(),
      getOrderingTimeframe(),
    ])
    setIsWindowOpen(open)
    setTimeUntilNext(timeUntil)
    setTimeframe(tf)
  }

  const fetchTimeframe = async () => {
    const tf = await getOrderingTimeframe()
    setTimeframe(tf)
  }

  const fetchData = async () => {
    try {
      const { data: menuData } = await supabase.from("menu_items").select("*").eq("active", true).order("item, variant")
      const { data: ordersData } = await supabase
        .from("orders").select(`*, user:users(name, email)`).eq("friday_date", fridayDate).order("created_at")
      const { data: currentOrderData } = await supabase
        .from("orders").select("*").eq("user_id", user.id).eq("friday_date", fridayDate).single()

      setMenuItems(menuData || [])
      setOrders(ordersData || [])
      setCurrentOrder(currentOrderData || null)

      if (currentOrderData) {
        setSelectedItem(currentOrderData.item)
        setSelectedVariant(currentOrderData.variant)
        setNotes(currentOrderData.notes || "")
      }
    } catch (e) {
      console.error("Error fetching data:", e)
    }
  }

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true); setError(null)

    if (!selectedItem || !selectedVariant) { setError("Please select both item and variant"); setIsLoading(false); return }
    if (notes.length > 100) { setError("Notes must be 100 characters or less"); setIsLoading(false); return }

    try {
      const orderData = { user_id: user.id, friday_date: fridayDate, item: selectedItem, variant: selectedVariant, notes: notes.trim() || null }
      if (currentOrder) {
        const { error } = await supabase.from("orders").update(orderData).eq("id", currentOrder.id)
        if (error) throw error
        await supabase.from("events").insert({ type: "order_updated", user_id: user.id, payload: { order_id: currentOrder.id, ...orderData } })
      } else {
        const { error } = await supabase.from("orders").insert(orderData)
        if (error) throw error
        await supabase.from("events").insert({ type: "order_created", user_id: user.id, payload: orderData })
      }

      if (phone !== user.phone) await supabase.from("users").update({ phone }).eq("id", user.id)
      await fetchData()
    } catch (e) {
      setError(e instanceof Error ? e.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  const formatTimeUntil = () =>
    timeUntilNext.days > 0 ? `${timeUntilNext.days}d ${timeUntilNext.hours}h ${timeUntilNext.minutes}m`
    : timeUntilNext.hours > 0 ? `${timeUntilNext.hours}h ${timeUntilNext.minutes}m`
    : `${timeUntilNext.minutes}m`

  const isOrdersLocked = currentOrder?.locked || false
  const canOrder = isWindowOpen && !isOrdersLocked

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4 sm:items-center">
            <div className="relative h-12 w-12 overflow-hidden rounded-full ring-2 ring-[#1492e6]/30 shadow-md sm:h-16 sm:w-16">
              <Image
                src="/brand/logo-mark.png"
                alt="Facilization Friday mark"
                fill
                sizes="(max-width: 640px) 48px, 64px"
                priority
                className="object-contain"
              />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Friday Tony's Orders</h1>
              <p className="text-muted-foreground">
                Welcome back, {user.name}
                {user.role === "admin" && <Badge className="ml-2">Admin</Badge>}
              </p>
              <p className="text-xs uppercase tracking-[0.2em] text-primary/80">Facilization - Very Serious Work</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:self-end">
            <ThemeToggle />
            <Button variant="outline" onClick={signOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>

        {/* Status Bar */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    {isWindowOpen ? "Ordering Window Open" : "Ordering Window Closed"}
                  </span>
                  <Badge variant={canOrder ? "default" : "secondary"}>
                    {isOrdersLocked
                      ? "Locked by Admin"
                      : isWindowOpen
                        ? `Open until ${timeframe.endTime}`
                        : `Next: ${formatTimeUntil()}`}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  {orders.length} ordered
                </div>
                <div className="flex items-center gap-1">
                  <ShoppingBag className="h-4 w-4" />
                  {orderSummary.reduce((sum, item) => sum + item.count, 0)} meals
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Order Form */}
          <Card>
            <CardHeader>
              <CardTitle>
                {currentOrder ? "Update Your Order" : "Place Your Order"}
                {currentOrder && <Badge className="ml-2">Ordered</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmitOrder} className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" value={user.name} disabled />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="item">Item *</Label>
                  <Select
                    value={selectedItem}
                    onValueChange={(value) => {
                      setSelectedItem(value)
                      setSelectedVariant("")
                    }}
                    disabled={!canOrder}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select an item" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(new Set(menuItems.map((item) => item.item))).map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="variant">Variant *</Label>
                  <Select
                    value={selectedVariant}
                    onValueChange={setSelectedVariant}
                    disabled={!canOrder || !selectedItem}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a variant" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableVariants.map((item) => (
                        <SelectItem key={item.id} value={item.variant}>
                          {item.variant}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="notes">Notes (optional)</Label>
                  <Textarea
                    id="notes"
                    placeholder="Any special requests..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    maxLength={100}
                    disabled={!canOrder}
                  />
                  <p className="text-xs text-muted-foreground">{notes.length}/100 characters</p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="phone">Phone (optional)</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+355 69 123 4567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={!canOrder}
                  />
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <Button type="submit" className="w-full" disabled={!canOrder || isLoading}>
                  {isLoading ? "Saving..." : currentOrder ? "Update Order" : "Place Order"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Team Orders</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="font-medium">Most Ordered This Week</h4>
                    {topItemData.length > 0 && (
                      <Badge variant="outline">Top {topItemData.length}</Badge>
                    )}
                  </div>
                  {topItemData.length > 0 ? (
                    <div className="h-56 w-full rounded-xl bg-[var(--accent)]/40 p-3">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={topItemData}>
                          <CartesianGrid stroke="#E1F2FF" strokeDasharray="3 3" vertical={false} />
                          <XAxis
                            dataKey="label"
                            tick={{ fill: "var(--field-text)", fontSize: 12 }}
                            tickLine={false}
                            axisLine={{ stroke: "var(--border)" }}
                            height={48}
                            interval={0}
                            angle={-15}
                            textAnchor="end"
                          />
                          <YAxis
                            allowDecimals={false}
                            tick={{ fill: "var(--field-text)", fontSize: 12 }}
                            tickLine={false}
                            axisLine={{ stroke: "var(--border)" }}
                          />
                          <RechartsTooltip
                            cursor={{ fill: "rgba(20, 146, 230, 0.08)" }}
                            contentStyle={{
                              backgroundColor: "var(--background)",
                              borderRadius: "0.75rem",
                              border: "1px solid var(--border)",
                              color: "var(--field-text)",
                            }}
                          />
                          <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                            {topItemData.map((_, index) => (
                              <Cell
                                key={`top-item-${index}`}
                                fill={FACILIZATION_COLORS[index % FACILIZATION_COLORS.length]}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Order trends will appear once teammates start ordering.
                    </p>
                  )}
                </div>

                <Separator />

                <div>
                  <h4 className="mb-2 font-medium">Order Summary</h4>
                  <div className="space-y-2">
                    {orderSummary.map((summary) => (
                      <div key={`${summary.item}-${summary.variant}`} className="flex justify-between text-sm">
                        <span>
                          {summary.item} - {summary.variant}
                        </span>
                        <Badge variant="secondary">x{summary.count}</Badge>
                      </div>
                    ))}
                    {orderSummary.length === 0 && (
                      <p className="text-sm text-muted-foreground">No orders yet</p>
                    )}
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="mb-2 font-medium">Individual Orders</h4>
                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {orders.map((order) => (
                      <div key={order.id} className="flex items-start justify-between text-sm">
                        <div>
                          <p className="font-medium">{order.user?.name}</p>
                          <p className="text-muted-foreground">
                            {order.item} - {order.variant}
                          </p>
                          {order.notes && <p className="text-xs text-muted-foreground italic">"{order.notes}"</p>}
                        </div>
                        {order.user_id === user.id && <Badge variant="outline">You</Badge>}
                      </div>
                    ))}
                    {orders.length === 0 && (
                      <p className="text-sm text-muted-foreground">No orders yet</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
            <ChatPanel currentUser={user} />
          </div>
        </div>

        {/* Admin Tools */}
        {user.role === "admin" && (
          <>
            <AdminOrderInsights orders={orders} />
            <div>
              <AdminPanel user={user} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}





