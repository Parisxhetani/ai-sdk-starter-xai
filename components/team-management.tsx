"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Team, User } from "@/lib/types"
import { Plus, Shield, ShieldOff, ArrowRightLeft } from "lucide-react"

interface TeamManagementProps {
  currentUser: User
  teams: Team[]
  users: User[]
  onChange: () => void
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export function TeamManagement({ currentUser, teams, users, onChange }: TeamManagementProps) {
  const [showCreate, setShowCreate] = useState(false)
  const [newSlug, setNewSlug] = useState("")
  const [newName, setNewName] = useState("")
  const [newColor, setNewColor] = useState("#3b82f6")
  const [busy, setBusy] = useState(false)
  const [moveUserId, setMoveUserId] = useState<string | null>(null)
  const [moveToTeam, setMoveToTeam] = useState<string>("")

  const usersByTeam = useMemo(() => {
    const map = new Map<string, User[]>()
    for (const u of users) {
      const bucket = map.get(u.team_id) ?? []
      bucket.push(u)
      map.set(u.team_id, bucket)
    }
    return map
  }, [users])

  const moveTargetUser = useMemo(
    () => users.find((u) => u.id === moveUserId) ?? null,
    [users, moveUserId],
  )

  const handleCreate = async () => {
    if (!newSlug.trim() || !newName.trim() || !newColor.trim()) {
      toast.error("Slug, name, and color are required")
      return
    }
    setBusy(true)
    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ slug: newSlug.trim().toUpperCase(), name: newName.trim(), color: newColor.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to create team")
      toast.success(`Team ${newName.trim()} created`)
      setShowCreate(false)
      setNewSlug("")
      setNewName("")
      setNewColor("#3b82f6")
      onChange()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create team")
    } finally {
      setBusy(false)
    }
  }

  const handleDeactivate = async (team: Team) => {
    if (!confirm(`Deactivate team "${team.name}"? Members must be moved first.`)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/teams?id=${team.id}`, { method: "DELETE", credentials: "include" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to deactivate team")
      toast.success(`Team ${team.name} deactivated`)
      onChange()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to deactivate team")
    } finally {
      setBusy(false)
    }
  }

  const handlePromote = async (userId: string, teamId: string) => {
    setBusy(true)
    try {
      const res = await fetch("/api/admin/team-admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ user_id: userId, team_id: teamId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to promote")
      toast.success("Promoted to team admin")
      onChange()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to promote")
    } finally {
      setBusy(false)
    }
  }

  const handleDemote = async (userId: string) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/team-admins?userId=${userId}`, {
        method: "DELETE",
        credentials: "include",
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to demote")
      toast.success("Demoted from team admin")
      onChange()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to demote")
    } finally {
      setBusy(false)
    }
  }

  const handleMove = async () => {
    if (!moveUserId || !moveToTeam) return
    setBusy(true)
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId: moveUserId, updates: { team_id: moveToTeam } }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to move user")
      toast.success("User moved")
      setMoveUserId(null)
      setMoveToTeam("")
      onChange()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to move user")
    } finally {
      setBusy(false)
    }
  }

  if (currentUser.role !== "admin") return null

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="flex min-w-0 items-center gap-2">
          <Shield className="h-5 w-5 shrink-0" />
          Teams Management
        </CardTitle>
        <Button size="sm" className="shrink-0" onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" /> New Team
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {teams.map((team) => {
          const members = usersByTeam.get(team.id) ?? []
          return (
            <div
              key={team.id}
              className="rounded-lg border p-3"
              style={{ borderColor: `${team.color}66` }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span
                    className="inline-block h-4 w-4 rounded-full"
                    style={{ backgroundColor: team.color }}
                  />
                  <div>
                    <p className="font-semibold">{team.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {team.slug} · Order day: {WEEKDAYS[team.ordering_day_of_week] ?? "—"} ·{" "}
                      {members.length} member{members.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                {team.slug !== "CORE" && team.active && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeactivate(team)}
                    disabled={busy || members.length > 0}
                  >
                    Deactivate
                  </Button>
                )}
                {!team.active && <Badge variant="outline">Inactive</Badge>}
              </div>
              {members.length > 0 && (
                <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {members.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between rounded-md border bg-background/60 px-2 py-1.5 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{m.name || m.email}</p>
                        <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {m.is_team_admin ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => handleDemote(m.id)}
                            disabled={busy}
                            title="Demote from team admin"
                          >
                            <ShieldOff className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => handlePromote(m.id, team.id)}
                            disabled={busy || m.role === "admin"}
                            title="Promote to team admin"
                          >
                            <Shield className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            setMoveUserId(m.id)
                            setMoveToTeam("")
                          }}
                          disabled={busy}
                          title="Move to another team"
                        >
                          <ArrowRightLeft className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </CardContent>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Team</DialogTitle>
            <DialogDescription>Add a new team. Slug must be UPPERCASE.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Slug</Label>
              <Input value={newSlug} onChange={(e) => setNewSlug(e.target.value.toUpperCase())} placeholder="e.g. YELLOW" />
            </div>
            <div className="space-y-1">
              <Label>Display name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Yellow" />
            </div>
            <div className="space-y-1">
              <Label>Color</Label>
              <div className="flex items-center gap-2">
                <Input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="h-10 w-16 p-1" />
                <Input value={newColor} onChange={(e) => setNewColor(e.target.value)} placeholder="#3b82f6" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={busy}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(moveUserId)} onOpenChange={(o) => { if (!o) { setMoveUserId(null); setMoveToTeam("") } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move user to another team</DialogTitle>
            <DialogDescription>
              {moveTargetUser ? `Move ${moveTargetUser.name || moveTargetUser.email} to:` : ""}
            </DialogDescription>
          </DialogHeader>
          <Select value={moveToTeam} onValueChange={setMoveToTeam}>
            <SelectTrigger>
              <SelectValue placeholder="Pick destination team" />
            </SelectTrigger>
            <SelectContent>
              {teams
                .filter((t) => t.active && t.id !== moveTargetUser?.team_id)
                .map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setMoveUserId(null); setMoveToTeam("") }}>Cancel</Button>
            <Button onClick={handleMove} disabled={busy || !moveToTeam}>Move</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
