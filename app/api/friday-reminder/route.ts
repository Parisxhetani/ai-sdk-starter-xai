import { NextRequest, NextResponse } from 'next/server'

import { FRIDAY_REMINDER_ENV_VARS, loadFridayReminderConfig } from '@/lib/fridayReminderConfig'
import { getActiveFridayRecipients } from '@/lib/fridayRecipients'
import { sendFridayReminderEmail, sendZeroRecipientFallbackEmail } from '@/lib/email/fridayReminderEmail'

const OPTIONAL_ENV_KEYS = new Set(['FRIDAY_APP_BASE_URL', 'FRIDAY_CRON_DESCRIPTION', 'REMINDER_TO_FALLBACK'])

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get('debug') === '1') {
    return handleDebugMode()
  }

  try {
    const config = loadFridayReminderConfig()
    const { recipients, fridayDate } = await getActiveFridayRecipients()

    if (!recipients.length) {
      if (config.reminderToFallback) {
        await sendZeroRecipientFallbackEmail(config.reminderToFallback)
      }

      return NextResponse.json({
        ok: true,
        total: 0,
        sent: 0,
        failed: 0,
        failedRecipients: [],
        fridayDate,
      })
    }

    const results = await Promise.all(
      recipients.map(async (recipient) => {
        const result = await sendFridayReminderEmail(recipient.email, recipient.name)
        return { email: recipient.email, success: result.success, error: result.error }
      }),
    )

    const failedRecipients = results.filter((entry) => !entry.success).map((entry) => entry.email)

    return NextResponse.json({
      ok: true,
      total: recipients.length,
      sent: results.length - failedRecipients.length,
      failed: failedRecipients.length,
      failedRecipients,
      fridayDate,
    })
  } catch (error) {
    console.error('Friday reminder route failed:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

async function handleDebugMode() {
  const envVars: Record<string, { required: boolean; present: boolean }> = {}
  FRIDAY_REMINDER_ENV_VARS.forEach((key) => {
    envVars[key] = {
      required: !OPTIONAL_ENV_KEYS.has(key),
      present: Boolean(process.env[key]?.trim()),
    }
  })

  let configLoadError: string | null = null
  let recipientsSummary:
    | { activeCount: number; sample: Array<{ email: string; name: string | null }>; fridayDate: string }
    | null = null

  try {
    loadFridayReminderConfig()
  } catch (error) {
    configLoadError = error instanceof Error ? error.message : 'Unknown error'
  }

  if (!configLoadError) {
    try {
      const { recipients, fridayDate } = await getActiveFridayRecipients()
      recipientsSummary = {
        activeCount: recipients.length,
        sample: recipients.slice(0, 5).map((recipient) => ({ email: recipient.email, name: recipient.name })),
        fridayDate,
      }
    } catch (error) {
      configLoadError = error instanceof Error ? error.message : 'Failed to load recipients'
    }
  }

  return NextResponse.json({
    ok: true,
    mode: 'debug',
    envVars,
    configLoadError,
    recipients: recipientsSummary,
    timestamp: new Date().toISOString(),
  })
}
