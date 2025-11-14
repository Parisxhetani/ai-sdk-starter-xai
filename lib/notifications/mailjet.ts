const MAILJET_API_URL = "https://api.mailjet.com/v3.1/send"

export interface ReminderEmailPayload {
  recipients: string[]
  subject: string
  message: string
  fromEmail?: string
}

function getMailjetAuthHeader() {
  const apiKey = process.env.MAILJET_API_KEY
  const apiSecret = process.env.MAILJET_SECRET_KEY

  if (!apiKey || !apiSecret) {
    throw new Error("Mailjet is not configured. Please set MAILJET_API_KEY and MAILJET_SECRET_KEY.")
  }

  const token = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")
  return `Basic ${token}`
}

export async function sendReminderEmail({ recipients, subject, message, fromEmail }: ReminderEmailPayload) {
  if (!recipients.length) {
    throw new Error("Cannot send reminder email without recipients.")
  }

  const from = fromEmail || process.env.ORDER_REMINDER_FROM_EMAIL

  if (!from) {
    throw new Error("ORDER_REMINDER_FROM_EMAIL is not defined.")
  }

  const parsedFrom = /^(.*)<([^>]+)>$/.exec(from)
  const fromEmailAddress = parsedFrom ? parsedFrom[2].trim() : from
  const fromName = parsedFrom ? parsedFrom[1].trim().replace(/^"|"$/g, "") : undefined

  const fromPayload: { Email: string; Name?: string } = { Email: fromEmailAddress }
  if (fromName) {
    fromPayload.Name = fromName
  }

  const response = await fetch(MAILJET_API_URL, {
    method: "POST",
    headers: {
      Authorization: getMailjetAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      Messages: [
        {
          From: fromPayload,
          To: recipients.map((email) => ({ Email: email })),
          Subject: subject,
          TextPart: message,
        },
      ],
    }),
  })

  if (!response.ok) {
    const details = await response.text()
    throw new Error(`Mailjet request failed: ${response.status} ${details}`)
  }
}
