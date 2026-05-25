"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { UtensilsCrossed } from "lucide-react"
import type { Team, Vendor } from "@/lib/types"

interface VendorPickerProps {
  team: Team | null
  fridayDate: string | null
  vendors: Vendor[]
  onChange: () => void
}

export function VendorPicker({ team, fridayDate, vendors, onChange }: VendorPickerProps) {
  const [overrideVendorId, setOverrideVendorId] = useState<string | null>(null)
  const [defaultVendorId, setDefaultVendorId] = useState<string | null>(team?.default_vendor_id ?? null)
  const [pendingOverride, setPendingOverride] = useState<string>("")
  const [busy, setBusy] = useState(false)

  // Reset local state whenever the team or fridayDate changes
  useEffect(() => {
    setDefaultVendorId(team?.default_vendor_id ?? null)
  }, [team?.id, team?.default_vendor_id])

  useEffect(() => {
    if (!team?.id || !fridayDate) {
      setOverrideVendorId(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/teams/vendor-override?teamId=${team.id}`, {
          cache: "no-store",
          credentials: "include",
        })
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        const match = (data.overrides ?? []).find(
          (o: { friday_date: string; vendor_id: string }) => o.friday_date === fridayDate,
        )
        setOverrideVendorId(match?.vendor_id ?? null)
        setPendingOverride(match?.vendor_id ?? "")
      } catch (e) {
        console.error("Failed to load vendor overrides:", e)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [team?.id, fridayDate])

  const activeVendorId = overrideVendorId ?? defaultVendorId
  const activeVendor = useMemo(() => vendors.find((v) => v.id === activeVendorId) ?? null, [vendors, activeVendorId])
  const defaultVendor = useMemo(() => vendors.find((v) => v.id === defaultVendorId) ?? null, [vendors, defaultVendorId])

  if (!team) return null

  const saveDefault = async (vendorId: string) => {
    setBusy(true)
    try {
      const res = await fetch("/api/teams", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: team.id, updates: { default_vendor_id: vendorId } }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to save default vendor")
      toast.success("Default vendor saved")
      setDefaultVendorId(vendorId)
      onChange()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save default vendor")
    } finally {
      setBusy(false)
    }
  }

  const saveOverride = async () => {
    if (!fridayDate || !pendingOverride) return
    setBusy(true)
    try {
      const res = await fetch("/api/teams/vendor-override", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ teamId: team.id, fridayDate, vendorId: pendingOverride }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to save override")
      toast.success(`Override set for ${fridayDate}`)
      setOverrideVendorId(pendingOverride)
      onChange()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save override")
    } finally {
      setBusy(false)
    }
  }

  const clearOverride = async () => {
    if (!fridayDate) return
    setBusy(true)
    try {
      const res = await fetch(
        `/api/teams/vendor-override?teamId=${team.id}&fridayDate=${fridayDate}`,
        { method: "DELETE", credentials: "include" },
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to clear override")
      toast.success("Override cleared")
      setOverrideVendorId(null)
      setPendingOverride("")
      onChange()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to clear override")
    } finally {
      setBusy(false)
    }
  }

  const activeVendors = vendors.filter((v) => v.active)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UtensilsCrossed className="h-5 w-5" />
          Today's Vendor
          {activeVendor && (
            <Badge
              variant="outline"
              style={{
                backgroundColor: `${activeVendor.color}1f`,
                borderColor: `${activeVendor.color}66`,
                color: activeVendor.color,
              }}
            >
              <span className="mr-1">{activeVendor.icon}</span>
              {activeVendor.name}
            </Badge>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Pick which food chain {team.name} is ordering from. Override applies to {fridayDate ?? "the next Friday"}; otherwise the team default is used.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">Team default</p>
          <div className="flex flex-wrap gap-2">
            {activeVendors.map((v) => {
              const selected = v.id === defaultVendorId
              return (
                <button
                  key={v.id}
                  type="button"
                  disabled={busy}
                  onClick={() => saveDefault(v.id)}
                  className="rounded-full border px-3 py-1 text-sm font-medium transition-all disabled:opacity-50"
                  style={{
                    backgroundColor: selected ? v.color : "transparent",
                    borderColor: v.color,
                    color: selected ? "#fff" : v.color,
                  }}
                >
                  <span className="mr-1">{v.icon}</span>
                  {v.name}
                </button>
              )
            })}
          </div>
          {defaultVendor && (
            <p className="text-xs text-muted-foreground">Default: {defaultVendor.icon} {defaultVendor.name}</p>
          )}
        </div>

        <div className="space-y-2 rounded-lg border border-dashed border-border/60 p-3">
          <p className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">
            Override for {fridayDate ?? "—"}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={pendingOverride} onValueChange={setPendingOverride} disabled={!fridayDate || busy}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Pick override vendor" />
              </SelectTrigger>
              <SelectContent>
                {activeVendors.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.icon} {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={saveOverride}
              disabled={!fridayDate || !pendingOverride || busy || pendingOverride === overrideVendorId}
            >
              Set Override
            </Button>
            {overrideVendorId && (
              <Button size="sm" variant="ghost" onClick={clearOverride} disabled={busy}>
                Clear override
              </Button>
            )}
          </div>
          {!overrideVendorId && (
            <p className="text-xs text-muted-foreground">No override — falls back to the team default.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
