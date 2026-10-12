// Gmail API through the dashboard's own OAuth connection (the mailbox the inbox already reads),
// sending as CAMPAIGN_SENDER_EMAIL. Google honours that From only when the address is a verified
// "Send mail as" alias of the connected mailbox; otherwise it rewrites the From to the mailbox.
// Sent mail lands in the Sent folder and replies thread into the inbox like any other email.
import 'server-only'

const TOKEN_URL = process.env.GMAIL_TOKEN_URL || 'https://oauth2.googleapis.com/token'
const API = process.env.GMAIL_API_BASE || 'https://gmail.googleapis.com/gmail/v1/users/me'

export class GmailError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

let cached: { token: string; exp: number } | null = null

async function accessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) throw new GmailError('Gmail not connected', 0)
  const res = await fetch(TOKEN_URL, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: GMAIL_CLIENT_ID, client_secret: GMAIL_CLIENT_SECRET, refresh_token: GMAIL_REFRESH_TOKEN, grant_type: 'refresh_token' }),
    signal: AbortSignal.timeout(15_000),
  })
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string }
  if (!res.ok || !json.access_token) throw new GmailError(`gmail token: ${json.error ?? res.status}`, res.status)
  cached = { token: json.access_token, exp: Date.now() + (json.expires_in ?? 3600) * 1000 }
  return json.access_token
}

/** Is the sender a verified "Send mail as" alias of the connected mailbox? Null = cannot tell. */
export async function senderAliasState(sender: string): Promise<{ mailbox: string | null; verified: boolean } | null> {
  try {
    const token = await accessToken()
    const res = await fetch(`${API}/settings/sendAs`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return null
    const json = (await res.json()) as { sendAs?: { sendAsEmail: string; isDefault?: boolean; verificationStatus?: string; isPrimary?: boolean }[] }
    const list = json.sendAs ?? []
    const primary = list.find(s => s.isPrimary)?.sendAsEmail ?? null
    const alias = list.find(s => s.sendAsEmail.toLowerCase() === sender.toLowerCase())
    return { mailbox: primary, verified: Boolean(alias && (alias.isPrimary || alias.verificationStatus === 'accepted')) }
  } catch { return null }
}

export async function sendRaw(raw: string, threadId?: string | null): Promise<{ id: string; threadId: string }> {
  const token = await accessToken()
  const res = await fetch(`${API}/messages/send`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) }), signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new GmailError(`gmail send ${res.status}: ${(await res.text()).slice(0, 200)}`, res.status)
  return (await res.json()) as { id: string; threadId: string }
}

/** From headers of every message in a thread, oldest first. Null when the mailbox cannot be read. */
export async function threadFroms(threadId: string): Promise<string[] | null> {
  let token: string
  try { token = await accessToken() } catch { return null }
  const res = await fetch(`${API}/threads/${encodeURIComponent(threadId)}?format=metadata&metadataHeaders=From`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) })
  if (res.status === 404) return []
  if (res.status === 403) return null
  if (!res.ok) throw new GmailError(`gmail thread ${res.status}`, res.status)
  const json = (await res.json()) as { messages?: { payload?: { headers?: { name: string; value: string }[] } }[] }
  return (json.messages ?? []).map(m => m.payload?.headers?.find(h => h.name.toLowerCase() === 'from')?.value ?? '')
}
