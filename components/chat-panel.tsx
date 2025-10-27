"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Message, User } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { MessageCircle, X } from "lucide-react"

interface ChatPanelProps {
  currentUser: User
  defaultOpen?: boolean
}

const MAX_MESSAGE_LENGTH = 1000
const MESSAGE_LIMIT = 200

type UserMeta = { name: string | null; email: string | null }

export function ChatPanel({ currentUser, defaultOpen = false }: ChatPanelProps) {
  const supabase = useMemo(() => createClient(), [])
  const [messages, setMessages] = useState<Message[]>([])
  const [message, setMessage] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const listRef = useRef<HTMLDivElement | null>(null)
  const userCache = useRef<Map<string, UserMeta>>(new Map())

  useEffect(() => {
    userCache.current.set(currentUser.id, {
      name: currentUser.name,
      email: currentUser.email,
    })
  }, [currentUser])

  useEffect(() => {
    let active = true

    const prime = async () => {
      await primeChat()

      const channel = supabase
        .channel("public:messages")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          async (payload) => {
            if (!active) return
            const enriched = await enrichMessage(payload.new as Message)
            setMessages((prev) =>
              [...prev.filter((msg) => msg.id !== enriched.id), enriched]
                .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                .slice(-MESSAGE_LIMIT),
            )
          },
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "messages" },
          (payload) => {
            if (!active) return
            const removedId = (payload.old as Message).id
            setMessages((prev) => prev.filter((msg) => msg.id !== removedId))
          },
        )
        .subscribe()

      return () => {
        active = false
        void supabase.removeChannel(channel)
      }
    }

    void prime()

    return () => {
      active = false
    }
  }, [supabase])

  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current
    el.scrollTo({ top: el.scrollHeight, behavior: messages.length === 0 ? "auto" : "smooth" })
  }, [messages])

  async function primeChat() {
    const { data, error: fetchError } = await supabase
      .from("messages")
      .select("*, user:users(name, email)")
      .order("created_at", { ascending: true })
      .limit(MESSAGE_LIMIT)

    if (fetchError) {
      console.error(fetchError)
      setError("Unable to load chat messages")
      return
    }

    const loaded = await Promise.all(
      (data ?? []).map(async (msg) => {
        const typed = msg as Message
        if (typed.user) {
          const meta = {
            name: typed.user.name?.trim() ?? null,
            email: typed.user.email?.trim() ?? null,
          }
          userCache.current.set(typed.user_id, meta)
          return { ...typed, user: meta }
        }

        return enrichMessage(typed)
      }),
    )

    setMessages(loaded)
  }

  async function enrichMessage(message: Message): Promise<Message> {
    if (message.user?.name || message.user?.email) {
      const meta = {
        name: message.user.name?.trim() ?? null,
        email: message.user.email?.trim() ?? null,
      }
      userCache.current.set(message.user_id, meta)
      return { ...message, user: meta }
    }

    if (message.user_id === currentUser.id) {
      const meta = {
        name: currentUser.name?.trim() ?? null,
        email: currentUser.email?.trim() ?? null,
      }
      userCache.current.set(message.user_id, meta)
      return { ...message, user: meta }
    }

    const cached = userCache.current.get(message.user_id)
    if (cached) {
      return { ...message, user: cached }
    }

    const { data } = await supabase
      .from("users")
      .select("name, email")
      .eq("id", message.user_id)
      .maybeSingle()

    if (data) {
      const meta = {
        name: data.name?.trim() ?? null,
        email: data.email?.trim() ?? null,
      }
      userCache.current.set(message.user_id, meta)
      return { ...message, user: meta }
    }

    return message
  }

  async function handleSend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = message.trim()
    if (!trimmed) {
      setError("Type a message first")
      return
    }

    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      setError(`Messages are limited to ${MAX_MESSAGE_LENGTH} characters`)
      return
    }

    setIsSending(true)
    setError(null)

    const { error: sendError } = await supabase.from("messages").insert({
      user_id: currentUser.id,
      content: trimmed,
    })

    if (sendError) {
      console.error(sendError)
      setError("Failed to send message")
    } else {
      setMessage("")
    }

    setIsSending(false)
  }

  const trimmedLength = message.trim().length
  const isSubmitDisabled = isSending || trimmedLength === 0

  if (!isOpen) {
    return (
      <Button onClick={() => setIsOpen(true)} className="shadow-lg" size="sm">
        <MessageCircle className="mr-2 h-4 w-4" />
        Team Chat
      </Button>
    )
  }

  return (
    <Card className="flex h-full max-h-[60vh] sm:max-h-[70vh] lg:max-h-[75vh] w-full flex-col border bg-background/95 shadow-xl">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-xl">
            Team Chat
            <Badge variant="outline" className="border-primary/40 bg-primary/5 text-xs font-normal text-primary">
              Live
            </Badge>
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Everyone online can see these messages. Keep it Friday-friendly!
        </p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <div
          ref={listRef}
          className="flex-1 space-y-3 overflow-y-auto rounded-lg bg-accent/40 p-3"
          role="log"
          aria-live="polite"
        >
          {messages.length === 0 && <p className="text-sm text-muted-foreground">Say hello! No messages yet.</p>}
          {messages.map((msg) => {
            const isSelf = msg.user_id === currentUser.id
            const cachedMeta = userCache.current.get(msg.user_id)
            const resolvedName = msg.user?.name?.trim() || cachedMeta?.name?.trim()
            const resolvedEmail = msg.user?.email?.trim() || cachedMeta?.email?.trim()
            const baseName =
              resolvedName ||
              resolvedEmail ||
              (isSelf ? currentUser.name?.trim() || currentUser.email?.trim() : undefined)

            const displayName = baseName
              ? isSelf
                ? `${baseName} (You)`
                : baseName
              : isSelf
                ? `${currentUser.name?.trim() || currentUser.email?.trim() || "You"} (You)`
                : "Unknown sender"
            const timestamp = new Date(msg.created_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })

            return (
              <div key={msg.id} className={cn("flex", isSelf ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[80%] rounded-xl px-3 py-2 text-sm shadow-sm",
                    isSelf ? "bg-primary text-primary-foreground" : "bg-background text-foreground",
                  )}
                >
                  <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <span>{displayName}</span>
                    <span>-</span>
                    <time dateTime={msg.created_at}>{timestamp}</time>
                  </div>
                  <p className="whitespace-pre-wrap break-words leading-snug">{msg.content}</p>
                </div>
              </div>
            )
          })}
        </div>

        <form onSubmit={handleSend} className="space-y-2">
          <Textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Share plans, coordinate orders, celebrate Friday..."
            rows={2}
            maxLength={MAX_MESSAGE_LENGTH}
          />
          <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              {trimmedLength}/{MAX_MESSAGE_LENGTH}
            </span>
            {error && <span className="text-destructive">{error}</span>}
            <Button type="submit" size="sm" disabled={isSubmitDisabled}>
              {isSending ? "Sending..." : "Send"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
