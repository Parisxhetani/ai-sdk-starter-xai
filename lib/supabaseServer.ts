'use server'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { loadFridayReminderConfig } from '@/lib/fridayReminderConfig'

let supabaseServerClient: SupabaseClient | null = null

export async function getSupabaseServerClient(): Promise<SupabaseClient> {
  if (!supabaseServerClient) {
    const config = loadFridayReminderConfig()
    supabaseServerClient = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false },
    })
  }
  return supabaseServerClient
}
