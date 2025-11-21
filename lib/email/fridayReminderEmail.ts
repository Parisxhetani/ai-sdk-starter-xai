'use server'

import { Resend } from 'resend'

import { loadFridayReminderConfig } from '@/lib/fridayReminderConfig'

const config = loadFridayReminderConfig()
const resend = new Resend(config.resendApiKey)

export interface FridayEmailResult {
  success: boolean
  error?: string
}

export async function sendFridayReminderEmail(to: string, name?: string | null): Promise<FridayEmailResult> {
  try {
    const greetingName = name && name.trim().length > 0 ? name.trim() : 'there'

    const textBody =
      `Hi ${greetingName},\n\n` +
      `Reminder: please place your Friday order.\n\n` +
      `Open the app here:\n` +
      `${config.appBaseUrl}\n\n` +
      `Schedule: ${config.cronDescription}.\n\n` +
      `–\n` +
      `FZ Friday Orders\n`

    const response = await resend.emails.send({
      from: config.reminderFromEmail,
      to,
      subject: 'FZ Friday order reminder',
      text: textBody,
    })

    if (response.error) {
      return { success: false, error: String(response.error) }
    }

    return { success: true }
  } catch (err: unknown) {
    console.error('sendFridayReminderEmail error:', err)
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function sendZeroRecipientFallbackEmail(to: string): Promise<FridayEmailResult> {
  try {
    const textBody =
      'Hi there,\n\n' +
      'Automated Friday reminder run detected zero active recipients.\n' +
      'Please check the teammate list or ordering window configuration.\n\n' +
      `Run timestamp: ${new Date().toISOString()}\n`

    const response = await resend.emails.send({
      from: config.reminderFromEmail,
      to,
      subject: 'Friday reminder run – no active recipients',
      text: textBody,
    })

    if (response.error) {
      return { success: false, error: String(response.error) }
    }

    return { success: true }
  } catch (error: unknown) {
    console.error('sendZeroRecipientFallbackEmail error:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}
