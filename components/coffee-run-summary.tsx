"use client"

import { useMemo } from "react"
import { motion } from "framer-motion"
import { ClipboardCheck, ClipboardCopy } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"
import { buildCoffeeRunMessage, summarizeCoffee, type CoffeeOrderLike } from "@/lib/coffee"
import { cn } from "@/lib/utils"

interface CoffeeRunSummaryProps {
  orders: CoffeeOrderLike[]
  className?: string
}

const staggerContainer = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
}

const staggerItem = {
  hidden: { opacity: 0, x: -8 },
  show: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 320, damping: 26 } },
}

/**
 * The list somebody reads out at the bar. Lives inside the Team Orders card so
 * the coffee round sits next to the lunch it follows — and stays visible to
 * everyone, since whoever walks over isn't necessarily an admin.
 */
export function CoffeeRunSummary({ orders, className }: CoffeeRunSummaryProps) {
  const tally = useMemo(() => summarizeCoffee(orders), [orders])
  const { copy, isCopied } = useCopyToClipboard({ successMessage: "Coffee list copied — paste it in the group" })

  const hasAnswers = tally.decidedCount > 0

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="font-medium">☕ After-lunch run</h4>
        <div className="flex items-center gap-2">
          {tally.totalCount > 0 && (
            <Badge
              variant="outline"
              className={cn(
                "rounded-full text-xs",
                tally.decidedCount === tally.totalCount && "border-emerald-400/40 bg-emerald-400/15 text-emerald-600 dark:text-emerald-400",
              )}
            >
              {tally.decidedCount}/{tally.totalCount} decided
            </Badge>
          )}
          {tally.joiningCount > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 rounded-full px-3 text-xs"
              onClick={() => void copy(buildCoffeeRunMessage(tally))}
            >
              {isCopied ? <ClipboardCheck className="mr-1.5 h-3 w-3" /> : <ClipboardCopy className="mr-1.5 h-3 w-3" />}
              {isCopied ? "Copied" : "Copy"}
            </Button>
          )}
        </div>
      </div>

      {hasAnswers ? (
        <motion.div className="space-y-2" variants={staggerContainer} initial="hidden" animate="show">
          {tally.rows.map((row) => (
            <motion.div
              key={row.choice}
              variants={staggerItem}
              className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted/50"
            >
              <span className="flex items-center gap-2">
                <span>{row.emoji}</span>
                {row.label}
              </span>
              <Badge variant="secondary">x{row.count}</Badge>
            </motion.div>
          ))}

          {/* Listed one by one — folding a custom request into a count loses it. */}
          {tally.others.map((entry, index) => (
            <motion.div
              key={`other-${index}-${entry.name}`}
              variants={staggerItem}
              className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted/50"
            >
              <span className="flex items-center gap-2">
                <span>✏️</span>
                <span>
                  <span className="font-medium">{entry.name}</span>
                  {entry.note ? ` · ${entry.note}` : " · something else"}
                </span>
              </span>
              <Badge variant="secondary">x1</Badge>
            </motion.div>
          ))}

          {(tally.notJoining.length > 0 || tally.stillDeciding.length > 0) && (
            <div className="space-y-0.5 px-2 pt-1 text-xs text-muted-foreground">
              {tally.notJoining.length > 0 && <p>Not joining: {tally.notJoining.join(", ")}</p>}
              {tally.stillDeciding.length > 0 && <p>Still deciding: {tally.stillDeciding.join(", ")}</p>}
            </div>
          )}
        </motion.div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {tally.totalCount === 0
            ? "The coffee round shows up here once people start ordering lunch."
            : "Nobody's picked a drink yet — the prompt appears right after you order."}
        </p>
      )}
    </div>
  )
}
