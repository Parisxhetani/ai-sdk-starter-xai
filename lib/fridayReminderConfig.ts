/**
 * All environment variable keys required for Friday reminder automation.
 */
export const FRIDAY_REMINDER_ENV_VARS = [
  'FRIDAY_APP_BASE_URL',
  'FRIDAY_CRON_DESCRIPTION',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'RESEND_API_KEY',
  'REMINDER_FROM_EMAIL',
  'REMINDER_TO_FALLBACK',
] as const

type FridayReminderEnvKey = (typeof FRIDAY_REMINDER_ENV_VARS)[number]

export interface FridayReminderConfig {
  /** Base URL for the Friday orders UI, used in reminder emails */
  appBaseUrl: string
  /** Human readable description of when the cron fires */
  cronDescription: string
  /** Supabase project URL */
  supabaseUrl: string
  /** Supabase service role key (server only) */
  supabaseServiceRoleKey: string
  /** Resend API key used to dispatch emails */
  resendApiKey: string
  /** Email identity that appears in the From header */
  reminderFromEmail: string
  /** Optional fallback recipient when no teammates are active */
  reminderToFallback?: string
}

function requireEnv(key: FridayReminderEnvKey, fallback?: string): string {
  const value = process.env[key]?.trim()
  if (value) {
    return value
  }
  if (typeof fallback === 'string') {
    return fallback
  }
  throw new Error(`Missing required environment variable: ${key}`)
}

export function loadFridayReminderConfig(): FridayReminderConfig {
  const appBaseUrl = process.env.FRIDAY_APP_BASE_URL?.trim() || 'https://fridayorders.vercel.app'
  const cronDescription = process.env.FRIDAY_CRON_DESCRIPTION?.trim() || 'Every Friday at 10:00 UTC via Vercel cron'

  const supabaseUrl = requireEnv('SUPABASE_URL')
  const supabaseServiceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  const resendApiKey = requireEnv('RESEND_API_KEY')
  const reminderFromEmail = requireEnv('REMINDER_FROM_EMAIL')
  const reminderToFallback = process.env.REMINDER_TO_FALLBACK?.trim() || undefined

  return {
    appBaseUrl,
    cronDescription,
    supabaseUrl,
    supabaseServiceRoleKey,
    resendApiKey,
    reminderFromEmail,
    reminderToFallback,
  }
}
