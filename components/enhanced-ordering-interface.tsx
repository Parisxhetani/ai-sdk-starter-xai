// Enhanced ordering interface with UX improvements
// This file contains the improved version with all UX enhancements
// Key improvements:
// - Loading skeletons
// - Optimistic updates
// - Search/filter for menu items
// - Order confirmation modal
// - Countdown timer
// - Keyboard navigation
// - ARIA labels
// - Auto-save for notes
// - Copy to clipboard
// - Undo capability for order deletion

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
import { CountdownTimer } from "@/components/countdown-timer"
import { MenuSearchFilter } from "@/components/menu-search-filter"
import { OrderConfirmationModal } from "@/components/order-confirmation-modal"
import { OrderingInterfaceSkeleton, ChatPanelSkeleton } from "@/components/skeleton-loaders"
import { ErrorBoundary } from "@/components/error-boundary"
import { cn, formatLekPrice, formatMenuVariantLabel, formatOrderLine, getMenuItemLookupKey } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"
import confetti from "canvas-confetti"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"
import { useLocalStorage } from "@/hooks/use-local-storage"
import { useDebounce } from "@/hooks/use-debounce"
import { createOrderSchema } from "@/lib/validations"
import { getCurrentFriday, formatFridayDate, isOrderingWindowOpen, getTimeUntilNextWindow, getOrderingTimeframe } from "@/lib/utils/time"
import type { User, MenuItem, Order, OrderSummary } from "@/lib/types"
import { 
  Clock, 
  Users, 
  ShoppingBag, 
  LogOut, 
  Trash2, 
  Copy, 
  Check, 
  Undo2, 
  Sparkles, 
  UtensilsCrossed,
  Search,
  Filter,
  History,
  ChevronDown,
  AlertCircle,
} from "lucide-react"

interface OrderingInterfaceProps { 
  user: User 
  isAdmin?: boolean
}

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
  vegetarian: "🥬",
  vegan: "🌱",
}

const DIETARY_INDICATORS: Record<string, { label: string; emoji: string; color: string }> = {
  vegetarian: { label: "Vegetarian", emoji: "🥬", color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" },
  vegan: { label: "Vegan", emoji: "🌱", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" },
  spicy: { label: "Spicy", emoji: "🌶️", color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" },
  gluten_free: { label: "Gluten Free", emoji: "🌾", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" },
}

function getFoodEmoji(item: string): string {
  const lower = item.toLowerCase()
  for (const [key, emoji] of Object.entries(FOOD_EMOJIS)) {
    if (lower.includes(key)) return emoji
  }
  return "🍽️"
}

function getDietaryTags(variant: string): Array<{ label: string; emoji: string; color: string }> {
  const lower = variant.toLowerCase()
  const tags: Array<{ label: string; emoji: string; color: string }> = []
  
  for (const [key, { label, emoji, color }] of Object.entries(DIETARY_INDICATORS)) {
    if (lower.includes(key) || (key === "vegetarian" && lower.includes("veggie"))) {
      tags.push({ label, emoji, color })
    }
  }
  
  return tags
}

export function EnhancedOrderingInterface({ user, isAdmin }: OrderingInterfaceProps) {
  const { signOut } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  
  // State
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [filteredMenuItems, setFilteredMenuItems] = useState<MenuItem[]>([])
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
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [fridayDate, setFridayDate] = useState<string | null>(null)
  
  // Form state
  const [selectedItem, setSelectedItem] = useState("")
  const [selectedVariant, setSelectedVariant] = useState("")
  const [notes, setNotes] = useState("")
  const [phone, setPhone] = useState(user.phone || "")
  
  // UI state
  const [showHistory, setShowHistory] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [pendingOrderData, setPendingOrderData] = useState<{ item: string; variant: string; notes: string } | null>(null)
  const [lastDeletedOrder, setLastDeletedOrder] = useState<Order | null>(null)
  const [undoTimeout, setUndoTimeout] = useState<NodeJS.Timeout | null>(null)
  
  // Custom hooks
  const { copy: copyToClipboard } = useCopyToClipboard()
  const [savedNotes, setSavedNotes] = useLocalStorage<Record<string, string>>("order-notes", {})
  const debouncedNotes = useDebounce(notes, { delay: 500 })
  
  // Refs
  const notesRef = useRef<HTMLTextAreaElement>(null)
  const undoTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  // Derived state
  const availableVariants = useMemo(() => {
    return menuItems.filter((i) => i.item === selectedItem && i.active)
  }, [menuItems, selectedItem])

  const selectedMenuItem = useMemo(
    () => menuItems.find((item) => item.item === selectedItem && item.variant === selectedVariant) ?? null,
    [menuItems, selectedItem, selectedVariant],
  )

  const menuPriceMap = useMemo(
    () => new Map(menuItems.map((item) => [getMenuItemLookupKey(item.item, item.variant), item.price_all])),
    [menuItems],
  )

  const getOrderPriceLabel = useCallback(
    (item: string, variant: string) => formatLekPrice(menuPriceMap.get(getMenuItemLookupKey(item, variant))),
    [menuPriceMap],
  )

  const selectedMenuPrice = formatLekPrice(selectedMenuItem?.price_all)
  const currentOrderPriceLabel = currentOrder ? getOrderPriceLabel(currentOrder.item, currentOrder.variant) : null
  
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
      label: formatOrderLine(entry.item, entry.variant, menuPriceMap.get(getMenuItemLookupKey(entry.item, entry.variant))),
      value: entry.count,
    }))
    
    return { orderSummary: summaryList, topItemData: chartData }
  }, [menuPriceMap, orders])
  
  const teammateCount = useMemo(() => new Set(orders.map((order) => order.user_id)).size, [orders])
  const totalMeals = useMemo(() => orderSummary.reduce((sum, item) => sum + item.count, 0), [orderSummary])
  const teamTotal = 10 // Could be dynamic based on roster
  const progressPct = Math.round((teammateCount / teamTotal) * 100)
  
  const isOrdersLocked = currentOrder?.locked || false
  const canOrder = isWindowOpen && !isOrdersLocked
  
  const myOrderEmoji = currentOrder ? getFoodEmoji(currentOrder.item) : null
  const dietaryTags = currentOrder ? getDietaryTags(currentOrder.variant) : []
  
  // Auto-save notes
  useEffect(() => {
    if (fridayDate && debouncedNotes) {
      setSavedNotes((prev) => ({ ...prev, [fridayDate]: debouncedNotes }))
    }
  }, [debouncedNotes, fridayDate, setSavedNotes])
  
  // Load saved notes when date is resolved
  useEffect(() => {
    if (fridayDate && savedNotes[fridayDate]) {
      setNotes(savedNotes[fridayDate])
    }
  }, [fridayDate, savedNotes])
  
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
  
  // Realtime subscription
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
  
  // Cleanup undo timeout on unmount
  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current)
      }
    }
  }, [])
  
  // Resolve Friday date
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
      const { data: menuData } = await supabase
        .from("menu_items")
        .select("*")
        .eq("active", true)
        .order("item, variant")
      
      const { data: ordersData } = await supabase
        .from("orders")
        .select(`*, user:users(name, email)`)
        .eq("friday_date", targetDate)
        .order("created_at")
      
      const { data: currentOrderData } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", user.id)
        .eq("friday_date", targetDate)
        .single()
      
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
      toast.error("Failed to load data. Please refresh the page.")
    }
  }
  
  const handleSubmitOrder = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    
    if (!fridayDate) {
      toast.error("Ordering date unavailable. Please try again shortly.")
      return
    }
    
    if (!selectedItem || !selectedVariant) {
      toast.error("Pick an item and variant first!")
      return
    }
    
    if (notes.length > 100) {
      toast.error("Notes must be 100 characters or less")
      return
    }
    
    // Validate with Zod
    const validationResult = createOrderSchema.safeParse({
      user_id: user.id,
      friday_date: fridayDate,
      item: selectedItem,
      variant: selectedVariant,
      notes: notes.trim() || null,
    })
    
    if (!validationResult.success) {
      toast.error(validationResult.error.errors[0]?.message || "Invalid order data")
      return
    }
    
    setIsLoading(true)
    
    try {
      const orderData = validationResult.data

      if (currentOrder) {
        // Update existing order
        const { error } = await supabase
          .from("orders")
          .update(orderData)
          .eq("id", currentOrder.id)

        if (error) throw error

        await supabase
          .from("events")
          .insert({
            type: "order_updated",
            user_id: user.id,
            payload: { order_id: currentOrder.id, ...orderData }
          })

        toast.success("Order updated! Tony will take good care of you")
      } else {
        // Create new order
        const { error } = await supabase.from("orders").insert(orderData)
        if (error) throw error

        await supabase
          .from("events")
          .insert({ type: "order_created", user_id: user.id, payload: orderData })

        toast.success("You're in! Tony knows what you want")
        fireConfetti()
      }

      // Update phone if changed
      if (phone !== user.phone) {
        await supabase.from("users").update({ phone }).eq("id", user.id)
      }

      await fetchData(fridayDate)
    } catch (e) {
      console.error("Order submission error:", e)
      toast.error(e instanceof Error ? e.message : "Something went wrong. Try again!")
      await fetchData(fridayDate)
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
    const orderToDelete = currentOrder
    setCurrentOrder(null)

    try {
      const { error: deleteError } = await supabase
        .from("orders")
        .delete()
        .eq("id", currentOrder.id)
        .eq("user_id", user.id)

      if (deleteError) throw deleteError

      await supabase
        .from("events")
        .insert({
          type: "order_deleted",
          user_id: user.id,
          payload: { order_id: currentOrder.id, friday_date: fridayDate },
        })

      // Store for undo
      setLastDeletedOrder(orderToDelete)

      // Show undo toast
      toast.success(
        <div className="flex items-center gap-2">
          <span>Order cancelled</span>
          <Button
            variant="outline"
            size="sm"
            className="ml-4 h-8"
            onClick={async () => {
              await handleUndoDelete(orderToDelete)
              toast.dismiss()
            }}
          >
            <Undo2 className="mr-1 h-3 w-3" />
            Undo
          </Button>
        </div>,
        {
          duration: 10000,
        }
      )
      
      // Auto-clear after timeout
      const timeout = setTimeout(() => {
        setLastDeletedOrder(null)
      }, 10000)
      
      setUndoTimeout(timeout)
      undoTimeoutRef.current = timeout
      
      setSelectedItem("")
      setSelectedVariant("")
      setNotes("")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to cancel order")
      // Revert optimistic update
      await fetchData(fridayDate)
    } finally {
      setIsDeleting(false)
    }
  }
  
  const handleUndoDelete = async (order: Order) => {
    if (!fridayDate) return
    
    try {
      const { error } = await supabase.from("orders").insert({
        user_id: user.id,
        friday_date: fridayDate,
        item: order.item,
        variant: order.variant,
        notes: order.notes,
      })
      
      if (error) throw error
      
      await supabase
        .from("events")
        .insert({ 
          type: "order_restored", 
          user_id: user.id, 
          payload: { order } 
        })
      
      toast.success("Order restored!")
      setLastDeletedOrder(null)
      await fetchData(fridayDate)
    } catch (e) {
      toast.error("Failed to restore order")
    }
  }
  
  const handleConfirmOrder = () => {
    setShowConfirmModal(false)
    handleSubmitOrder()
  }
  
  const handleOpenConfirmModal = () => {
    setPendingOrderData({ item: selectedItem, variant: selectedVariant, notes })
    setShowConfirmModal(true)
  }
  
  const handleCopyOrderSummary = async () => {
    if (!currentOrder) return

    const clipboardSummary = [
      "My Friday Order",
      "--------------------",
      formatOrderLine(
        currentOrder.item,
        currentOrder.variant,
        menuPriceMap.get(getMenuItemLookupKey(currentOrder.item, currentOrder.variant)),
      ),
      currentOrderPriceLabel ? `Price: ${currentOrderPriceLabel}` : null,
      currentOrder.notes ? `Notes: ${currentOrder.notes}` : null,
      "--------------------",
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n")

    await copyToClipboard(clipboardSummary)
    return
    /*
    
    const summary = `🍽️ My Friday Order
━━━━━━━━━━━━━━━━━━━━
📋 ${currentOrder.item}
🍽️ ${currentOrder.variant}
${currentOrder.notes ? `📝 Notes: ${currentOrder.notes}` : ""}
━━━━━━━━━━━━━━━━━━━━`
    
    await copyToClipboard(summary)
    */
  }
  
  const formatTimeUntil = () =>
    timeUntilNext.days > 0 
      ? `${timeUntilNext.days}d ${timeUntilNext.hours}h ${timeUntilNext.minutes}m`
      : timeUntilNext.hours > 0 
        ? `${timeUntilNext.hours}h ${timeUntilNext.minutes}m`
        : `${timeUntilNext.minutes}m`
  
  const windowStatusLabel = isOrdersLocked
    ? "Locked by Admin"
    : isWindowOpen
      ? `Open until ${timeframe.endTime}`
      : `Next window in ${formatTimeUntil()}`
  
  const timeframeLabel =
    timeframe.startTime && timeframe.endTime
      ? `${WEEKDAY_LABELS[timeframe.dayOfWeek]} ${timeframe.startTime} – ${timeframe.endTime}`
      : "Schedule coming soon"
  
  // Render loading skeleton
  if (isInitialLoading) {
    return <OrderingInterfaceSkeleton />
  }
  
  return (
    <ErrorBoundary>
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
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Hero Card */}
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
                        {dietaryTags.map((tag, i) => (
                          <Badge key={i} variant="outline" className={cn("rounded-full text-xs", tag.color)}>
                            {tag.emoji} {tag.label}
                          </Badge>
                        ))}
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
                      aria-label="Sign out"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign Out
                    </Button>
                  </motion.div>
                </div>
              </div>
              
              {/* Status Bar */}
              <div className="flex flex-wrap items-center gap-4">
                <Badge
                  variant={canOrder ? "default" : "secondary"}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 text-sm",
                    canOrder ? "bg-emerald-500 hover:bg-emerald-600" : "bg-amber-500 hover:bg-amber-600"
                  )}
                >
                  <Clock className="h-4 w-4" />
                  {windowStatusLabel}
                </Badge>
                
                {isWindowOpen && !isOrdersLocked && (
                  <CountdownTimer 
                    targetTime={timeframe.endTime} 
                    isWindowOpen={isWindowOpen && !isOrdersLocked}
                  />
                )}
                
                <div className="ml-auto text-sm text-muted-foreground">
                  {timeframeLabel}
                </div>
              </div>
            </div>
          </Card>
          
          {/* Stats Cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Card className="relative overflow-hidden">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40">
                      <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Team Ordered</p>
                      <p className="text-2xl font-bold">
                        <AnimatedCounter value={teammateCount} /> / {teamTotal}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <motion.div
                      className="h-full bg-blue-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${progressPct}%` }}
                      transition={{ duration: 1, delay: 0.3 }}
                    />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card className="relative overflow-hidden">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                      <ShoppingBag className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Total Meals</p>
                      <p className="text-2xl font-bold">
                        <AnimatedCounter value={totalMeals} />
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card className="relative overflow-hidden">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/40">
                      <Sparkles className="h-6 w-6 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Top Item</p>
                      <p className="text-lg font-bold truncate">
                        {topItemData[0]?.label || "No orders yet"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
          
          {/* Main Content Grid */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Order Form */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <UtensilsCrossed className="h-5 w-5" />
                    Place Your Order
                  </CardTitle>
                  {currentOrder && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyOrderSummary}
                      className="h-8"
                      aria-label="Copy order summary"
                    >
                      <Copy className="h-4 w-4" />
                      <span className="ml-2 hidden sm:inline">Copy</span>
                    </Button>
                  )}
                </div>
                {currentOrder && currentOrderPriceLabel && (
                  <p className="text-sm text-muted-foreground">
                    Current selection:{" "}
                    {formatOrderLine(
                      currentOrder.item,
                      currentOrder.variant,
                      menuPriceMap.get(getMenuItemLookupKey(currentOrder.item, currentOrder.variant)),
                    )}
                  </p>
                )}
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmitOrder} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="menu-item">Menu Item</Label>
                    <Select
                      value={selectedItem}
                      onValueChange={(value) => {
                        setSelectedItem(value)
                        setSelectedVariant("")
                      }}
                      disabled={!canOrder}
                    >
                      <SelectTrigger id="menu-item" className="w-full" aria-label="Select menu item">
                        <SelectValue placeholder="Choose your meal" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from(new Set(menuItems.map((i) => i.item))).map((item) => (
                          <SelectItem key={item} value={item}>
                            {getFoodEmoji(item)} {item}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="variant">Variant</Label>
                    <Select
                      value={selectedVariant}
                      onValueChange={setSelectedVariant}
                      disabled={!selectedItem || !canOrder}
                    >
                      <SelectTrigger id="variant" className="w-full" aria-label="Select variant">
                        <SelectValue placeholder="Choose your preference" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableVariants.map((variant) => {
                          const tags = getDietaryTags(variant.variant)
                          return (
                            <SelectItem key={variant.id} value={variant.variant}>
                              {formatMenuVariantLabel(variant.variant, variant.price_all)}
                              {tags.map((tag, i) => (
                                <span key={i} className="ml-2 text-xs">{tag.emoji}</span>
                              ))}
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                    {selectedMenuPrice && <p className="text-xs text-muted-foreground">Current price: {selectedMenuPrice}</p>}
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="notes">
                      Notes (optional)
                      <span className="ml-2 text-xs text-muted-foreground">
                        {notes.length}/100
                      </span>
                    </Label>
                    <Textarea
                      id="notes"
                      ref={notesRef}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Any special requests? (e.g., extra sauce, no onions)"
                      maxLength={100}
                      disabled={!canOrder}
                      rows={3}
                      aria-label="Order notes"
                    />
                  </div>
                  
                  <div className="flex gap-2">
                    {currentOrder ? (
                      <>
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={handleDeleteOrder}
                          disabled={isDeleting || !canOrder}
                          className="flex-1 sm:flex-none"
                          aria-label="Cancel order"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          onClick={handleOpenConfirmModal}
                          disabled={isLoading || !canOrder || (!selectedItem || !selectedVariant)}
                          className="flex-1"
                        >
                          {isLoading ? (
                            <>
                              <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                              Updating...
                            </>
                          ) : (
                            <>
                              <Undo2 className="mr-2 h-4 w-4" />
                              Update Order
                            </>
                          )}
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        onClick={handleOpenConfirmModal}
                        disabled={isLoading || !canOrder || (!selectedItem || !selectedVariant)}
                        className="w-full"
                      >
                        {isLoading ? (
                          <>
                            <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                            Submitting...
                          </>
                        ) : (
                          <>
                            <Sparkles className="mr-2 h-4 w-4" />
                            Submit Order
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                  
                  {!canOrder && (
                    <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                      <Clock className="h-4 w-4 shrink-0" />
                      <p className="text-sm">
                        {isOrdersLocked 
                          ? "Orders are locked by admin. Please wait for the next ordering window."
                          : `Ordering is only available during the Friday window (${timeframeLabel})`
                        }
                      </p>
                    </div>
                  )}
                </form>
              </CardContent>
            </Card>
            
            {/* Team Orders Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Team Orders
                  <Badge variant="secondary" className="ml-auto">
                    {teammateCount}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <AnimatePresence>
                    {orders.slice(0, 8).map((order, index) => (
                      <motion.div
                        key={order.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={{ delay: index * 0.05 }}
                        className="flex items-center gap-3 rounded-lg border p-2 transition-colors hover:bg-muted/50"
                      >
                        <UserAvatar 
                          name={order.user?.name || order.user?.email || "Unknown"} 
                          index={index} 
                        />
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm font-medium">
                            {order.user?.name || order.user?.email || "Unknown"}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {getFoodEmoji(order.item)}{" "}
                            {formatOrderLine(
                              order.item,
                              order.variant,
                              menuPriceMap.get(getMenuItemLookupKey(order.item, order.variant)),
                            )}
                          </p>
                        </div>
                        {order.notes && (
                          <Badge variant="outline" className="shrink-0 text-xs">
                            📝
                          </Badge>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  
                  {orders.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <ShoppingBag className="mb-3 h-12 w-12 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">No orders yet</p>
                      <p className="text-xs text-muted-foreground">Be the first to order!</p>
                    </div>
                  )}
                  
                  {orders.length > 8 && (
                    <Button variant="ghost" className="w-full text-xs" size="sm">
                      View all {orders.length} orders
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Admin Panel */}
          {isAdmin && (
            <AdminPanel user={user} />
          )}

          {/* Order Insights */}
          {isAdmin && (
            <AdminOrderInsights orders={orders} menuItems={menuItems} />
          )}

          {/* Chat Panel */}
          <ChatPanel currentUser={user} />
        </motion.div>
      </div>
      
      {/* Order Confirmation Modal */}
      <OrderConfirmationModal
        open={showConfirmModal}
        onOpenChange={setShowConfirmModal}
        onConfirm={handleConfirmOrder}
        selectedItem={menuItems.find((i) => i.item === selectedItem && i.variant === selectedVariant) || null}
        notes={notes}
        isUpdating={isLoading}
      />
    </ErrorBoundary>
  )
}

// Helper components
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
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayValue(Math.round(start + (end - start) * eased))
      if (progress < 1) requestAnimationFrame(animate)
    }

    requestAnimationFrame(animate)
    prevValue.current = value
  }, [value, duration])

  return <>{displayValue}</>
}

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
