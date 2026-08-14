"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Check, Coffee } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CONCRETE_COFFEE_CHOICES, COFFEE_NOTE_MAX, type CoffeeChoice } from "@/lib/coffee"
import { cn } from "@/lib/utils"

interface CoffeeRunPromptProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Current pick, so reopening via "change" shows what they chose last. */
  choice: CoffeeChoice | null
  note: string
  isSaving: boolean
  onSave: (choice: CoffeeChoice, note: string) => void
}

export function CoffeeRunPrompt({ open, onOpenChange, choice, note, isSaving, onSave }: CoffeeRunPromptProps) {
  // A tap on one of the five drinks is the whole interaction — save and out.
  // Only "Something else" needs a second step, so it flips into note mode.
  const [noteMode, setNoteMode] = useState(false)
  const [draftNote, setDraftNote] = useState("")
  const [noteError, setNoteError] = useState(false)
  const [pending, setPending] = useState<CoffeeChoice | null>(null)

  useEffect(() => {
    if (!open) return
    setNoteMode(choice === "other")
    setDraftNote(note)
    setNoteError(false)
    setPending(null)
  }, [open, choice, note])

  const commit = (next: CoffeeChoice, nextNote = "") => {
    setPending(next)
    onSave(next, nextNote)
  }

  const commitOther = () => {
    const trimmed = draftNote.trim()
    if (!trimmed) {
      setNoteError(true)
      return
    }
    commit("other", trimmed)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* w-[calc(100%-1.5rem)] keeps a gutter instead of sitting edge-to-edge on
          a phone; max-h/overflow-y keeps every option reachable on short screens. */}
      <DialogContent className="max-h-[90vh] w-[calc(100%-1.5rem)] max-w-md overflow-y-auto rounded-[1.75rem] border-white/60 bg-white/90 backdrop-blur-2xl dark:border-white/10 dark:bg-zinc-900/90">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <motion.span
              animate={{ rotate: [0, 12, -12, 0] }}
              transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 3 }}
              className="inline-block"
            >
              <Coffee className="h-5 w-5 text-primary" />
            </motion.span>
            And after lunch?
          </DialogTitle>
          <DialogDescription>
            We settle the coffee round now, so nobody has to take eleven orders standing at the bar.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2.5">
          {CONCRETE_COFFEE_CHOICES.map((option, index) => {
            const isSelected = !noteMode && choice === option.value
            const isPending = pending === option.value
            return (
              <motion.button
                key={option.value}
                type="button"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 28, delay: index * 0.04 }}
                whileHover={isSaving ? undefined : { scale: 1.03, y: -2 }}
                whileTap={isSaving ? undefined : { scale: 0.97 }}
                onClick={() => commit(option.value)}
                disabled={isSaving}
                className={cn(
                  "relative flex min-h-[4.25rem] flex-col items-center justify-center gap-1 rounded-2xl border px-3 py-3 text-center transition-colors disabled:opacity-60",
                  isSelected
                    ? "border-primary/50 bg-primary/10 shadow-[0_10px_30px_-18px_rgba(20,146,230,0.7)]"
                    : "border-border/60 bg-white/70 hover:bg-white dark:bg-white/5 dark:hover:bg-white/10",
                )}
              >
                <span className="text-xl leading-none">{option.emoji}</span>
                <span className="text-xs font-medium leading-tight">{option.label}</span>
                {isSelected && (
                  <span className="absolute right-2 top-2 text-primary">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                )}
                {isPending && <span className="absolute inset-0 rounded-2xl bg-white/40 dark:bg-black/20" />}
              </motion.button>
            )
          })}

          <motion.button
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 28, delay: 0.2 }}
            whileHover={isSaving ? undefined : { scale: 1.03, y: -2 }}
            whileTap={isSaving ? undefined : { scale: 0.97 }}
            onClick={() => {
              setNoteMode(true)
              setNoteError(false)
            }}
            disabled={isSaving}
            className={cn(
              "flex min-h-[4.25rem] flex-col items-center justify-center gap-1 rounded-2xl border px-3 py-3 text-center transition-colors disabled:opacity-60",
              noteMode
                ? "border-primary/50 bg-primary/10 shadow-[0_10px_30px_-18px_rgba(20,146,230,0.7)]"
                : "border-border/60 bg-white/70 hover:bg-white dark:bg-white/5 dark:hover:bg-white/10",
            )}
          >
            <span className="text-xl leading-none">✏️</span>
            <span className="text-xs font-medium leading-tight">Something else</span>
          </motion.button>
        </div>

        {noteMode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="grid gap-2 overflow-hidden"
          >
            <Label htmlFor="coffee-note">What would you like?</Label>
            <div className="flex gap-2">
              <Input
                id="coffee-note"
                autoFocus
                placeholder="Chamomile tea, macchiato, fresh orange…"
                value={draftNote}
                maxLength={COFFEE_NOTE_MAX}
                disabled={isSaving}
                aria-invalid={noteError}
                onChange={(event) => {
                  setDraftNote(event.target.value)
                  setNoteError(false)
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    commitOther()
                  }
                }}
              />
              <Button type="button" onClick={commitOther} disabled={isSaving} className="shrink-0 rounded-full px-5">
                {isSaving ? "Saving…" : "Save"}
              </Button>
            </div>
            {noteError && <p className="text-xs text-destructive">Tell us what you'd like and we'll write it down.</p>}
          </motion.div>
        )}

        <div className="space-y-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            className={cn(
              "w-full rounded-full text-sm text-muted-foreground hover:text-foreground",
              choice === "none" && "bg-muted text-foreground",
            )}
            onClick={() => commit("none")}
            disabled={isSaving}
          >
            I'm not joining
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Not sure yet? Close this — you can pick any time before the window shuts.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
