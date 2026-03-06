// OrderingInterface.tsx
"use client"

import { useEffect, useState, useMemo, useRef } from "react"
import Image from "next/image"
import { toast } from "sonner"
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
import { cn } from "@/lib/utils"

import {
  getCurrentFriday,
  isOrderingWindowOpen,
  getTimeUntilNextWindow,
  formatFridayDate,
  getOrderingTimeframe,
} from "@/lib/utils/time"
import type { User, MenuItem, Order, OrderSummary } from "@/lib/types"
import { Clock, Users, ShoppingBag, LogOut, Trash2, ChevronDown, PartyPopper, Flame } from "lucide-react"

interface OrderingInterfaceProps { user: User }

const FACILIZATION_COLORS = [
  "#1492E6",
  "#3A88CF",
  "#84BB2A",
  "#0693E3",
  "#1D1D1D",
] as const

const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const

const FOOD_EMOJIS: Record<string, string> = {
  burger: "🍔",
  pizza: "🍕",
  pasta: "🍝",
  salad: "🥗",
  sandwich: "🥪",
  chicken: "🍗",
  fish: "🐟",
  wrap: "🌯",
  soup: "🍲",
  steak: "🥩",
}

function getFoodEmoji(item: string): string {
  const lower = item.toLowerCase()
  for (const [key, emoji] of Object.entries(FOOD_EMOJIS)) {
    if (lower.includes(key)) return emoji
  }
  return "🍽️"
}

function ConfettiBurst({ active }: { active: boolean }) {
  if (!active) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {Array.from({ length: 60 }, (_, i) => (
        <div
          key={i}
          className="confetti-piece absolute"
          style={{
            left: `${Math.random() * 100}%`,
            top: -20,
            width: 8 + Math.random() * 10,
            height: 8 + Math.random() * 10,
            backgroundColor: ["#1492E6", "#84BB2A", "#FFD700", "#FF6B6B", "#A855F7", "#F97316", "#06B6D4"][i % 7],
            borderRadius: i % 3 === 0 ? "50%" : i % 3 === 1 ? "2px" : "0",
            transform: `rotate(${Math.random() * 360}deg)`,
            "--fall-duration": `${2 + Math.random() * 1.5}s`,
            "--fall-delay": `${Math.random() * 0.8}s`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  )
}

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
  const [isDeleting, setIsDeleting] = useState(false)
  const [teamRoster, setTeamRoster] = useState<Array<Pick<User, "id" | "name" | "email">>>([])
  const [showConfetti, setShowConfetti] = useState(false)
  const [pastOrders, setPastOrders] = useState<Array<{ date: string; order: Order | null }>>([])
  const [showHistory, setShowHistory] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const confettiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [selectedItem, setSelectedItem] = useState("")
  const [selectedVariant, setSelectedVariant] = useState("")
  const [notes, setNotes] = useState("")
  const [phone, setPhone] = useState(user.phone || "")
  const [fridayDate, setFridayDate] = useState<string | null>(null)

  const supabase = useMemo(() => createClient(), [])

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
    return () => { cancelled = true }
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
        summaryMap.set(key, { item: orderItem.item, variant: orderItem.variant, count: 1 })
      }
    })

    const summaryList = Array.from(summaryMap.values()).sort((a, b) => b.count - a.count)
    const chartData = summaryList.slice(0, 5).map((entry) => ({
      label: entry.variant ? `${entry.item} (${entry.variant})` : entry.item,
      value: entry.count,
    }))

    return { orderSummary: summaryList, topItemData: chartData }
  }, [orders])

  const rosterForInsights = useMemo(() => {
    const map = new Map<string, { id: string; name: string; email: string }>()
    teamRoster.forEach((member) => {
      map.set(member.id, { id: member.id, name: member.name ?? "", email: member.email ?? "" })
    })
    orders.forEach((orderItem) => {
      if (!map.has(orderItem.user_id) && (orderItem.user?.name || orderItem.user?.email)) {
        map.set(orderItem.user_id, {
          id: orderItem.user_id,
          name: orderItem.user?.name ?? "",
          email: orderItem.user?.email ?? "",
        })
      }
    })
    return Array.from(map.values())
  }, [orders, teamRoster])

  // Initial data fetch
  useEffect(() => {
    if (!fridayDate) return
    void fetchEverything().finally(() => setIsInitialLoading(false))
  }, [fridayDate])

  // Window status interval
  useEffect(() => {
    const interval = setInterval(() => { void updateWindowStatus() }, 60_000)
    return () => clearInterval(interval)
  }, [])

  // Roster for non-admins
  useEffect(() => {
    if (user.role === "admin") return
    let cancelled = false
    const loadRoster = async () => {
      try {
        const response = await fetch("/api/chat/users")
        if (!response.ok) throw new Error(`Failed to load teammates: ${response.status}`)
        const payload = (await response.json()) as {
          users: Array<{ id: string; name: string | null; email: string | null }>
        }
        if (cancelled) return
        setTeamRoster(payload.users.map((entry) => ({ id: entry.id, name: entry.name ?? "", email: entry.email ?? "" })))
      } catch (rosterError) {
        console.error("Unable to load teammate roster", rosterError)
      }
    }
    void loadRoster()
    return () => { cancelled = true }
  }, [user.role])

  // Realtime subscription for live order updates
  useEffect(() => {
    if (!fridayDate) return
    const channel = supabase
      .channel("orders-live-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, () => {
        void fetchData(fridayDate)
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, () => {
        void fetchData(fridayDate)
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "orders" }, () => {
        void fetchData(fridayDate)
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [fridayDate, supabase])

  // Initial window status
  useEffect(() => { void updateWindowStatus() }, [])

  // Cleanup confetti timer
  useEffect(() => {
    return () => {
      if (confettiTimerRef.current) clearTimeout(confettiTimerRef.current)
    }
  }, [])

  const triggerConfetti = () => {
    setShowConfetti(true)
    if (confettiTimerRef.current) clearTimeout(confettiTimerRef.current)
    confettiTimerRef.current = setTimeout(() => setShowConfetti(false), 3500)
  }

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

  const fetchPastOrders = async () => {
    if (!fridayDate) return
    setIsLoadingHistory(true)
    try {
      const current = new Date(fridayDate + "T00:00:00")
      const pastDates = [1, 2, 3].map(weeks => {
        const d = new Date(current)
        d.setDate(d.getDate() - 7 * weeks)
        return d.toISOString().split("T")[0]
      })
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", user.id)
        .in("friday_date", pastDates)
        .order("friday_date", { ascending: false })
      const ordersMap = new Map((data || []).map(o => [o.friday_date, o]))
      setPastOrders(pastDates.map(date => ({ date, order: ordersMap.get(date) || null })))
    } catch (e) {
      console.error("Failed to fetch past orders:", e)
    } finally {
      setIsLoadingHistory(false)
    }
  }

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    if (!fridayDate) {
      toast.error("Ordering date unavailable. Please try again shortly.")
      setIsLoading(false)
      return
    }

    if (!selectedItem || !selectedVariant) {
      toast.error("Pick an item and variant first!")
      setIsLoading(false)
      return
    }

    if (notes.length > 100) {
      toast.error("Notes must be 100 characters or less")
      setIsLoading(false)
      return
    }

    try {
      const orderData = {
        user_id: user.id,
        friday_date: fridayDate,
        item: selectedItem,
        variant: selectedVariant,
        notes: notes.trim() || null,
      }
      if (currentOrder) {
        const { error } = await supabase.from("orders").update(orderData).eq("id", currentOrder.id)
        if (error) throw error
        await supabase.from("events").insert({ type: "order_updated", user_id: user.id, payload: { order_id: currentOrder.id, ...orderData } })
        toast.success("Order updated! Tony will take good care of you 🍽️")
      } else {
        const { error } = await supabase.from("orders").insert(orderData)
        if (error) throw error
        await supabase.from("events").insert({ type: "order_created", user_id: user.id, payload: orderData })
        toast.success("You're in! Tony knows what you want 🎉")
        triggerConfetti()
      }

      if (phone !== user.phone) await supabase.from("users").update({ phone }).eq("id", user.id)
      await fetchData(fridayDate)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong. Try again!")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteOrder = async () => {
    if (!currentOrder) {
      toast.error("No order found to delete.")
      return
    }
    if (!fridayDate) {
      toast.error("Ordering date unavailable. Please try again shortly.")
      return
    }

    setIsDeleting(true)

    try {
      const { error: deleteError } = await supabase
        .from("orders")
        .delete()
        .eq("id", currentOrder.id)
        .eq("user_id", user.id)

      if (deleteError) throw deleteError

      await supabase.from("events").insert({
        type: "order_deleted",
        user_id: user.id,
        payload: { order_id: currentOrder.id, friday_date: fridayDate },
      })

      setCurrentOrder(null)
      setSelectedItem("")
      setSelectedVariant("")
      setNotes("")
      toast.success("Order cancelled. Changed your mind? You can re-order anytime before noon.")
      await fetchData(fridayDate)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to cancel order")
    } finally {
      setIsDeleting(false)
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
  const teamTotal = teamRoster.length || teammateCount || 10
  const progressPct = Math.round((teammateCount / teamTotal) * 100)

  const targetWeekday =
    typeof timeframe.dayOfWeek === "number" && timeframe.dayOfWeek >= 0 && timeframe.dayOfWeek <= 6
      ? timeframe.dayOfWeek
      : 5
  const weekdayLabel = WEEKDAY_LABELS[targetWeekday]

  const windowStatusLabel = isOrdersLocked
    ? "🔒 Locked by Admin"
    : isWindowOpen
      ? `🟢 Open until ${timeframe.endTime}`
      : `⏰ Next window in ${formatTimeUntil()}`

  const timeframeLabel =
    timeframe.startTime && timeframe.endTime
      ? `${weekdayLabel} ${timeframe.startTime} – ${timeframe.endTime}`
      : "Schedule coming soon"

  const windowBadgeClass = [
    "mt-3 w-fit rounded-full px-3 py-1 text-xs font-medium shadow-sm",
    isOrdersLocked
      ? "border-destructive/40 bg-destructive/15 text-destructive"
      : canOrder
        ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-600 dark:text-emerald-400"
        : "border-border/60 bg-white/50 text-muted-foreground dark:bg-white/10",
  ].join(" ")

  const orderedUserIds = useMemo(() => new Set(orders.map(o => o.user_id)), [orders])
  const myOrderEmoji = currentOrder ? getFoodEmoji(currentOrder.item) : null

  return (
    <>
      <ConfettiBurst active={showConfetti} />

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
                  <div className={cn(
                    "relative h-14 w-14 overflow-hidden rounded-2xl bg-white/80 ring-4 shadow-[0_12px_32px_-20px_rgba(58,76,130,0.55)] sm:h-16 sm:w-16 dark:bg-white/10",
                    canOrder ? "ring-emerald-400/60 pulse-glow" : "ring-primary/40 dark:ring-white/10"
                  )}>
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
                      <h1 className="text-3xl font-semibold sm:text-4xl">
                        Friday Tony's Orders
                        {canOrder && <span className="ml-2 text-2xl">🍕</span>}
                      </h1>
                      <p className="text-muted-foreground flex items-center gap-2">
                        Welcome back, {user.name}
                        {myOrderEmoji && (
                          <span className="bounce-in inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                            {myOrderEmoji} Ordered
                          </span>
                        )}
                        {user.role === "admin" && (
                          <Badge variant="outline" className="rounded-full border-primary/30 bg-primary/15 px-3 py-1 text-xs font-medium text-primary">
                            Admin
                          </Badge>
                        )}
                      </p>
                    </div>
                    <p className="text-xs uppercase tracking-[0.2em] text-primary/70">
                      {canOrder ? "🔓 Kitchen is open — get your order in!" : "Team lunches, but make it delightful"}
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
                {/* Window Status */}
                <div className={cn(
                  "rounded-[1.5rem] border p-5 shadow-[0_24px_60px_-40px_rgba(58,76,130,0.55)] backdrop-blur-xl transition",
                  canOrder
                    ? "border-emerald-400/30 bg-emerald-50/70 dark:border-emerald-400/20 dark:bg-emerald-900/20"
                    : "border-white/60 bg-white/70 dark:border-white/10 dark:bg-white/10"
                )}>
                  <div className="flex items-center gap-3 text-sm font-semibold text-foreground">
                    <Clock className={cn("h-5 w-5", canOrder ? "text-emerald-600 dark:text-emerald-400" : "text-primary")} />
                    {isOrdersLocked ? "Ordering paused" : isWindowOpen ? "Let's eat! 🍔" : "Kitchen's closed"}
                  </div>
                  <Badge variant="outline" className={windowBadgeClass}>
                    {windowStatusLabel}
                  </Badge>
                  <p className="mt-3 text-xs text-muted-foreground">{timeframeLabel}</p>
                </div>

                {/* Team Lineup with progress */}
                <div className="rounded-[1.5rem] border border-white/60 bg-white/70 p-5 shadow-[0_24px_60px_-40px_rgba(58,76,130,0.55)] backdrop-blur-xl dark:border-white/10 dark:bg-white/10">
                  <div className="flex items-center gap-3 text-sm font-semibold text-foreground">
                    <Users className="h-5 w-5 text-primary" />
                    Team lineup
                    {teammateCount > 0 && teammateCount >= teamTotal && (
                      <Flame className="h-4 w-4 text-orange-500" />
                    )}
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-3xl font-semibold leading-none">{teammateCount}</span>
                    <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                      {teamTotal > teammateCount ? `/ ${teamTotal} in` : "in — all of us! 🔥"}
                    </span>
                  </div>
                  {teamTotal > 1 && (
                    <div className="mt-3">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/50 dark:bg-white/10">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-700"
                          style={{ width: `${Math.min(progressPct, 100)}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {progressPct >= 100 ? "Everyone's in 🎉" : `${progressPct}% of the crew`}
                      </p>
                    </div>
                  )}
                </div>

                {/* Meals */}
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
                    {totalMeals === 0 ? "👨‍🍳 Tony's waiting..." : "Including every tweak and special request."}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          <div className="grid gap-8 lg:grid-cols-2">
            {/* Order Form */}
            <Card className={cn(
              "transition-all duration-300",
              canOrder && !currentOrder && "ring-2 ring-primary/20 shadow-[0_0_40px_-10px_rgba(20,146,230,0.3)]"
            )}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {currentOrder ? (
                    <>
                      Update Your Order
                      <Badge className="ml-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                        {getFoodEmoji(currentOrder.item)} Ordered
                      </Badge>
                    </>
                  ) : (
                    <>
                      {canOrder ? "🍽️ Place Your Order" : "Your Order"}
                    </>
                  )}
                </CardTitle>
                {canOrder && !currentOrder && (
                  <p className="text-sm text-muted-foreground">
                    Window closes at <strong>{timeframe.endTime}</strong> — don't be the one who misses out 👀
                  </p>
                )}
              </CardHeader>
              <CardContent>
                {isInitialLoading ? (
                  <div className="space-y-4">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
                    ))}
                  </div>
                ) : (
                  <form onSubmit={handleSubmitOrder} className="space-y-4">
                    <div className="grid gap-2">
                      <Label htmlFor="name">Name</Label>
                      <Input id="name" value={user.name} disabled />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="item">Item *</Label>
                      <Select
                        value={selectedItem}
                        onValueChange={(value) => { setSelectedItem(value); setSelectedVariant("") }}
                        disabled={!canOrder || isLoading || isDeleting}
                      >
                        <SelectTrigger className="border border-border/60 bg-white/70 text-foreground shadow-[0_12px_32px_-26px_rgba(58,76,130,0.45)] backdrop-blur-xl">
                          <SelectValue placeholder="What are you feeling? 🤔" />
                        </SelectTrigger>
                        <SelectContent className="border border-border/60 bg-white/80 text-foreground backdrop-blur-xl dark:bg-white/10">
                          {Array.from(new Set(menuItems.map((item) => item.item))).map((item) => (
                            <SelectItem className="focus:bg-accent focus:text-accent-foreground" key={item} value={item}>
                              {getFoodEmoji(item)} {item}
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
                        disabled={!canOrder || !selectedItem || isLoading || isDeleting}
                      >
                        <SelectTrigger className="border border-border/60 bg-white/70 text-foreground shadow-[0_12px_32px_-26px_rgba(58,76,130,0.45)] backdrop-blur-xl">
                          <SelectValue placeholder="Pick your style" />
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
                        placeholder="Extra sauce? No onions? Tony's got you 🙏"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        maxLength={100}
                        disabled={!canOrder || isLoading || isDeleting}
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
                        disabled={!canOrder || isLoading || isDeleting}
                      />
                    </div>

                    <Button
                      type="submit"
                      className={cn(
                        "w-full rounded-full transition-all",
                        canOrder && !currentOrder && "bg-primary shadow-[0_8px_24px_-8px_rgba(20,146,230,0.6)] hover:scale-[1.02]"
                      )}
                      disabled={!canOrder || isLoading || isDeleting}
                    >
                      {isLoading ? "Saving..." : currentOrder ? "Update Order" : "Place Order 🚀"}
                    </Button>

                    {currentOrder && (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full rounded-full text-destructive hover:text-destructive"
                        onClick={handleDeleteOrder}
                        disabled={!canOrder || isDeleting || isLoading}
                      >
                        {isDeleting ? "Cancelling..." : (
                          <>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Cancel Order
                          </>
                        )}
                      </Button>
                    )}

                    {!canOrder && !isOrdersLocked && (
                      <div className="rounded-[1rem] border border-border/40 bg-muted/30 p-4 text-center text-sm text-muted-foreground">
                        😴 Ordering opens {weekdayLabel} at {timeframe.startTime || "09:00"}<br />
                        Come back in <strong>{formatTimeUntil()}</strong>
                      </div>
                    )}

                    {isOrdersLocked && (
                      <div className="rounded-[1rem] border border-destructive/20 bg-destructive/5 p-4 text-center text-sm text-destructive">
                        🔒 Orders are locked. Tony's been notified!
                      </div>
                    )}
                  </form>
                )}
              </CardContent>
            </Card>

            <div className="flex flex-col gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Team Orders</span>
                    {orders.length > 0 && (
                      <Badge variant="secondary" className="rounded-full">
                        {orders.length} placed
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="font-medium">Most Ordered This Week</h4>
                      {topItemData.length > 0 && <Badge variant="outline">Top {topItemData.length}</Badge>}
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
                        <div key={`${summary.item}-${summary.variant}`} className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2">
                            <span>{getFoodEmoji(summary.item)}</span>
                            {summary.item} — {summary.variant}
                          </span>
                          <Badge variant="secondary">×{summary.count}</Badge>
                        </div>
                      ))}
                      {orderSummary.length === 0 && (
                        <p className="text-sm text-muted-foreground">No orders yet — be the first! 🙋</p>
                      )}
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h4 className="mb-2 font-medium">Who's eating</h4>
                    <div className="max-h-64 space-y-2 overflow-y-auto rounded-[1.5rem] border border-white/50 bg-white/70 p-3 backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
                      {orders.map((order) => (
                        <div key={order.id} className="flex items-start justify-between text-sm py-1">
                          <div className="flex items-start gap-2">
                            <span className="mt-0.5 text-base">{getFoodEmoji(order.item)}</span>
                            <div>
                              <p className="font-medium">{order.user?.name}</p>
                              <p className="text-muted-foreground">{order.item} — {order.variant}</p>
                              {order.notes && <p className="text-xs text-muted-foreground italic">"{order.notes}"</p>}
                            </div>
                          </div>
                          {order.user_id === user.id && (
                            <Badge variant="outline" className="shrink-0">You</Badge>
                          )}
                        </div>
                      ))}
                      {orders.length === 0 && (
                        <p className="text-sm text-muted-foreground py-4 text-center">
                          👀 Waiting for someone to go first...
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Order History */}
          <Card className="border border-white/60 bg-white/70 backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
            <CardHeader
              className="cursor-pointer select-none"
              onClick={() => {
                const next = !showHistory
                setShowHistory(next)
                if (next && pastOrders.length === 0) {
                  void fetchPastOrders()
                }
              }}
            >
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <PartyPopper className="h-4 w-4 text-primary" />
                  Your Order History
                </span>
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", showHistory && "rotate-180")} />
              </CardTitle>
            </CardHeader>
            {showHistory && (
              <CardContent>
                {isLoadingHistory ? (
                  <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pastOrders.map(({ date, order }) => {
                      const label = new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                      })
                      return (
                        <div key={date} className="flex items-center justify-between rounded-xl border border-border/40 bg-white/60 p-3 dark:bg-white/5">
                          <div>
                            <p className="text-sm font-medium">{label}</p>
                            {order ? (
                              <p className="text-sm text-muted-foreground">
                                {getFoodEmoji(order.item)} {order.item} — {order.variant}
                                {order.notes ? <span className="italic"> · "{order.notes}"</span> : null}
                              </p>
                            ) : (
                              <p className="text-sm text-muted-foreground italic">No order that week 😴</p>
                            )}
                          </div>
                          {order && (
                            <Badge variant="secondary" className="shrink-0">Ordered</Badge>
                          )}
                        </div>
                      )
                    })}
                    {pastOrders.length === 0 && (
                      <p className="text-sm text-muted-foreground">No past orders found.</p>
                    )}
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          {user.role !== "admin" && <AdminOrderInsights orders={orders} users={rosterForInsights} />}

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
  )
}
