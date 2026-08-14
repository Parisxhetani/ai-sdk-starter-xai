"use client"

import { useMemo } from "react"
import { motion } from "framer-motion"
import { ClipboardCheck, ClipboardCopy } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"
import { buildCoffeeRunMessage, hasCoffeeCombos, summarizeCoffee, type CoffeeOrderLike } from "@/lib/coffee"
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
 *
 * Two blocks, because they answer different questions. Item totals are what you
 * say at the counter; the per-person picks are how you hand the tray out after.
 */
export function CoffeeRunSummary({ orders, className }: CoffeeRunSummaryProps) {
  const tally = useMemo(() => summarizeCoffee(orders), [orders])
  const { copy, isCopied } = useCopyToClipboard({ successMessage: "Coffee list copied — paste it in the group" })

  const hasAnswers = tally.decidedCount > 0
  const showBreakdown = hasCoffeeCombos(tally)

  return (
    <div className={className}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-medium">☕ After-lunch run</h4>
        <div className="flex items-center gap-2">
          {tally.totalCount > 0 && (
            <Badge
              variant="outline"
              className={cn(
                "rounded-full text-xs",
                tally.decidedCount === tally.totalCount &&
                  "border-emerald-400/40 bg-emerald-400/15 text-emerald-600 dark:text-emerald-400",
              )}
            >
              {tally.decidedCount}/{tally.totalCount} decided
            </Badge>
          )}
          {tally.itemCount > 0 && (
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
        <motion.div className="space-y-4" variants={staggerContainer} initial="hidden" animate="show">
          {/* What you say at the counter. Combos are already split apart here. */}
          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary/80">To order at the bar</p>
              <p className="text-xs text-muted-foreground">
                {tally.itemCount} {tally.itemCount === 1 ? "drink" : "drinks"} · {tally.joiningCount}{" "}
                {tally.joiningCount === 1 ? "person" : "people"}
              </p>
            </div>

            <div className="space-y-1 rounded-2xl border border-primary/20 bg-primary/[0.06] p-2.5">
              {tally.itemRows.map((row) => (
                <motion.div
                  key={row.key}
                  variants={staggerItem}
                  className="flex items-center justify-between gap-2 rounded-lg px-1.5 py-1"
                >
                  <span className="flex min-w-0 items-center gap-2 text-sm">
                    <span className="shrink-0">{row.emoji}</span>
                    <span className="min-w-0 break-words">{row.label}</span>
                  </span>
                  <span className="shrink-0 text-lg font-semibold leading-none tabular-nums">{row.count}</span>
                </motion.div>
              ))}

              {/* Free text can't be split into items, so each one is its own line.
                  Wraps rather than truncating — a custom order you can't finish
                  reading is no use at the counter, and neither is a cut-off name. */}
              {tally.others.map((entry, index) => (
                <motion.div
                  key={`other-${index}-${entry.name}`}
                  variants={staggerItem}
                  className="flex items-start justify-between gap-2 rounded-lg px-1.5 py-1"
                >
                  <span className="flex min-w-0 items-start gap-2 text-sm">
                    <span className="shrink-0 leading-5">✏️</span>
                    <span className="min-w-0">
                      <span className="block break-words leading-5">{entry.note || "something else"}</span>
                      <span className="block break-words text-xs text-muted-foreground">{entry.name}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-lg font-semibold leading-none tabular-nums">1</span>
                </motion.div>
              ))}

              {tally.itemRows.length === 0 && tally.others.length === 0 && (
                <p className="px-1.5 py-1 text-sm text-muted-foreground">Nobody's joining the coffee run.</p>
              )}
            </div>
          </div>

          {/* Only shown when a combo makes this differ from the list above. */}
          {showBreakdown && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Who picked what
              </p>
              <div className="space-y-1">
                {tally.rows.map((row) => (
                  <motion.div
                    key={row.choice}
                    variants={staggerItem}
                    className="flex items-center justify-between rounded-lg px-2 py-1 text-sm transition-colors hover:bg-muted/50"
                  >
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <span>{row.emoji}</span>
                      {row.label}
                    </span>
                    <Badge variant="secondary">x{row.count}</Badge>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {(tally.notJoining.length > 0 || tally.stillDeciding.length > 0) && (
            <div className="space-y-0.5 px-1 text-xs text-muted-foreground">
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
