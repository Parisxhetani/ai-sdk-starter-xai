'use server'

import { getSupabaseServerClient } from '@/lib/supabaseServer'

export interface FridayRecipient {
  name: string | null
  email: string
  active: boolean
}

export interface FridayRecipientPayload {
  fridayDate: string
  recipients: FridayRecipient[]
}

const DEFAULT_DAY_OF_WEEK = 5

function parseDayOfWeek(value: string | null | undefined): number {
  const parsed = Number(value)
  if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 6) {
    return parsed
  }
  return DEFAULT_DAY_OF_WEEK
}

function nextDateStringForDay(dayOfWeek: number): string {
  const now = new Date()
  const day = now.getDay()
  const add = (dayOfWeek - day + 7) % 7
  const target = new Date(now)
  target.setDate(now.getDate() + add)
  target.setHours(0, 0, 0, 0)
  return target.toISOString().split('T')[0]!
}

async function resolveTargetFridayDate(): Promise<string> {
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase.from('settings').select('value').eq('key', 'ordering_day_of_week').maybeSingle()
  if (error) {
    console.warn('Unable to read ordering day setting, defaulting to Friday:', error.message)
    return nextDateStringForDay(DEFAULT_DAY_OF_WEEK)
  }
  const dayOfWeek = parseDayOfWeek((data?.value as string | null | undefined) ?? undefined)
  return nextDateStringForDay(dayOfWeek)
}

export async function getActiveFridayRecipients(): Promise<FridayRecipientPayload> {
  const supabase = await getSupabaseServerClient()
  const fridayDate = await resolveTargetFridayDate()

  const [usersResult, ordersResult] = await Promise.all([
    supabase.from('users').select('id, name, email, whitelisted').eq('whitelisted', true),
    supabase.from('orders').select('user_id').eq('friday_date', fridayDate),
  ])

  if (usersResult.error) {
    throw new Error(`Failed to load users: ${usersResult.error.message}`)
  }
  if (ordersResult.error) {
    throw new Error(`Failed to load existing orders: ${ordersResult.error.message}`)
  }

  const orderedUserIds = new Set((ordersResult.data ?? []).map((order) => order.user_id))

  const recipients: FridayRecipient[] =
    usersResult.data
      ?.filter((user) => Boolean(user.email))
      .filter((user) => !orderedUserIds.has(user.id))
      .map((user) => ({
        name: user.name ?? null,
        email: user.email as string,
        active: true,
      })) ?? []

  return {
    fridayDate,
    recipients,
  }
}
