"use client"

import { useState, useEffect, useImperativeHandle, forwardRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
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

export const AdminOrderManagement = forwardRef<AdminOrderManagementHandle, AdminOrderManagementProps>(({ user, onChange }, ref) => {
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Form state for adding/editing orders
  const [showOrderDialog, setShowOrderDialog] = useState(false)
  const [editingOrder, setEditingOrder] = useState<Order | null>(null)
  const [selectedUserId, setSelectedUserId] = useState("")
  const [selectedItem, setSelectedItem] = useState("")
  const [selectedVariant, setSelectedVariant] = useState("")
  const [notes, setNotes] = useState("")

  const supabase = createClient()
  const fridayDate = formatFridayDate(getCurrentFriday())

  useEffect(() => {
    if (user.role === "admin") {
      fetchData()
    }
  }, [user.role])

  const fetchData = async () => {
    try {
      // Fetch all users
      const { data: usersData } = await supabase.from("users").select("*").eq("whitelisted", true).order("name")

      // Fetch menu items
      const { data: menuData } = await supabase.from("menu_items").select("*").eq("active", true).order("item, variant")

      // Fetch orders for this Friday
      const { data: ordersData } = await supabase
        .from("orders")
        .select(`
          *,
          user:users(name, email, phone)
        `)
        .eq("friday_date", fridayDate)
        .order("created_at")

      setAllUsers(usersData || [])
      setMenuItems(menuData || [])
      setOrders(ordersData || [])
    } catch (error) {
      console.error("Error fetching data:", error)
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
      const orderData = {
        user_id: selectedUserId,
        friday_date: fridayDate,
        item: selectedItem,
        variant: selectedVariant,
        notes: notes.trim() || null,
      }

      if (editingOrder) {
        // Update existing order
        const { error } = await supabase.from("orders").update(orderData).eq("id", editingOrder.id)

        if (error) throw error

        // Log update event
        await supabase.from("events").insert({
          type: "admin_order_updated",
          user_id: user.id,
          payload: {
            order_id: editingOrder.id,
            target_user_id: selectedUserId,
            ...orderData,
          },
        })

        setSuccess("Order updated successfully")
      } else {
        // Check if user already has an order
        const existingOrder = orders.find((o) => o.user_id === selectedUserId)
        if (existingOrder) {
          setError("This user already has an order for this Friday")
          setIsLoading(false)
          return
        }

        // Create new order
        const { error } = await supabase.from("orders").insert(orderData)

        if (error) throw error

        // Log create event
        await supabase.from("events").insert({
          type: "admin_order_created",
          user_id: user.id,
          payload: {
            target_user_id: selectedUserId,
            ...orderData,
          },
        })

        setSuccess("Order created successfully")
      }

      // Refresh data and close dialog
      await fetchData()
      onChange?.()
      setTimeout(() => {
        handleCloseDialog()
      }, 1500)
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to save order")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteOrder = async (order: Order) => {
    if (!confirm(`Are you sure you want to delete ${order.user?.name}'s order?`)) {
      return
    }

    try {
      const { error } = await supabase.from("orders").delete().eq("id", order.id)

      if (error) throw error

      // Log delete event
      await supabase.from("events").insert({
        type: "admin_order_deleted",
        user_id: user.id,
        payload: {
          order_id: order.id,
          target_user_id: order.user_id,
          item: order.item,
          variant: order.variant,
        },
      })

      await fetchData()
      onChange?.()
      setSuccess("Order deleted successfully")
      setTimeout(() => setSuccess(null), 3000)
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to delete order")
      setTimeout(() => setError(null), 3000)
    }
  }

  if (user.role !== "admin") {
    return null
  }

  // Get available variants for selected item
  const availableVariants = menuItems.filter((item) => item.item === selectedItem)

  // Get users who haven't ordered yet
  const orderedUserIds = orders.map((order) => order.user_id)
  const usersWithoutOrders = allUsers.filter((u) => !orderedUserIds.includes(u.id))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Order Management
          </div>
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="mr-2 h-4 w-4" />
            Add Order
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Success/Error Messages */}
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

        {/* Users without orders */}
        {usersWithoutOrders.length > 0 && (
          <div>
            <h4 className="font-medium mb-2">Users without orders ({usersWithoutOrders.length})</h4>
            <div className="flex flex-wrap gap-2">
              {usersWithoutOrders.map((user) => (
                <Badge
                  key={user.id}
                  variant="outline"
                  className="cursor-pointer hover:bg-muted"
                  onClick={() => handleOpenDialog()}
                >
                  {user.name}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Current Orders Management */}
        <div>
          <h4 className="font-medium mb-2">Current Orders ({orders.length})</h4>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {orders.map((order) => (
              <div key={order.id} className="flex items-center justify-between p-3 border rounded">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{order.user?.name}</span>
                    {order.locked && (
                      <Badge variant="destructive" className="text-xs">
                        Locked
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {order.item} - {order.variant}
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
            ))}
            {orders.length === 0 && <p className="text-sm text-muted-foreground">No orders yet</p>}
          </div>
        </div>

        {/* Order Dialog */}
        <Dialog open={showOrderDialog} onOpenChange={setShowOrderDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingOrder ? "Edit Order" : "Add Order"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="user-select">User *</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId} disabled={!!editingOrder}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a user" />
                  </SelectTrigger>
                  <SelectContent>
                    {allUsers.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
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
                <Label htmlFor="variant-select">Variant *</Label>
                <Select value={selectedVariant} onValueChange={setSelectedVariant} disabled={!selectedItem}>
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
      </CardContent>
    </Card>
  )
})
AdminOrderManagement.displayName = "AdminOrderManagement"
