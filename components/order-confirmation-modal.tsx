"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import type { MenuItem } from "@/lib/types"
import { UtensilsCrossed, Clock, AlertCircle } from "lucide-react"

interface OrderConfirmationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  selectedItem: MenuItem | null
  notes: string
  isUpdating: boolean
}

export function OrderConfirmationModal({
  open,
  onOpenChange,
  onConfirm,
  selectedItem,
  notes,
  isUpdating,
}: OrderConfirmationModalProps) {
  const [confirmed, setConfirmed] = useState(false)

  const handleConfirm = () => {
    setConfirmed(true)
    onConfirm()
  }

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen)
    if (!newOpen) {
      setConfirmed(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UtensilsCrossed className="h-5 w-5 text-primary" />
            Confirm Your Order
          </DialogTitle>
          <DialogDescription>
            Please review your order before submitting
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg border bg-muted/50 p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="font-semibold">{selectedItem?.item}</p>
                <p className="text-sm text-muted-foreground">{selectedItem?.variant}</p>
              </div>
              <Badge variant="secondary" className="shrink-0">
                1 order
              </Badge>
            </div>
            {notes && (
              <>
                <Separator className="my-3" />
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Notes:</p>
                  <p className="text-sm italic">&quot;{notes}&quot;</p>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <Clock className="h-4 w-4 shrink-0" />
            <p className="text-xs">
              You can modify or cancel your order until the ordering window closes
            </p>
          </div>

          {!confirmed && (
            <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <p className="text-xs">
                Click &quot;Confirm Order&quot; to submit your selection
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={confirmed}
          >
            Edit
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={confirmed}
            className="min-w-[120px]"
          >
            {confirmed ? (
              <>
                <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Submitting...
              </>
            ) : (
              "Confirm Order"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
