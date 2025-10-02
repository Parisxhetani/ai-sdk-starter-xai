export interface User {
  id: string
  email: string
  name: string
  role: "admin" | "member"
  phone?: string
  whitelisted: boolean
  created_at: string
  updated_at: string
}

export interface MenuItem {
  id: string
  item: string
  variant: string
  active: boolean
  created_at: string
}

export interface Order {
  id: string
  user_id: string
  friday_date: string
  item: string
  variant: string
  notes?: string
  locked: boolean
  created_at: string
  updated_at: string
  user?: {
    name: string
    email: string
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
    name: string
    email: string
  }
}
export interface OrderSummary {
  item: string
  variant: string
  count: number
}

