"use client"

import type React from "react"

import { useEffect, useState } from "react"
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
import { getCurrentFriday, isOrderingWindowOpen, getTimeUntilNextWindow, formatFridayDate } from "@/lib/utils/time"
import type { User, MenuItem, Order, OrderSummary } from "@/lib/types"
import { Clock, Users, ShoppingBag, LogOut } from "lucide-react"

interface OrderingInterfaceProps {
  user: User
}

export function OrderingInterface({ user }: OrderingInterfaceProps) {
  const { signOut } = useAuth()
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null)
  const [isWindowOpen, setIsWindowOpen] = useState(false)
  const [timeUntilNext, setTimeUntilNext] = useState({ days: 0, hours: 0, minutes: 0 })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [selectedItem, setSelectedItem] = useState("")
  const [selectedVariant, setSelectedVariant] = useState("")
  const [notes, setNotes] = useState("")
  const [phone, setPhone] = useState(user.phone || "")

  const supabase = createClient()
  const fridayDate = formatFridayDate(getCurrentFriday())

  // Get available variants for selected item
  const availableVariants = menuItems.filter((item) => item.item === selectedItem && item.active)

  // Calculate order summary
  const orderSummary: OrderSummary[] = orders.reduce((acc, order) => {
    const key = `${order.item}-${order.variant}`
    const existing = acc.find((item) => `${item.item}-${item.variant}` === key)
    if (existing) {
      existing.count++
    } else {
      acc.push({ item: order.item, variant: order.variant, count: 1 })
    }
    return acc
  }, [] as OrderSummary[])

  // Get users who haven't ordered
  const orderedUserIds = orders.map((order) => order.user_id)
  const missingUsers = orders.length > 0 ? [] : [] // We'll need to fetch all users to calculate this properly

  useEffect(() => {
    fetchData()

    // Update time every minute
    const interval = setInterval(() => {
      setIsWindowOpen(isOrderingWindowOpen())
      setTimeUntilNext(getTimeUntilNextWindow())
    }, 60000)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    setIsWindowOpen(isOrderingWindowOpen())
    setTimeUntilNext(getTimeUntilNextWindow())
  }, [])

  const fetchData = async () => {
    try {
      // Fetch menu items
      const { data: menuData } = await supabase.from("menu_items").select("*").eq("active", true).order("item, variant")

      // Fetch all orders for this Friday
      const { data: ordersData } = await supabase
        .from("orders")
        .select(`
          *,
          user:users(name, email)
        `)
        .eq("friday_date", fridayDate)
        .order("created_at")

      // Fetch current user's order
      const { data: currentOrderData } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", user.id)
        .eq("friday_date", fridayDate)
        .single()

      setMenuItems(menuData || [])
      setOrders(ordersData || [])
      setCurrentOrder(currentOrderData || null)

      // Pre-fill form if user has an existing order
      if (currentOrderData) {
        setSelectedItem(currentOrderData.item)
        setSelectedVariant(currentOrderData.variant)
        setNotes(currentOrderData.notes || "")
      }
    } catch (error) {
      console.error("Error fetching data:", error)
    }
  }

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    if (!selectedItem || !selectedVariant) {
      setError("Please select both item and variant")
      setIsLoading(false)
      return
    }

    if (notes.length > 100) {
      setError("Notes must be 100 characters or less")
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
        // Update existing order
        const { error } = await supabase.from("orders").update(orderData).eq("id", currentOrder.id)
        if (error) throw error

        // Log update event
        await supabase.from("events").insert({
          type: "order_updated",
          user_id: user.id,
          payload: { order_id: currentOrder.id, ...orderData },
        })
      } else {
        // Create new order
        const { error } = await supabase.from("orders").insert(orderData)
        if (error) throw error

        // Log create event
        await supabase.from("events").insert({
          type: "order_created",
          user_id: user.id,
          payload: orderData,
        })
      }

      // Update phone number if provided
      if (phone !== user.phone) {
        await supabase.from("users").update({ phone }).eq("id", user.id)
      }

      // Refresh data
      await fetchData()
    } catch (error) {
      setError(error instanceof Error ? error.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  const formatTimeUntil = () => {
    if (timeUntilNext.days > 0) {
      return `${timeUntilNext.days}d ${timeUntilNext.hours}h ${timeUntilNext.minutes}m`
    } else if (timeUntilNext.hours > 0) {
      return `${timeUntilNext.hours}h ${timeUntilNext.minutes}m`
    } else {
      return `${timeUntilNext.minutes}m`
    }
  }

  // Check if orders are locked
  const isOrdersLocked = currentOrder?.locked || false
  const canOrder = isWindowOpen && !isOrdersLocked

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Friday Tony's Orders</h1>
            <p className="text-muted-foreground">
              Welcome back, {user.name}
              {user.role === "admin" && <Badge className="ml-2">Admin</Badge>}
            </p>
          </div>
          <Button variant="outline" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
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
                        ? "Open until 12:30"
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

          {/* Team Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Team Orders</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Order Summary */}
              <div>
                <h4 className="font-medium mb-2">Order Summary</h4>
                <div className="space-y-2">
                  {orderSummary.map((summary, index) => (
                    <div key={index} className="flex justify-between text-sm">
                      <span>
                        {summary.item} - {summary.variant}
                      </span>
                      <Badge variant="secondary">x{summary.count}</Badge>
                    </div>
                  ))}
                  {orderSummary.length === 0 && <p className="text-sm text-muted-foreground">No orders yet</p>}
                </div>
              </div>

              <Separator />

              {/* Individual Orders */}
              <div>
                <h4 className="font-medium mb-2">Individual Orders</h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {orders.map((order) => (
                    <div key={order.id} className="flex justify-between items-start text-sm">
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
                  {orders.length === 0 && <p className="text-sm text-muted-foreground">No orders yet</p>}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Admin Panel */}
        {user.role === "admin" && (
          <div>
            <AdminPanel user={user} />
          </div>
        )}
      </div>
    </div>
  )
}
