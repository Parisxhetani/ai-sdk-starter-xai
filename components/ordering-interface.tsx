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

const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const


export function OrderingInterface({ user }: OrderingInterfaceProps) {
  const { signOut } = useAuth()
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null)
  const [isWindowOpen, setIsWindowOpen] = useState(false)
  const [timeUntilNext, setTimeUntilNext] = useState({ days: 0, hours: 0, minutes: 0 })
  const [timeframe, setTimeframe] = useState<{ startTime: string; endTime: string; dayOfWeek: number }>({
    startTime: "",
    endTime: "",
    dayOfWeek: 5,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedItem, setSelectedItem] = useState("")
  const [selectedVariant, setSelectedVariant] = useState("")
  const [notes, setNotes] = useState("")
  const [phone, setPhone] = useState(user.phone || "")
  const [fridayDate, setFridayDate] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const date = await getCurrentFriday()
        if (!cancelled) {
          setFridayDate(formatFridayDate(date))
        }
      } catch (err) {
        console.error("Failed to resolve ordering date:", err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

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
    if (!fridayDate) return
    void fetchEverything()
  }, [fridayDate])

  useEffect(() => {
    const interval = setInterval(() => {
      void updateWindowStatus()
    }, 60_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    void updateWindowStatus()
  }, [])

  const fetchEverything = async () => {
    if (!fridayDate) return
    await Promise.all([fetchData(fridayDate), fetchTimeframe()])
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

  const fetchData = async (targetDate: string) => {
    try {
      const { data: menuData } = await supabase.from("menu_items").select("*").eq("active", true).order("item, variant")
      const { data: ordersData } = await supabase
        .from("orders").select(`*, user:users(name, email)`).eq("friday_date", targetDate).order("created_at")
      const { data: currentOrderData } = await supabase
        .from("orders").select("*").eq("user_id", user.id).eq("friday_date", targetDate).single()

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

    if (!fridayDate) {
      setError("Ordering date unavailable. Please try again shortly.")
      setIsLoading(false)
      return
    }

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
      await fetchData(fridayDate)
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

  const teammateCount = useMemo(() => new Set(orders.map((order) => order.user_id)).size, [orders])
  const totalMeals = useMemo(() => orderSummary.reduce((sum, item) => sum + item.count, 0), [orderSummary])
  const targetWeekday =
    typeof timeframe.dayOfWeek === "number" && timeframe.dayOfWeek >= 0 && timeframe.dayOfWeek <= 6
      ? timeframe.dayOfWeek
      : 5
  const weekdayLabel = WEEKDAY_LABELS[targetWeekday]
  const windowStatusLabel = isOrdersLocked
    ? "Locked by Admin"
    : isWindowOpen
      ? `Open until ${timeframe.endTime} ${weekdayLabel}`
      : `Next window in ${formatTimeUntil()}`
  const timeframeLabel =
    timeframe.startTime && timeframe.endTime
      ? `${weekdayLabel} ${timeframe.startTime} - ${timeframe.endTime}`
      : "Schedule coming soon"
  const windowBadgeClass = [
    "mt-3 w-fit rounded-full px-3 py-1 text-xs font-medium shadow-sm",
    isOrdersLocked
      ? "border-destructive/40 bg-destructive/15 text-destructive"
      : canOrder
        ? "border-primary/30 bg-primary/15 text-primary"
        : "border-border/60 bg-white/50 text-muted-foreground dark:bg-white/10",
  ].join(" ")

  return (
    <>
      <div className="relative min-h-screen overflow-hidden px-4 pb-36 pt-6 sm:px-8 lg:px-12">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-40 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute bottom-[-6rem] right-[-4rem] h-96 w-96 rounded-full bg-[#ffd6f0]/40 blur-3xl" />
          <div className="absolute top-1/3 left-[-6rem] h-72 w-72 rounded-full bg-[#9fffe0]/35 blur-3xl" />
        </div>
        <div className="relative mx-auto w-full max-w-6xl space-y-10">
        {/* Hero */}
        <Card className="overflow-hidden border border-white/60 bg-white/70 p-0 shadow-[0_35px_90px_-45px_rgba(58,76,130,0.45)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/5">
          <div className="flex flex-col gap-8 p-6 sm:p-10">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4 sm:items-center">
                <div className="relative h-14 w-14 overflow-hidden rounded-2xl bg-white/80 ring-4 ring-primary/40 shadow-[0_12px_32px_-20px_rgba(58,76,130,0.55)] sm:h-16 sm:w-16 dark:bg-white/10 dark:ring-white/10">
                  <Image
                    src="/brand/logo-mark.png"
                    alt="Facilization Friday mark"
                    fill
                    sizes="(max-width: 640px) 56px, 64px"
                    priority
                    className="object-contain"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex flex-col gap-1">
                    <h1 className="text-3xl font-semibold sm:text-4xl">Friday Tony's Orders</h1>
                    <p className="text-muted-foreground">
                      Welcome back, {user.name}
                      {user.role === "admin" && (
                        <Badge variant="outline" className="ml-2 rounded-full border-primary/30 bg-primary/15 px-3 py-1 text-xs font-medium text-primary">
                          Admin
                        </Badge>
                      )}
                    </p>
                  </div>
                  <p className="text-xs uppercase tracking-[0.2em] text-primary/70">
                    Team lunches, but make it delightful
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 sm:self-end">
                <ThemeToggle />
                <Button
                  variant="outline"
                  className="rounded-full border-transparent bg-white/70 px-4 py-2 text-sm font-medium text-foreground shadow-[0_8px_24px_-18px_rgba(58,76,130,0.6)] transition hover:-translate-y-[2px] hover:bg-white/80 dark:bg-white/10 dark:text-foreground"
                  onClick={signOut}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </Button>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-[1.5rem] border border-white/60 bg-white/70 p-5 shadow-[0_24px_60px_-40px_rgba(58,76,130,0.55)] backdrop-blur-xl dark:border-white/10 dark:bg-white/10">
                <div className="flex items-center gap-3 text-sm font-semibold text-foreground">
                  <Clock className="h-5 w-5 text-primary" />
                  {isOrdersLocked ? "Ordering paused" : isWindowOpen ? "Window is open" : "Window closed"}
                </div>
                <Badge variant="outline" className={windowBadgeClass}>
                  {windowStatusLabel}
                </Badge>
                <p className="mt-3 text-xs text-muted-foreground">{timeframeLabel}</p>
              </div>
              <div className="rounded-[1.5rem] border border-white/60 bg-white/70 p-5 shadow-[0_24px_60px_-40px_rgba(58,76,130,0.55)] backdrop-blur-xl dark:border-white/10 dark:bg-white/10">
                <div className="flex items-center gap-3 text-sm font-semibold text-foreground">
                  <Users className="h-5 w-5 text-primary" />
                  Team lineup
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-semibold leading-none">{teammateCount}</span>
                  <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">teammates</span>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {teammateCount === 0 ? "No orders yet - start the hype!" : `Ready to feast together this ${weekdayLabel}.`}
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-white/60 bg-white/70 p-5 shadow-[0_24px_60px_-40px_rgba(58,76,130,0.55)] backdrop-blur-xl dark:border-white/10 dark:bg-white/10">
                <div className="flex items-center gap-3 text-sm font-semibold text-foreground">
                  <ShoppingBag className="h-5 w-5 text-primary" />
                  Meals planned
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-semibold leading-none">{totalMeals}</span>
                  <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">plates</span>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {totalMeals === 0 ? "Be the first to place an order!" : "Including every tweak and special request."}
                </p>
              </div>
            </div>
          </div>
        </Card>
        <div className="grid gap-8 lg:grid-cols-2">
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
                    <SelectTrigger className="border border-border/60 bg-white/70 text-foreground shadow-[0_12px_32px_-26px_rgba(58,76,130,0.45)] backdrop-blur-xl">
                      <SelectValue placeholder="Select an item" />
                    </SelectTrigger>
                    <SelectContent className="border border-border/60 bg-white/80 text-foreground backdrop-blur-xl dark:bg-white/10">
                      {Array.from(new Set(menuItems.map((item) => item.item))).map((item) => (
                        <SelectItem className="focus:bg-accent focus:text-accent-foreground" key={item} value={item}>
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
                    <SelectTrigger className="border border-border/60 bg-white/70 text-foreground shadow-[0_12px_32px_-26px_rgba(58,76,130,0.45)] backdrop-blur-xl">
                      <SelectValue placeholder="Select a variant" />
                    </SelectTrigger>
                    <SelectContent className="border border-border/60 bg-white/80 text-foreground backdrop-blur-xl dark:bg-white/10">
                      {availableVariants.map((item) => (
                        <SelectItem className="focus:bg-accent focus:text-accent-foreground" key={item.id} value={item.variant}>
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

                <Button type="submit" className="w-full rounded-full" disabled={!canOrder || isLoading}>
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
                    <div className="h-56 w-full rounded-[1.5rem] border border-white/50 bg-white/70 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)] backdrop-blur-xl dark:border-white/10 dark:bg-white/10">
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
                  <div className="max-h-64 space-y-2 overflow-y-auto rounded-[1.5rem] border border-white/50 bg-white/70 p-3 backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
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
          </div>
        </div>

        {user.role !== "admin" && <AdminOrderInsights orders={orders} />}

        {user.role === "admin" && (
          <div>
            <AdminPanel user={user} />
          </div>
        )}
        </div>
      </div>

    <div className="fixed inset-x-4 bottom-4 z-50 w-auto sm:inset-x-auto sm:right-6 sm:bottom-16 sm:w-[min(460px,92vw)] lg:bottom-10 lg:w-[480px] xl:bottom-8">
      <ChatPanel currentUser={user} />
    </div>
  </>
  );
}


