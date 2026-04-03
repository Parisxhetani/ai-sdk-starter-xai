"use client"

import { useState, useEffect, useImperativeHandle, forwardRef, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { formatMenuVariantLabel, formatOrderLine } from "@/lib/utils"
import { getCurrentFriday, formatFridayDate } from "@/lib/utils/time"
import type { User, MenuItem, Order } from "@/lib/types"
import { Plus, Edit, Trash2, UserPlus, AlertCircle } from "lucide-react"

interface AdminOrderManagementProps {
  user: User
  onChange?: () => void
}

export interface AdminOrderManagementHandle {
  openCreateOrderForUser: (userId: string) => void
  openEditOrder: (order: Order) => void
}

const ADMIN_ORDERS_ENDPOINT = "/api/admin/orders"

export const AdminOrderManagement = forwardRef<AdminOrderManagementHandle, AdminOrderManagementProps>(({ user, onChange }, ref) => {
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [fridayDate, setFridayDate] = useState<string | null>(null)

  const [showOrderDialog, setShowOrderDialog] = useState(false)
  const [editingOrder, setEditingOrder] = useState<Order | null>(null)
  const [selectedUserId, setSelectedUserId] = useState("")
  const [selectedItem, setSelectedItem] = useState("")
  const [selectedVariant, setSelectedVariant] = useState("")
  const [notes, setNotes] = useState("")

  const activeMenuItems = useMemo(() => menuItems.filter((item) => item.active), [menuItems])

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

  useEffect(() => {
    if (user.role === "admin" && fridayDate) {
      void fetchData()
    }
  }, [user.role, fridayDate])

  const fetchData = async () => {
    if (!fridayDate) return
    try {
      const response = await fetch(`${ADMIN_ORDERS_ENDPOINT}?fridayDate=${fridayDate}`, {
        cache: "no-store",
        credentials: "include",
      })
      if (!response.ok) {
        throw new Error("Failed to load admin data")
      }
      const data = await response.json()
      setAllUsers(data.users || [])
      setMenuItems((data.menuItems || []) as MenuItem[])
      setOrders(data.orders || [])
    } catch (error) {
      console.error("Error fetching admin order data:", error)
      setError("Failed to fetch data")
    }
  }

  const resetForm = () => {
    setSelectedUserId("")
    setSelectedItem("")
    setSelectedVariant("")
    setNotes("")
    setEditingOrder(null)
    setError(null)
    setSuccess(null)
  }

  const handleOpenDialog = (order?: Order) => {
    resetForm()
    if (order) {
      setEditingOrder(order)
      setSelectedUserId(order.user_id)
      setSelectedItem(order.item)
      setSelectedVariant(order.variant)
      setNotes(order.notes || "")
    }
    setShowOrderDialog(true)
  }

  const openCreateOrderForUser = (targetUserId: string) => {
    resetForm()
    setSelectedUserId(targetUserId)
    setShowOrderDialog(true)
  }

  const openEditOrder = (order: Order) => {
    handleOpenDialog(order)
  }

  useImperativeHandle(ref, () => ({
    openCreateOrderForUser,
    openEditOrder,
  }))

  const handleCloseDialog = () => {
    setShowOrderDialog(false)
    resetForm()
  }

  const handleSubmitOrder = async () => {
    if (!fridayDate) {
      setError("Ordering date unavailable. Please try again shortly.")
      return
    }
    setIsLoading(true)
    setError(null)
    setSuccess(null)

    if (!selectedUserId || !selectedItem || !selectedVariant) {
      setError("Please select user, item, and variant")
      setIsLoading(false)
      return
    }

    if (notes.length > 100) {
      setError("Notes must be 100 characters or less")
      setIsLoading(false)
      return
    }

    try {
      const payload = {
        user_id: selectedUserId,
        item: selectedItem,
        variant: selectedVariant,
        notes: notes.trim() || null,
        friday_date: fridayDate,
      }

      const response = await fetch(ADMIN_ORDERS_ENDPOINT, {
        method: editingOrder ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(editingOrder ? { id: editingOrder.id, updates: payload } : payload),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to save order")
      }

      setSuccess(editingOrder ? "Order updated" : "Order created")
      await fetchData()
      handleCloseDialog()
      onChange?.()
    } catch (error) {
      console.error("Error saving order:", error)
      setError(error instanceof Error ? error.message : "Failed to save order")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteOrder = async (order: Order) => {
    if (!confirm("Delete this order?")) return

    try {
      const response = await fetch(`${ADMIN_ORDERS_ENDPOINT}?id=${order.id}`, {
        method: "DELETE",
        credentials: "include",
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to delete order")
      }

      await fetchData()
      onChange?.()
    } catch (error) {
      console.error("Error deleting order:", error)
      setError(error instanceof Error ? error.message : "Failed to delete order")
    }
  }

  const availableVariants = useMemo(() => menuItems.filter((item) => item.item === selectedItem), [menuItems, selectedItem])

  const usersWithoutOrders = useMemo(
    () => allUsers.filter((u) => u.whitelisted && !orders.some((o) => o.user_id === u.id)),
    [allUsers, orders],
  )

  return (
    <Card className="bg-background/70">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Order Management</CardTitle>
          <p className="text-sm text-muted-foreground">Create, edit, or delete orders for any teammate.</p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="mr-2 h-4 w-4" />
          Add Order
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-4">
          <div>
            <h4 className="mb-2 font-semibold">Users without orders ({usersWithoutOrders.length})</h4>
            <div className="flex flex-wrap gap-2">
              {usersWithoutOrders.map((user) => (
                <Button key={user.id} variant="outline" size="sm" onClick={() => openCreateOrderForUser(user.id)}>
                  <UserPlus className="mr-2 h-3 w-3" />
                  {user.name}
                </Button>
              ))}
              {usersWithoutOrders.length === 0 && (
                <p className="text-sm text-muted-foreground">Everyone is covered!</p>
              )}
            </div>
          </div>

          <div>
            <h4 className="mb-2 font-semibold">Current Orders ({orders.length})</h4>
            <div className="space-y-2">
              {orders.map((order) => {
                const menuMatch = menuItems.find((item) => item.item === order.item && item.variant === order.variant)
                return (
                  <div key={order.id} className="flex flex-col gap-1 rounded-lg border p-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{order.user?.name || order.user?.email}</p>
                        {order.locked && (
                          <Badge variant="destructive" className="text-xs">
                            Locked
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {formatOrderLine(order.item, order.variant, menuMatch?.price_all)}
                      </p>
                      {order.notes && <p className="text-xs text-muted-foreground italic">"{order.notes}"</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleOpenDialog(order)} disabled={order.locked}>
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDeleteOrder(order)} disabled={order.locked}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )
              })}
              {orders.length === 0 && <p className="text-sm text-muted-foreground">No orders yet</p>}
            </div>
          </div>

          <Dialog open={showOrderDialog} onOpenChange={setShowOrderDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingOrder ? "Edit Order" : "Add Order"}</DialogTitle>
                <DialogDescription>Fill out the details and save to update this week's order.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="user-select">User *</Label>
                  <Select value={selectedUserId} onValueChange={setSelectedUserId} disabled={!!editingOrder}>
                    <SelectTrigger className="bg-background text-foreground border-border">
                      <SelectValue placeholder="Select a user" />
                    </SelectTrigger>
                    <SelectContent className="bg-background text-foreground border border-border">
                      {allUsers.map((user) => (
                        <SelectItem className="focus:bg-accent focus:text-accent-foreground" key={user.id} value={user.id}>
                          {user.name} ({user.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="item-select">Item *</Label>
                  <Select
                    value={selectedItem}
                    onValueChange={(value) => {
                      setSelectedItem(value)
                      setSelectedVariant("")
                    }}
                  >
                    <SelectTrigger className="bg-background text-foreground border-border">
                      <SelectValue placeholder="Select an item" />
                    </SelectTrigger>
                    <SelectContent className="bg-background text-foreground border border-border">
                      {Array.from(new Set(activeMenuItems.map((item) => item.item))).map((item) => (
                        <SelectItem className="focus:bg-accent focus:text-accent-foreground" key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="variant-select">Variant *</Label>
                  <Select value={selectedVariant} onValueChange={setSelectedVariant} disabled={!selectedItem}>
                    <SelectTrigger className="bg-background text-foreground border-border">
                      <SelectValue placeholder="Select a variant" />
                    </SelectTrigger>
                    <SelectContent className="bg-background text-foreground border border-border">
                      {availableVariants.map((item) => (
                        <SelectItem className="focus:bg-accent focus:text-accent-foreground" key={item.id} value={item.variant}>
                          {formatMenuVariantLabel(item.variant, item.price_all)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="notes-input">Notes (optional)</Label>
                  <Textarea
                    id="notes-input"
                    placeholder="Any special requests..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    maxLength={100}
                  />
                  <p className="text-xs text-muted-foreground">{notes.length}/100 characters</p>
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {success && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{success}</AlertDescription>
                  </Alert>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={handleCloseDialog}>
                  Cancel
                </Button>
                <Button onClick={handleSubmitOrder} disabled={isLoading}>
                  {isLoading ? "Saving..." : editingOrder ? "Update Order" : "Create Order"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  )
})

AdminOrderManagement.displayName = "AdminOrderManagement"
