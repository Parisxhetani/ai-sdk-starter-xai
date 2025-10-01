"use client"

import { useMemo } from "react"
import {
  ResponsiveContainer,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Order } from "@/lib/types"

interface AdminOrderInsightsProps {
  orders: Order[]
}

interface ChartDatum {
  label: string
  value: number
}

const chartPalette = [
  "var(--button-bg)",
  "var(--theme-blue-strong)",
  "var(--theme-green)",
  "var(--field-border)",
  "var(--button-outline)",
]

export function AdminOrderInsights({ orders }: AdminOrderInsightsProps) {
  const { itemData, userData } = useMemo(() => {
    const itemMap = new Map<string, number>()
    const userMap = new Map<string, number>()

    orders.forEach((order) => {
      const label = `${order.item} – ${order.variant}`
      itemMap.set(label, (itemMap.get(label) ?? 0) + 1)

      const userLabel = order.user?.name || order.user_id
      userMap.set(userLabel, (userMap.get(userLabel) ?? 0) + 1)
    })

    const itemData: ChartDatum[] = Array.from(itemMap.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6)

    const userData: ChartDatum[] = Array.from(userMap.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)

    return { itemData, userData }
  }, [orders])

  if (orders.length === 0) {
    return null
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="bg-background/70">
        <CardHeader>
          <CardTitle>Top Ordered Items</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={itemData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fill: "var(--field-text)" }} tickLine={false} angle={-15} textAnchor="end" height={60} interval={0} />
              <YAxis allowDecimals={false} tick={{ fill: "var(--field-text)" }} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
              <RechartsTooltip
                cursor={{ fill: "var(--field-bg-hover)" }}
                contentStyle={{
                  backgroundColor: "var(--background)",
                  borderRadius: "0.75rem",
                  border: `1px solid var(--border)`,
                  color: "var(--field-text)",
                }}
              />
              <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                {itemData.map((_, index) => (
                  <Cell key={`cell-item-${index}`} fill={chartPalette[index % chartPalette.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="bg-background/70">
        <CardHeader>
          <CardTitle>Top Ordering Teammates</CardTitle>
        </CardHeader>
        <CardContent className="flex h-72 flex-col items-center justify-center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={userData}
                dataKey="value"
                nameKey="label"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={4}
                stroke="var(--background)"
              >
                {userData.map((entry, index) => (
                  <Cell key={`cell-user-${entry.label}`} fill={chartPalette[index % chartPalette.length]} />
                ))}
              </Pie>
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: "var(--background)",
                  borderRadius: "0.75rem",
                  border: `1px solid var(--border)`,
                  color: "var(--field-text)",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-4 flex flex-wrap justify-center gap-3 text-sm">
            {userData.map((entry, index) => (
              <div key={entry.label} className="flex items-center gap-2 rounded-full bg-[var(--field-bg)] px-3 py-1">
                <span
                  className="size-3 rounded-full"
                  style={{ backgroundColor: chartPalette[index % chartPalette.length] }}
                />
                <span className="font-medium text-[color:var(--field-text)]">{entry.label}</span>
                <span className="text-muted-foreground">{entry.value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
