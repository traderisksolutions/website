// Minimal Gmail-send helper for internal notifications (e.g. "new inbound lead" alerts).
// The outbound campaign cron (api/cron/outbound-send) has its own copy of this logic tuned
// for threaded, multi-step sequence sends — deliberately left untouched rather than merged
// into this file, since it's a live money-adjacent send path and not worth the regression
// risk for a pure DRY refactor. This helper is for simple, single, unthreaded notifications.

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

export async function getGmailToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      client_id:     process.env.GMAIL_CLIENT_ID!,
      client_secret: process.env.GMAIL_CLIENT_SECRET!,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN!,
      grant_type:    'refresh_token',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error('Failed to get Gmail access token')
  return data.access_token as string
}

function encodeSubject(subject: string): string {
  if (!/[^\x20-\x7E]/.test(subject)) return subject
  return `=?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`
}

function buildRfc2822(from: string, to: string, subject: string, htmlBody: string): string {
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    '',
    htmlBody,
  ].join('\r\n')
}

export async function sendGmailNotification(params: {
  from: string; to: string; subject: string; htmlBody: string
}): Promise<void> {
  const token = await getGmailToken()
  const raw   = Buffer.from(buildRfc2822(params.from, params.to, params.subject, params.htmlBody)).toString('base64url')
  const res   = await fetch(`${GMAIL_API}/messages/send`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ raw }),
  })
  if (!res.ok) throw new Error(`Gmail notification send failed (${res.status}): ${await res.text()}`)
}
