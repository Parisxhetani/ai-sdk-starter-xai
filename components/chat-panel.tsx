"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Message, User } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface ChatPanelProps {
  currentUser: User
}

const MAX_MESSAGE_LENGTH = 1000
const MESSAGE_LIMIT = 200

type UserMeta = { name: string; email: string }

export function ChatPanel({ currentUser }: ChatPanelProps) {
  const supabase = useMemo(() => createClient(), [])
  const [messages, setMessages] = useState<Message[]>([])
  const [message, setMessage] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const userCache = useRef<Map<string, UserMeta>>(new Map())

  useEffect(() => {
    let active = true
    void primeChat()

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

    channel.subscribe()

    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [supabase, currentUser])
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
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

    const loaded = (data ?? []).map((msg) => {
      if (msg.user) {
        userCache.current.set(msg.user_id, msg.user)
      }
      return msg as Message
    })

    setMessages(loaded)
  }

  async function enrichMessage(message: Message): Promise<Message> {
    if (message.user_id === currentUser.id) {
      return {
        ...message,
        user: {
          name: currentUser.name,
          email: currentUser.email,
        },
      }
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
      const meta = { name: data.name, email: data.email }
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

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-xl">
            Team Chat
            <Badge variant="outline" className="border-primary/40 bg-primary/5 text-xs font-normal text-primary">
              Live
            </Badge>
          </CardTitle>
        </div>
        <p className="text-sm text-muted-foreground">
          Everyone online can see these messages. Keep it Friday-friendly!
        </p>
      </CardHeader>
      <CardContent className="flex min-h-[320px] flex-1 flex-col gap-3">
        <div className="flex-1 space-y-3 overflow-y-auto rounded-lg bg-accent/40 p-3" role="log" aria-live="polite">
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground">Say hello! No messages yet.</p>
          )}
          {messages.map((msg) => {
            const isSelf = msg.user_id === currentUser.id
            const displayName = isSelf ? "You" : msg.user?.name || msg.user?.email || "Teammate"
            const timestamp = new Date(msg.created_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })

            return (
              <div key={msg.id} className={cn("flex", isSelf ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[80%] rounded-xl px-3 py-2 text-sm shadow-sm",
                    isSelf ? "bg-primary text-primary-foreground" : "bg-background text-foreground",
                  )}
                >
                  <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground/80">
                    <span>{displayName}</span>
                    <span>-</span>
                    <time dateTime={msg.created_at}>{timestamp}</time>
                  </div>
                  <p className="whitespace-pre-wrap break-words leading-snug">{msg.content}</p>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
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



