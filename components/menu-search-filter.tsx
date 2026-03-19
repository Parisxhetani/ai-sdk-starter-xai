"use client"

import { useState, useMemo, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Search, X, Filter } from "lucide-react"
import { cn } from "@/lib/utils"
import type { MenuItem } from "@/lib/types"

interface MenuSearchFilterProps {
  menuItems: MenuItem[]
  onFilterChange: (filtered: MenuItem[]) => void
  className?: string
}

export function MenuSearchFilter({ menuItems, onFilterChange, className }: MenuSearchFilterProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [activeFilter, setActiveFilter] = useState<string | null>(null)

  const uniqueItems = useMemo(() => {
    return Array.from(new Set(menuItems.map((item) => item.item)))
  }, [menuItems])

  const filters = useMemo(() => {
    const allVariants = menuItems.map((item) => item.variant.toLowerCase())
    const hasVegetarian = allVariants.some((v) => v.includes("vegetarian") || v.includes("veggie"))
    const hasVegan = allVariants.some((v) => v.includes("vegan"))
    const hasChicken = allVariants.some((v) => v.includes("chicken"))
    const hasFish = allVariants.some((v) => v.includes("fish") || v.includes("salmon") || v.includes("tuna"))
    
    const result = []
    if (hasVegetarian) result.push({ id: "vegetarian", label: "🥬 Vegetarian" })
    if (hasVegan) result.push({ id: "vegan", label: "🌱 Vegan" })
    if (hasChicken) result.push({ id: "chicken", label: "🍗 Chicken" })
    if (hasFish) result.push({ id: "fish", label: "🐟 Fish" })
    return result
  }, [menuItems])

  const filteredItems = useMemo(() => {
    let filtered = menuItems

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (item) =>
          item.item.toLowerCase().includes(query) ||
          item.variant.toLowerCase().includes(query)
      )
    }

    if (activeFilter) {
      filtered = filtered.filter((item) => {
        const variant = item.variant.toLowerCase()
        switch (activeFilter) {
          case "vegetarian":
            return variant.includes("vegetarian") || variant.includes("veggie") || !variant.includes("chicken") && !variant.includes("fish") && !variant.includes("meat")
          case "vegan":
            return variant.includes("vegan")
          case "chicken":
            return variant.includes("chicken")
          case "fish":
            return variant.includes("fish") || variant.includes("salmon") || variant.includes("tuna")
          default:
            return true
        }
      })
    }

    return filtered
  }, [menuItems, searchQuery, activeFilter])

  useEffect(() => {
    onFilterChange(filteredItems)
  }, [filteredItems, onFilterChange])

  const clearFilters = () => {
    setSearchQuery("")
    setActiveFilter(null)
  }

  const hasActiveFilters = searchQuery || activeFilter

  return (
    <div className={cn("space-y-3", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search menu items..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 pr-9"
          aria-label="Search menu items"
        />
        {searchQuery && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
            onClick={() => setSearchQuery("")}
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {filters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Filter className="h-4 w-4" />
            <span>Filters:</span>
          </div>
          {filters.map((filter) => (
            <Badge
              key={filter.id}
              variant={activeFilter === filter.id ? "default" : "outline"}
              className={cn(
                "cursor-pointer transition-colors",
                activeFilter === filter.id
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              )}
              onClick={() => setActiveFilter(activeFilter === filter.id ? null : filter.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  setActiveFilter(activeFilter === filter.id ? null : filter.id)
                }
              }}
              aria-pressed={activeFilter === filter.id}
            >
              {filter.label}
            </Badge>
          ))}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-6 px-2 text-xs"
            >
              Clear all
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
