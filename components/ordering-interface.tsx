// OrderingInterface.tsx
"use client"

import { useEffect, useState, useMemo, useRef, useCallback } from "react"
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
import { motion, AnimatePresence } from "framer-motion"
import confetti from "canvas-confetti"

import {
  getCurrentFriday,
  isOrderingWindowOpen,
  getTimeUntilNextWindow,
  formatFridayDate,
  getOrderingTimeframe,
} from "@/lib/utils/time"
import type { User, MenuItem, Order, OrderSummary } from "@/lib/types"
import { Clock, Users, ShoppingBag, LogOut, Trash2, ChevronDown, PartyPopper, Flame, Sparkles, UtensilsCrossed, MessageCircle } from "lucide-react"

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

// ── Animated Number Counter ─────────────────────────────────────────────────

function AnimatedCounter({ value, duration = 0.8 }: { value: number; duration?: number }) {
  const [displayValue, setDisplayValue] = useState(0)
  const prevValue = useRef(0)

  useEffect(() => {
    const start = prevValue.current
    const end = value
    const startTime = performance.now()
    const dur = duration * 1000

    const animate = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / dur, 1)
      // ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayValue(Math.round(start + (end - start) * eased))
      if (progress < 1) requestAnimationFrame(animate)
    }

    requestAnimationFrame(animate)
    prevValue.current = value
  }, [value, duration])

  return <>{displayValue}</>
}

// ── Floating Food Emoji Background ──────────────────────────────────────────

function FloatingEmojis() {
  const emojis = ["🍔", "🍕", "🍝", "🥗", "🌯", "🍗", "🥩", "🍲", "🍰", "☕"]
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {emojis.map((emoji, i) => (
        <motion.div
          key={i}
          className="absolute text-2xl opacity-[0.07] select-none"
          initial={{
            x: `${10 + (i * 9) % 80}vw`,
            y: `${5 + (i * 13) % 85}vh`,
            rotate: 0,
          }}
          animate={{
            y: [`${5 + (i * 13) % 85}vh`, `${(5 + (i * 13) % 85) - 3}vh`, `${5 + (i * 13) % 85}vh`],
            rotate: [0, i % 2 === 0 ? 15 : -15, 0],
          }}
          transition={{
            duration: 4 + i * 0.5,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.3,
          }}
        >
          {emoji}
        </motion.div>
      ))}
    </div>
  )
}

// ── Avatar Component ────────────────────────────────────────────────────────

function UserAvatar({ name, index, size = "sm" }: { name: string; index: number; size?: "sm" | "md" }) {
  const initials = (name || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  const colors = [
    "from-blue-400 to-blue-600",
    "from-emerald-400 to-emerald-600",
    "from-violet-400 to-violet-600",
    "from-amber-400 to-amber-600",
    "from-rose-400 to-rose-600",
    "from-cyan-400 to-cyan-600",
    "from-fuchsia-400 to-fuchsia-600",
    "from-lime-400 to-lime-600",
    "from-orange-400 to-orange-600",
    "from-teal-400 to-teal-600",
  ]

  const sizeClass = size === "md" ? "h-9 w-9 text-xs" : "h-7 w-7 text-[10px]"

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 25, delay: index * 0.05 }}
      className={cn(
        "flex items-center justify-center rounded-full bg-gradient-to-br font-bold text-white shadow-lg ring-2 ring-white dark:ring-gray-800",
        colors[index % colors.length],
        sizeClass,
      )}
      title={name}
    >
      {initials}
    </motion.div>
  )
}

// ── Stagger container variants ──────────────────────────────────────────────

const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
}

const staggerItem = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 300, damping: 24 },
  },
}

const cardHover = {
  rest: { scale: 1, y: 0 },
  hover: { scale: 1.02, y: -4, transition: { type: "spring", stiffness: 400, damping: 17 } },
}

// ── Fire confetti ───────────────────────────────────────────────────────────

function fireConfetti() {
  const defaults = { startVelocity: 30, spread: 360, ticks: 80, zIndex: 100 }
  const colors = ["#1492E6", "#84BB2A", "#FFD700", "#FF6B6B", "#A855F7", "#F97316", "#06B6D4"]

  confetti({ ...defaults, particleCount: 50, origin: { x: 0.3, y: 0.6 }, colors })
  confetti({ ...defaults, particleCount: 50, origin: { x: 0.7, y: 0.6 }, colors })

  setTimeout(() => {
    confetti({ ...defaults, particleCount: 30, origin: { x: 0.5, y: 0.4 }, colors, startVelocity: 45 })
  }, 200)

  setTimeout(() => {
    confetti({
      particleCount: 100,
      spread: 100,
      origin: { x: 0.5, y: 0.5 },
      colors,
      shapes: ["circle", "square"],
      gravity: 0.8,
      scalar: 1.2,
      ticks: 120,
      zIndex: 100,
    })
  }, 500)
}

// ── Main Component ──────────────────────────────────────────────────────────

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
  const [pastOrders, setPastOrders] = useState<Array<{ date: string; order: Order | null }>>([])
  const [showHistory, setShowHistory] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [isInitialLoading, setIsInitialLoading] = useState(true)

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
        toast.success("Order updated! Tony will take good care of you")
      } else {
        const { error } = await supabase.from("orders").insert(orderData)
        if (error) throw error
        await supabase.from("events").insert({ type: "order_created", user_id: user.id, payload: orderData })
        toast.success("You're in! Tony knows what you want")
        fireConfetti()
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
    ? "Locked by Admin"
    : isWindowOpen
      ? `Open until ${timeframe.endTime}`
      : `Next window in ${formatTimeUntil()}`

  const timeframeLabel =
    timeframe.startTime && timeframe.endTime
      ? `${weekdayLabel} ${timeframe.startTime} – ${timeframe.endTime}`
      : "Schedule coming soon"

  const orderedUserIds = useMemo(() => new Set(orders.map(o => o.user_id)), [orders])
  const myOrderEmoji = currentOrder ? getFoodEmoji(currentOrder.item) : null

  return (
    <>
      <FloatingEmojis />

      <div className="relative min-h-screen overflow-hidden px-4 pb-36 pt-6 sm:px-8 lg:px-12">
        {/* Background blobs */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <motion.div
            className="absolute -top-40 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl"
            animate={{ scale: [1, 1.1, 1], opacity: [0.2, 0.3, 0.2] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute bottom-[-6rem] right-[-4rem] h-96 w-96 rounded-full bg-[#ffd6f0]/40 blur-3xl"
            animate={{ scale: [1, 1.15, 1], x: [0, 20, 0] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute top-1/3 left-[-6rem] h-72 w-72 rounded-full bg-[#9fffe0]/35 blur-3xl"
            animate={{ scale: [1, 1.2, 1], y: [0, -20, 0] }}
            transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>

        <motion.div
          className="relative mx-auto w-full max-w-6xl space-y-10"
          variants={staggerContainer}
          initial="hidden"
          animate="show"
        >

          {/* ── Hero Card ────────────────────────────────────────────── */}
          <motion.div variants={staggerItem}>
            <Card className="overflow-hidden border border-white/60 bg-white/70 p-0 shadow-[0_35px_90px_-45px_rgba(58,76,130,0.45)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/5">
              <div className="flex flex-col gap-8 p-6 sm:p-10">
                <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-4 sm:items-center">
                    <motion.div
                      className={cn(
                        "relative h-14 w-14 overflow-hidden rounded-2xl bg-white/80 ring-4 shadow-[0_12px_32px_-20px_rgba(58,76,130,0.55)] sm:h-16 sm:w-16 dark:bg-white/10",
                        canOrder ? "ring-emerald-400/60" : "ring-primary/40 dark:ring-white/10"
                      )}
                      animate={canOrder ? {
                        boxShadow: ["0 0 0 0 rgba(52, 211, 153, 0.4)", "0 0 0 12px rgba(52, 211, 153, 0)", "0 0 0 0 rgba(52, 211, 153, 0.4)"],
                      } : {}}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <Image
                        src="/brand/logo-mark.png"
                        alt="Facilization Friday mark"
                        fill
                        sizes="(max-width: 640px) 56px, 64px"
                        priority
                        className="object-contain"
                      />
                    </motion.div>
                    <div className="space-y-2">
                      <div className="flex flex-col gap-1">
                        <motion.h1
                          className="text-3xl font-semibold sm:text-4xl"
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.2 }}
                        >
                          Friday Tony's Orders
                          {canOrder && (
                            <motion.span
                              className="ml-2 inline-block text-2xl"
                              animate={{ rotate: [0, 14, -14, 0] }}
                              transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 3 }}
                            >
                              🍕
                            </motion.span>
                          )}
                        </motion.h1>
                        <p className="text-muted-foreground flex items-center gap-2">
                          Welcome back, {user.name}
                          <AnimatePresence>
                            {myOrderEmoji && (
                              <motion.span
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0, opacity: 0 }}
                                transition={{ type: "spring", stiffness: 500, damping: 25 }}
                                className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                              >
                                {myOrderEmoji} Ordered
                              </motion.span>
                            )}
                          </AnimatePresence>
                          {user.role === "admin" && (
                            <Badge variant="outline" className="rounded-full border-primary/30 bg-primary/15 px-3 py-1 text-xs font-medium text-primary">
                              Admin
                            </Badge>
                          )}
                        </p>
                      </div>
                      <motion.p
                        className="text-xs uppercase tracking-[0.2em] text-primary/70"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.4 }}
                      >
                        {canOrder ? "Kitchen is open — get your order in!" : "Team lunches, but make it delightful"}
                      </motion.p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 sm:self-end">
                    <ThemeToggle />
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Button
                        variant="outline"
                        className="rounded-full border-transparent bg-white/70 px-4 py-2 text-sm font-medium text-foreground shadow-[0_8px_24px_-18px_rgba(58,76,130,0.6)] transition hover:bg-white/80 dark:bg-white/10 dark:text-foreground"
                        onClick={signOut}
                      >
                        <LogOut className="mr-2 h-4 w-4" />
                        Sign Out
                      </Button>
                    </motion.div>
                  </div>
                </div>

                {/* ── Stats Grid ──────────────────────────────────────── */}
                <div className="grid gap-4 sm:grid-cols-3">
                  {/* Window Status */}
                  <motion.div
                    variants={cardHover}
                    initial="rest"
                    whileHover="hover"
                    className={cn(
                      "rounded-[1.5rem] border p-5 shadow-[0_24px_60px_-40px_rgba(58,76,130,0.55)] backdrop-blur-xl transition-colors cursor-default",
                      canOrder
                        ? "border-emerald-400/30 bg-emerald-50/70 dark:border-emerald-400/20 dark:bg-emerald-900/20"
                        : "border-white/60 bg-white/70 dark:border-white/10 dark:bg-white/10"
                    )}
                  >
                    <div className="flex items-center gap-3 text-sm font-semibold text-foreground">
                      <motion.div
                        animate={canOrder ? { rotate: [0, 360] } : {}}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      >
                        <Clock className={cn("h-5 w-5", canOrder ? "text-emerald-600 dark:text-emerald-400" : "text-primary")} />
                      </motion.div>
                      {isOrdersLocked ? "Ordering paused" : isWindowOpen ? "Let's eat!" : "Kitchen's closed"}
                    </div>
                    <Badge variant="outline" className={cn(
                      "mt-3 w-fit rounded-full px-3 py-1 text-xs font-medium shadow-sm",
                      isOrdersLocked
                        ? "border-destructive/40 bg-destructive/15 text-destructive"
                        : canOrder
                          ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-600 dark:text-emerald-400"
                          : "border-border/60 bg-white/50 text-muted-foreground dark:bg-white/10",
                    )}>
                      {windowStatusLabel}
                    </Badge>
                    <p className="mt-3 text-xs text-muted-foreground">{timeframeLabel}</p>
                  </motion.div>

                  {/* Team Lineup */}
                  <motion.div
                    variants={cardHover}
                    initial="rest"
                    whileHover="hover"
                    className="rounded-[1.5rem] border border-white/60 bg-white/70 p-5 shadow-[0_24px_60px_-40px_rgba(58,76,130,0.55)] backdrop-blur-xl cursor-default dark:border-white/10 dark:bg-white/10"
                  >
                    <div className="flex items-center gap-3 text-sm font-semibold text-foreground">
                      <Users className="h-5 w-5 text-primary" />
                      Team lineup
                      <AnimatePresence>
                        {teammateCount > 0 && teammateCount >= teamTotal && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: [1, 1.3, 1] }}
                            transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 1 }}
                          >
                            <Flame className="h-4 w-4 text-orange-500" />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    <div className="mt-3 flex items-baseline gap-2">
                      <span className="text-3xl font-semibold leading-none tabular-nums">
                        <AnimatedCounter value={teammateCount} />
                      </span>
                      <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                        {teamTotal > teammateCount ? `/ ${teamTotal} in` : "in — all of us!"}
                      </span>
                    </div>
                    {teamTotal > 1 && (
                      <div className="mt-3">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-white/50 dark:bg-white/10">
                          <motion.div
                            className="h-full rounded-full bg-gradient-to-r from-blue-500 via-emerald-500 to-lime-500"
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(progressPct, 100)}%` }}
                            transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {progressPct >= 100 ? "Everyone's in!" : `${progressPct}% of the crew`}
                        </p>
                      </div>
                    )}

                    {/* Mini avatar stack */}
                    {orders.length > 0 && (
                      <div className="mt-3 flex -space-x-2">
                        {orders.slice(0, 6).map((order, i) => (
                          <UserAvatar key={order.id} name={order.user?.name || "?"} index={i} />
                        ))}
                        {orders.length > 6 && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-[10px] font-bold text-gray-600 ring-2 ring-white dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-800"
                          >
                            +{orders.length - 6}
                          </motion.div>
                        )}
                      </div>
                    )}
                  </motion.div>

                  {/* Meals */}
                  <motion.div
                    variants={cardHover}
                    initial="rest"
                    whileHover="hover"
                    className="rounded-[1.5rem] border border-white/60 bg-white/70 p-5 shadow-[0_24px_60px_-40px_rgba(58,76,130,0.55)] backdrop-blur-xl cursor-default dark:border-white/10 dark:bg-white/10"
                  >
                    <div className="flex items-center gap-3 text-sm font-semibold text-foreground">
                      <ShoppingBag className="h-5 w-5 text-primary" />
                      Meals planned
                    </div>
                    <div className="mt-3 flex items-baseline gap-2">
                      <span className="text-3xl font-semibold leading-none tabular-nums">
                        <AnimatedCounter value={totalMeals} />
                      </span>
                      <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">plates</span>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {totalMeals === 0 ? "Tony's waiting..." : "Including every tweak and special request."}
                    </p>
                  </motion.div>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* ── Main Content Grid ─────────────────────────────────── */}
          <div className="grid gap-8 lg:grid-cols-2">

            {/* ── Order Form ─────────────────────────────────────── */}
            <motion.div variants={staggerItem}>
              <motion.div
                whileHover={{ y: -2 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <Card className={cn(
                  "transition-all duration-300",
                  canOrder && !currentOrder && "ring-2 ring-primary/20 shadow-[0_0_40px_-10px_rgba(20,146,230,0.3)]"
                )}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      {currentOrder ? (
                        <>
                          <UtensilsCrossed className="h-5 w-5" />
                          Update Your Order
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", stiffness: 500, damping: 25 }}
                          >
                            <Badge className="ml-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                              {getFoodEmoji(currentOrder.item)} Ordered
                            </Badge>
                          </motion.div>
                        </>
                      ) : (
                        <>
                          <Sparkles className={cn("h-5 w-5", canOrder && "text-primary")} />
                          {canOrder ? "Place Your Order" : "Your Order"}
                        </>
                      )}
                    </CardTitle>
                    {canOrder && !currentOrder && (
                      <motion.p
                        className="text-sm text-muted-foreground"
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                      >
                        Window closes at <strong>{timeframe.endTime}</strong> — don't miss out
                      </motion.p>
                    )}
                  </CardHeader>
                  <CardContent>
                    {isInitialLoading ? (
                      <div className="space-y-4">
                        {[...Array(4)].map((_, i) => (
                          <motion.div
                            key={i}
                            className="h-10 rounded-md bg-muted"
                            animate={{ opacity: [0.4, 0.7, 0.4] }}
                            transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.15 }}
                          />
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
                              <SelectValue placeholder="What are you feeling?" />
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

                        <AnimatePresence mode="wait">
                          {selectedItem && (
                            <motion.div
                              key={selectedItem}
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ type: "spring", stiffness: 300, damping: 25 }}
                              className="grid gap-2 overflow-hidden"
                            >
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
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <div className="grid gap-2">
                          <Label htmlFor="notes">Notes (optional)</Label>
                          <Textarea
                            id="notes"
                            placeholder="Extra sauce? No onions? Tony's got you"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            maxLength={100}
                            disabled={!canOrder || isLoading || isDeleting}
                          />
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">{notes.length}/100 characters</p>
                            {notes.length > 80 && (
                              <motion.p
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="text-xs text-amber-500"
                              >
                                Almost full!
                              </motion.p>
                            )}
                          </div>
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

                        <motion.div whileHover={canOrder ? { scale: 1.02 } : {}} whileTap={canOrder ? { scale: 0.98 } : {}}>
                          <Button
                            type="submit"
                            className={cn(
                              "w-full rounded-full transition-all",
                              canOrder && !currentOrder && "bg-gradient-to-r from-blue-500 to-emerald-500 shadow-[0_8px_24px_-8px_rgba(20,146,230,0.6)] hover:shadow-[0_12px_32px_-8px_rgba(20,146,230,0.7)]"
                            )}
                            disabled={!canOrder || isLoading || isDeleting}
                          >
                            {isLoading ? (
                              <motion.span
                                animate={{ opacity: [1, 0.5, 1] }}
                                transition={{ duration: 1, repeat: Infinity }}
                              >
                                Saving...
                              </motion.span>
                            ) : currentOrder ? "Update Order" : (
                              <span className="flex items-center gap-2">
                                Place Order
                                <Sparkles className="h-4 w-4" />
                              </span>
                            )}
                          </Button>
                        </motion.div>

                        <AnimatePresence>
                          {currentOrder && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                            >
                              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
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
                              </motion.div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {!canOrder && !isOrdersLocked && (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="rounded-[1rem] border border-border/40 bg-muted/30 p-4 text-center text-sm text-muted-foreground"
                          >
                            Ordering opens {weekdayLabel} at {timeframe.startTime || "09:00"}<br />
                            Come back in <strong>{formatTimeUntil()}</strong>
                          </motion.div>
                        )}

                        {isOrdersLocked && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="rounded-[1rem] border border-destructive/20 bg-destructive/5 p-4 text-center text-sm text-destructive"
                          >
                            Orders are locked. Tony's been notified!
                          </motion.div>
                        )}
                      </form>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>

            {/* ── Team Orders ────────────────────────────────────── */}
            <motion.div variants={staggerItem} className="flex flex-col gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Team Orders
                    </span>
                    <AnimatePresence mode="wait">
                      {orders.length > 0 && (
                        <motion.div
                          key={orders.length}
                          initial={{ scale: 0.5, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.5, opacity: 0 }}
                          transition={{ type: "spring", stiffness: 500, damping: 25 }}
                        >
                          <Badge variant="secondary" className="rounded-full">
                            {orders.length} placed
                          </Badge>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="font-medium">Most Ordered This Week</h4>
                      {topItemData.length > 0 && <Badge variant="outline">Top {topItemData.length}</Badge>}
                    </div>
                    {topItemData.length > 0 ? (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="h-56 w-full rounded-[1.5rem] border border-white/50 bg-white/70 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)] backdrop-blur-xl dark:border-white/10 dark:bg-white/10"
                      >
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
                            <Bar dataKey="value" radius={[8, 8, 0, 0]} animationDuration={1200} animationEasing="ease-out">
                              {topItemData.map((_, index) => (
                                <Cell
                                  key={`top-item-${index}`}
                                  fill={FACILIZATION_COLORS[index % FACILIZATION_COLORS.length]}
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </motion.div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Order trends will appear once teammates start ordering.
                      </p>
                    )}
                  </div>

                  <Separator />

                  <div>
                    <h4 className="mb-2 font-medium">Order Summary</h4>
                    <motion.div className="space-y-2" variants={staggerContainer} initial="hidden" animate="show">
                      {orderSummary.map((summary, i) => (
                        <motion.div
                          key={`${summary.item}-${summary.variant}`}
                          variants={staggerItem}
                          className="flex items-center justify-between text-sm rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors"
                        >
                          <span className="flex items-center gap-2">
                            <motion.span
                              animate={{ rotate: [0, 10, -10, 0] }}
                              transition={{ duration: 0.5, delay: i * 0.1 + 0.5 }}
                            >
                              {getFoodEmoji(summary.item)}
                            </motion.span>
                            {summary.item} — {summary.variant}
                          </span>
                          <Badge variant="secondary">x{summary.count}</Badge>
                        </motion.div>
                      ))}
                      {orderSummary.length === 0 && (
                        <p className="text-sm text-muted-foreground">No orders yet — be the first!</p>
                      )}
                    </motion.div>
                  </div>

                  <Separator />

                  <div>
                    <h4 className="mb-2 font-medium">Who's eating</h4>
                    <div className="max-h-64 space-y-1 overflow-y-auto rounded-[1.5rem] border border-white/50 bg-white/70 p-3 backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
                      <AnimatePresence>
                        {orders.map((order, i) => (
                          <motion.div
                            key={order.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ type: "spring", stiffness: 300, damping: 25, delay: i * 0.03 }}
                            className="flex items-start justify-between text-sm py-1.5 px-2 rounded-lg hover:bg-muted/30 transition-colors"
                          >
                            <div className="flex items-start gap-3">
                              <UserAvatar name={order.user?.name || "?"} index={i} size="md" />
                              <div>
                                <p className="font-medium">{order.user?.name}</p>
                                <p className="text-muted-foreground">{order.item} — {order.variant}</p>
                                {order.notes && <p className="text-xs text-muted-foreground italic">"{order.notes}"</p>}
                              </div>
                            </div>
                            {order.user_id === user.id && (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ type: "spring", stiffness: 500, damping: 25 }}
                              >
                                <Badge variant="outline" className="shrink-0 border-primary/30 bg-primary/10 text-primary">You</Badge>
                              </motion.div>
                            )}
                          </motion.div>
                        ))}
                      </AnimatePresence>
                      {orders.length === 0 && (
                        <motion.p
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="text-sm text-muted-foreground py-4 text-center"
                        >
                          Waiting for someone to go first...
                        </motion.p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* ── Order History ─────────────────────────────────────── */}
          <motion.div variants={staggerItem}>
            <Card className="border border-white/60 bg-white/70 backdrop-blur-xl dark:border-white/10 dark:bg-white/5 overflow-hidden">
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
                  <motion.div
                    animate={{ rotate: showHistory ? 180 : 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  >
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </motion.div>
                </CardTitle>
              </CardHeader>
              <AnimatePresence>
                {showHistory && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  >
                    <CardContent>
                      {isLoadingHistory ? (
                        <div className="space-y-3">
                          {[...Array(3)].map((_, i) => (
                            <motion.div
                              key={i}
                              className="h-14 rounded-xl bg-muted"
                              animate={{ opacity: [0.4, 0.7, 0.4] }}
                              transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
                            />
                          ))}
                        </div>
                      ) : (
                        <motion.div
                          className="space-y-3"
                          variants={staggerContainer}
                          initial="hidden"
                          animate="show"
                        >
                          {pastOrders.map(({ date, order }) => {
                            const label = new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
                              weekday: "long",
                              day: "numeric",
                              month: "long",
                            })
                            return (
                              <motion.div
                                key={date}
                                variants={staggerItem}
                                whileHover={{ scale: 1.01, x: 4 }}
                                className="flex items-center justify-between rounded-xl border border-border/40 bg-white/60 p-3 dark:bg-white/5 transition-colors"
                              >
                                <div>
                                  <p className="text-sm font-medium">{label}</p>
                                  {order ? (
                                    <p className="text-sm text-muted-foreground">
                                      {getFoodEmoji(order.item)} {order.item} — {order.variant}
                                      {order.notes ? <span className="italic"> · "{order.notes}"</span> : null}
                                    </p>
                                  ) : (
                                    <p className="text-sm text-muted-foreground italic">No order that week</p>
                                  )}
                                </div>
                                {order && (
                                  <Badge variant="secondary" className="shrink-0">Ordered</Badge>
                                )}
                              </motion.div>
                            )
                          })}
                          {pastOrders.length === 0 && (
                            <p className="text-sm text-muted-foreground">No past orders found.</p>
                          )}
                        </motion.div>
                      )}
                    </CardContent>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          </motion.div>

          {user.role !== "admin" && (
            <motion.div variants={staggerItem}>
              <AdminOrderInsights orders={orders} users={rosterForInsights} />
            </motion.div>
          )}

          {user.role === "admin" && (
            <motion.div variants={staggerItem}>
              <AdminPanel user={user} />
            </motion.div>
          )}
        </motion.div>
      </div>

      <div className="fixed inset-x-4 bottom-4 z-50 w-auto sm:inset-x-auto sm:right-6 sm:bottom-16 sm:w-[min(460px,92vw)] lg:bottom-10 lg:w-[480px] xl:bottom-8">
        <ChatPanel currentUser={user} />
      </div>
    </>
  )
}
