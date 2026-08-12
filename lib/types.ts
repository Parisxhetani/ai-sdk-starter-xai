import type { CoffeeChoice } from "@/lib/coffee"

export type TeamSlug = "CORE" | "BLUE" | "PURPLE" | "PINK" | "ORANGE" | "GREEN" | (string & {})

export interface Vendor {
  id: string
  slug: string
  name: string
  icon: string
  color: string
  active: boolean
  created_at: string
  updated_at: string
}

export interface TeamVendorOverride {
  team_id: string
  friday_date: string
  vendor_id: string
  created_at: string
}

export interface Team {
  id: string
  slug: TeamSlug
  name: string
  color: string
  active: boolean
  ordering_day_of_week: number
  vendor_phone: string | null
  default_vendor_id: string | null
  created_at: string
  updated_at: string
}

export interface User {
  id: string
  email: string
  name: string
  role: "admin" | "member"
  phone?: string
  whitelisted: boolean
  team_id: string
  team?: Pick<Team, "id" | "slug" | "name" | "color"> | null
  is_team_admin?: boolean
  team_admin_for?: string | null
  created_at: string
  updated_at: string
}

export interface MenuItem {
  id: string
  item: string
  variant: string
  price_all?: number | null
  active: boolean
  vendor_id: string
  created_at: string
}

export interface Order {
  id: string
  user_id: string
  team_id: string
  friday_date: string
  item: string
  variant: string
  notes?: string
  cash_available_all: number
  /** After-lunch drink. null/undefined = still deciding, "none" = not joining. */
  coffee_choice?: CoffeeChoice | null
  /** Free-text drink, only set when coffee_choice === "other". */
  coffee_note?: string | null
  locked: boolean
  created_at: string
  updated_at: string
  user?: {
    name: string | null
    email: string | null
    phone?: string | null
    team_id?: string | null
  }
}

export interface Event {
  id: string
  type: string
  user_id?: string
  payload?: any
  created_at: string
}

export interface Settings {
  key: string
  value: string
  updated_at: string
}

export interface Message {
  id: string
  user_id: string
  content: string
  created_at: string
  user?: {
    name: string | null
    email: string | null
  }
}

export interface TeamMessage {
  id: string
  team_id: string
  user_id: string
  content: string
  created_at: string
  user?: {
    name: string | null
    email: string | null
  }
}

export interface OrderSummary {
  item: string
  variant: string
  count: number
}
