"use client"

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { buildCashPlan } from "@/lib/cash-planning"
import { formatLekPrice, formatOrderLine, getMenuItemLookupKey } from "@/lib/utils"
import type { MenuItem, Order } from "@/lib/types"
import { Banknote, ArrowRightLeft, AlertTriangle } from "lucide-react"

interface CashPlannerCardProps {
  orders: Order[]
  menuItems: MenuItem[]
  title?: string
}

export function CashPlannerCard({ orders, menuItems, title = "Cash Planner" }: CashPlannerCardProps) {
  const plan = useMemo(() => buildCashPlan(orders, menuItems), [menuItems, orders])
  const priceMap = useMemo(
    () => new Map(menuItems.map((item) => [getMenuItemLookupKey(item.item, item.variant), item.price_all])),
    [menuItems],
  )

  if (!plan) {
    return null
  }

  const selectedContributions = plan.contributions.filter((contribution) => contribution.paysTonyAll > 0)

  return (
    <Card className="bg-background/70">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Banknote className="h-5 w-5" />
          {title}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Each teammate can enter the cash they have today. The planner picks the smallest-change Tony combo first, then suggests reimbursements between teammates.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Food Total</p>
            <p className="text-lg font-semibold">{formatLekPrice(plan.totalCostAll) ?? "ALL 0"}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Cash Entered</p>
            <p className="text-lg font-semibold">{formatLekPrice(plan.totalCashAvailableAll) ?? "ALL 0"}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Tony Change</p>
            <p className="text-lg font-semibold">{plan.canCoverTotal ? formatLekPrice(plan.tonyChangeAll) ?? "ALL 0" : "Pending"}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Missing Cash Entries</p>
            <p className="text-lg font-semibold">{plan.missingCashCount}</p>
          </div>
        </div>

        {!plan.isComplete && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Some orders are missing menu prices, so the planner cannot finish yet.
            </AlertDescription>
          </Alert>
        )}

        {plan.isComplete && !plan.canCoverTotal && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              The team still needs {formatLekPrice(plan.shortfallAll) ?? "ALL 0"} more in entered cash before the planner can cover the full order.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Entered Cash</h4>
            <Badge variant="outline">{plan.cashEnteredCount} of {plan.participants.length} filled in</Badge>
          </div>
          <div className="space-y-2">
            {plan.participants.map((participant) => {
              const orderPriceLabel = formatLekPrice(priceMap.get(getMenuItemLookupKey(participant.item, participant.variant)))
              return (
                <div key={participant.orderId} className="flex flex-col gap-1 rounded-lg border p-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-medium">{participant.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatOrderLine(participant.item, participant.variant, participant.priceAll)}
                    </p>
                  </div>
                  <div className="text-sm text-muted-foreground md:text-right">
                    <p>Cash today: {formatLekPrice(participant.cashAvailableAll) ?? "Not entered"}</p>
                    {orderPriceLabel && <p>Meal: {orderPriceLabel}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {plan.isComplete && plan.canCoverTotal && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Best Tony Combo</h4>
                <Badge variant="secondary">{selectedContributions.length} payer{selectedContributions.length === 1 ? "" : "s"}</Badge>
              </div>
              <div className="space-y-2">
                {selectedContributions.map((contribution) => (
                  <div key={contribution.orderId} className="rounded-lg border p-3">
                    <p className="font-medium">{contribution.name} pays {formatLekPrice(contribution.paysTonyAll) ?? "ALL 0"} to Tony</p>
                    <p className="text-sm text-muted-foreground">
                      Own meal {formatLekPrice(contribution.mealCostAll) ?? "ALL 0"}
                      {contribution.receivesChangeAll > 0
                        ? `, should take ${formatLekPrice(contribution.receivesChangeAll) ?? "ALL 0"} change back`
                        : ", no Tony change needed back"}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <Separator />
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="h-4 w-4" />
                <h4 className="font-medium">Internal Settlements</h4>
              </div>
              {plan.settlements.length > 0 ? (
                <div className="space-y-2">
                  {plan.settlements.map((settlement, index) => (
                    <div key={`${settlement.fromOrderId}-${settlement.toOrderId}-${index}`} className="rounded-lg border p-3 text-sm">
                      <span className="font-medium">{settlement.fromName}</span> should give{" "}
                      <span className="font-medium">{formatLekPrice(settlement.amountAll) ?? "ALL 0"}</span> to{" "}
                      <span className="font-medium">{settlement.toName}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No teammate reimbursements are needed with the current combo.</p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
