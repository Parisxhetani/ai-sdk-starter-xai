"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Message, TeamMessage, User } from "@/lib/types"
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

type ChannelKey = "team" | "global"
type ChannelMessage = (Message | TeamMessage) & { _channel: ChannelKey }

const MAX_MESSAGE_LENGTH = 1000
const MESSAGE_LIMIT = 200

type UserMeta = { name: string | null; email: string | null }

export function ChatPanel({ currentUser, defaultOpen = false }: ChatPanelProps) {
  const supabase = useMemo(() => createClient(), [])
  const [channel, setChannel] = useState<ChannelKey>("team")
  const [messagesByChannel, setMessagesByChannel] = useState<Record<ChannelKey, ChannelMessage[]>>({
    team: [],
    global: [],
  })
  const [message, setMessage] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [unreadByChannel, setUnreadByChannel] = useState<Record<ChannelKey, number>>({ team: 0, global: 0 })
  const listRef = useRef<HTMLDivElement | null>(null)
  const formRef = useRef<HTMLFormElement | null>(null)
  const userCache = useRef<Map<string, UserMeta>>(new Map())
  const isOpenRef = useRef(isOpen)
  const channelRef = useRef(channel)

  useEffect(() => {
    userCache.current.set(currentUser.id, { name: currentUser.name, email: currentUser.email })
  }, [currentUser])

  useEffect(() => {
    isOpenRef.current = isOpen
    if (isOpen) setUnreadByChannel((u) => ({ ...u, [channel]: 0 }))
  }, [isOpen, channel])

  useEffect(() => {
    channelRef.current = channel
    setUnreadByChannel((u) => ({ ...u, [channel]: 0 }))
  }, [channel])

  // Prime + subscribe to BOTH channels in parallel.
  useEffect(() => {
    let active = true

    const primeAndSubscribe = async () => {
      await Promise.all([primeChannel("team"), primeChannel("global")])

      const globalChannel = supabase
        .channel("public:messages")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, async (payload) => {
          if (!active) return
          const enriched = await enrichMessage(payload.new as Message, "global")
          appendMessage(enriched)
        })
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (payload) => {
          if (!active) return
          const removedId = (payload.old as Message).id
          removeMessage("global", removedId)
        })
        .subscribe()

      const teamChannel = supabase
        .channel("public:team_messages")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "team_messages" }, async (payload) => {
          if (!active) return
          const raw = payload.new as TeamMessage
          if (raw.team_id !== currentUser.team_id) return
          const enriched = await enrichMessage(raw, "team")
          appendMessage(enriched)
        })
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "team_messages" }, (payload) => {
          if (!active) return
          const removedId = (payload.old as TeamMessage).id
          removeMessage("team", removedId)
        })
        .subscribe()

      return () => {
        active = false
        void supabase.removeChannel(globalChannel)
        void supabase.removeChannel(teamChannel)
      }
    }

    void primeAndSubscribe()

    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase])

  function appendMessage(msg: ChannelMessage) {
    setMessagesByChannel((prev) => {
      const list = prev[msg._channel]
      const next = [...list.filter((m) => m.id !== msg.id), msg]
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .slice(-MESSAGE_LIMIT)
      return { ...prev, [msg._channel]: next }
    })
    const inactive = !isOpenRef.current || channelRef.current !== msg._channel
    if (inactive && msg.user_id !== currentUser.id) {
      setUnreadByChannel((u) => ({ ...u, [msg._channel]: u[msg._channel] + 1 }))
    }
  }

  function removeMessage(ch: ChannelKey, id: string) {
    setMessagesByChannel((prev) => ({ ...prev, [ch]: prev[ch].filter((m) => m.id !== id) }))
  }

  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current
    el.scrollTo({ top: el.scrollHeight, behavior: messagesByChannel[channel].length === 0 ? "auto" : "smooth" })
  }, [messagesByChannel, channel])

  useEffect(() => {
    if (!isOpen || !listRef.current) return
    const el = listRef.current
    el.scrollTo({ top: el.scrollHeight, behavior: "auto" })
  }, [isOpen, channel])

  useEffect(() => {
    let cancelled = false
    const preloadUsers = async () => {
      try {
        const response = await fetch("/api/chat/users")
        if (!response.ok) throw new Error(`Failed to load chat users: ${response.status}`)
        const payload = (await response.json()) as {
          users: Array<{ id: string; name: string | null; email: string | null }>
        }
        if (cancelled) return
        payload.users.forEach((entry) => {
          userCache.current.set(entry.id, {
            name: entry.name?.trim() ?? null,
            email: entry.email?.trim() ?? null,
          })
        })
        setMessagesByChannel((prev) => {
          const enrich = (list: ChannelMessage[]) =>
            list.map((msg) => {
              const meta = userCache.current.get(msg.user_id)
              return meta ? ({ ...msg, user: meta } as ChannelMessage) : msg
            })
          return { team: enrich(prev.team), global: enrich(prev.global) }
        })
      } catch (e) {
        console.error("Failed to preload chat users", e)
      }
    }
    void preloadUsers()
    return () => {
      cancelled = true
    }
  }, [])

  async function primeChannel(ch: ChannelKey) {
    const table = ch === "team" ? "team_messages" : "messages"
    let query = supabase
      .from(table)
      .select(ch === "team" ? "*, user:users(name, email)" : "*, user:users(name, email)")
      .order("created_at", { ascending: true })
      .limit(MESSAGE_LIMIT)
    if (ch === "team") query = query.eq("team_id", currentUser.team_id)

    const { data, error: fetchError } = await query
    if (fetchError) {
      console.error(fetchError)
      setError(`Unable to load ${ch} chat messages`)
      return
    }
    const loaded = await Promise.all(
      ((data ?? []) as Array<Message | TeamMessage>).map((m) => enrichMessage(m, ch)),
    )
    setMessagesByChannel((prev) => ({ ...prev, [ch]: loaded }))
  }

  async function enrichMessage<T extends Message | TeamMessage>(msg: T, ch: ChannelKey): Promise<ChannelMessage> {
    const base = { ...msg, _channel: ch } as ChannelMessage
    if (msg.user?.name || msg.user?.email) {
      const meta = { name: msg.user.name?.trim() ?? null, email: msg.user.email?.trim() ?? null }
      userCache.current.set(msg.user_id, meta)
      return { ...base, user: meta }
    }
    if (msg.user_id === currentUser.id) {
      const meta = { name: currentUser.name?.trim() ?? null, email: currentUser.email?.trim() ?? null }
      userCache.current.set(msg.user_id, meta)
      return { ...base, user: meta }
    }
    const cached = userCache.current.get(msg.user_id)
    if (cached) return { ...base, user: cached }

    const { data } = await supabase.from("users").select("name, email").eq("id", msg.user_id).maybeSingle()
    if (data) {
      const meta = { name: data.name?.trim() ?? null, email: data.email?.trim() ?? null }
      userCache.current.set(msg.user_id, meta)
      return { ...base, user: meta }
    }
    return base
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

    let sendError: { message: string } | null = null
    if (channel === "global") {
      const { error: e } = await supabase.from("messages").insert({ user_id: currentUser.id, content: trimmed })
      sendError = e
    } else {
      const { error: e } = await supabase
        .from("team_messages")
        .insert({ user_id: currentUser.id, team_id: currentUser.team_id, content: trimmed })
      sendError = e
    }

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
  const totalUnread = unreadByChannel.team + unreadByChannel.global

  if (!isOpen) {
    return (
      <Button
        onClick={() => {
          setIsOpen(true)
          setUnreadByChannel((u) => ({ ...u, [channel]: 0 }))
        }}
        className="relative shadow-lg"
        size="sm"
      >
        <MessageCircle className="mr-2 h-4 w-4" />
        Chat
        {totalUnread > 0 && (
          <span className="ml-2 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-destructive px-1 text-xs font-semibold leading-none text-destructive-foreground shadow-sm">
            {totalUnread}
          </span>
        )}
      </Button>
    )
  }

  const teamColor = currentUser.team?.color ?? "#3b82f6"
  const messages = messagesByChannel[channel]

  return (
    <Card className="flex max-h-[calc(100vh-6rem)] sm:max-h-[70vh] lg:max-h-[75vh] w-full flex-col overflow-hidden border border-white/60 bg-white/80 shadow-[0_32px_80px_-48px_rgba(58,76,130,0.55)] supports-[backdrop-filter]:backdrop-blur-2xl dark:border-white/10 dark:bg-white/5">
      <CardHeader className="border-b border-white/50 pb-4 sm:pb-6 dark:border-white/10">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-[1.35rem] font-semibold">
            Chat
            <Badge variant="outline" className="rounded-full border-primary/40 bg-primary/15 px-3 py-1 text-xs font-medium text-primary shadow-sm">
              Live
            </Badge>
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-2 flex gap-1 rounded-full bg-muted/40 p-1 text-sm">
          {(["team", "global"] as ChannelKey[]).map((key) => {
            const active = channel === key
            const label = key === "team" ? `Team ${currentUser.team?.name ?? ""}`.trim() : "Global"
            const unread = unreadByChannel[key]
            return (
              <button
                key={key}
                type="button"
                onClick={() => setChannel(key)}
                className={cn(
                  "flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition",
                  active ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
                style={active && key === "team" ? { color: teamColor } : undefined}
              >
                {label}
                {unread > 0 && (
                  <span className="ml-2 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-destructive px-1 text-xs font-semibold leading-none text-destructive-foreground">
                    {unread}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <p className="text-sm text-muted-foreground">
          {channel === "team"
            ? "Only your team can see these messages."
            : "Everyone in the company can see these messages. Keep it Friday-friendly!"}
        </p>
      </CardHeader>
      <CardContent className="flex flex-1 min-h-0 flex-col gap-4">
        <div
          ref={listRef}
          className="flex-1 space-y-3 overflow-y-auto rounded-[1.5rem] border border-white/50 bg-white/70 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.3)] backdrop-blur-xl dark:border-white/10 dark:bg-white/10"
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
              <div key={msg.id} className={cn("flex", isSelf ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[80%] rounded-[1.75rem] px-4 py-3 text-sm shadow-sm transition",
                    isSelf
                      ? "bg-primary text-primary-foreground shadow-[0_16px_34px_-20px_rgba(126,150,255,0.7)]"
                      : "border border-white/60 bg-white/90 text-foreground shadow-[0_16px_34px_-20px_rgba(58,76,130,0.35)] dark:border-white/10 dark:bg-white/10",
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

        <form ref={formRef} onSubmit={handleSend} className="space-y-2">
          <Textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                if (event.nativeEvent.isComposing) return
                if (isSubmitDisabled) return
                event.preventDefault()
                formRef.current?.requestSubmit()
              }
            }}
            placeholder={
              channel === "team"
                ? `Message ${currentUser.team?.name ?? "your team"}...`
                : "Share with everyone at the company..."
            }
            rows={2}
            maxLength={MAX_MESSAGE_LENGTH}
          />
          <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              {trimmedLength}/{MAX_MESSAGE_LENGTH}
            </span>
            {error && <span className="text-destructive">{error}</span>}
            <Button type="submit" size="sm" className="rounded-full px-6" disabled={isSubmitDisabled}>
              {isSending ? "Sending..." : "Send"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
