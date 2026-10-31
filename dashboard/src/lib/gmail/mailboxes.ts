/**
 * Personal Gmail mailboxes (Nathan, Ernest…) the dashboard reads, read-only, after the person
 * connected it once at /connect/gmail. Operations@ keeps its own token in env; these sit in
 * gmail_mailboxes with the refresh token encrypted (AES-256-GCM, key from AUTH_SECRET).
 *
 * The consent goes through the sign-in OAuth client (GOOGLE_OAUTH_CLIENT_ID), which is internal
 * to the trade-risksol.com Workspace, so only TRS accounts can connect and Google needs no review.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { sb, sbTry, enc } from '@/lib/crm/db'

export const GMAIL_READ_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'
export const OPERATIONS_MAILBOX = 'operations@trade-risksol.com'

export type Mailbox = { email: string; refresh_token_enc: string; status: string; history_id: string | null; watch_expiration: string | null; connected_at: string; last_ingest_at: string | null; last_error: string | null }

function key(): Buffer {
  const secret = process.env.AUTH_SECRET ?? ''
  if (!secret) throw new Error('AUTH_SECRET is not set')
  return createHash('sha256').update(`gmail-mailbox:${secret}`).digest()
}
export function seal(plain: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key(), iv)
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return [iv, c.getAuthTag(), body].map(b => b.toString('base64url')).join('.')
}
export function unseal(sealed: string): string {
  const [iv, tag, body] = sealed.split('.').map(s => Buffer.from(s, 'base64url'))
  const d = createDecipheriv('aes-256-gcm', key(), iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(body), d.final()]).toString('utf8')
}

export async function listMailboxes(): Promise<Mailbox[]> {
  return sbTry<Mailbox[]>('gmail_mailboxes?status=eq.active&select=*&order=email', [])
}
export async function getMailbox(email: string): Promise<Mailbox | null> {
  return (await sbTry<Mailbox[]>(`gmail_mailboxes?email=eq.${enc(email.toLowerCase())}&select=*&limit=1`, []))[0] ?? null
}
export async function patchMailbox(email: string, row: Partial<Mailbox>): Promise<void> {
  await sbTry(`gmail_mailboxes?email=eq.${enc(email.toLowerCase())}`, null, { method: 'PATCH', body: JSON.stringify({ ...row, updated_at: new Date().toISOString() }) })
}
export async function saveMailbox(email: string, refreshToken: string): Promise<void> {
  await sb('gmail_mailboxes?on_conflict=email', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ email: email.toLowerCase(), refresh_token_enc: seal(refreshToken), status: 'active', last_error: null, connected_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  })
}

/** An access token for the mailbox; a revoked consent marks the row so it stops being read. */
export async function accessTokenFor(m: Mailbox): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '', client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '', refresh_token: unseal(m.refresh_token_enc), grant_type: 'refresh_token' }),
  })
  const j = await res.json().catch(() => ({})) as { access_token?: string; error?: string }
  if (!j.access_token) {
    await patchMailbox(m.email, { status: j.error === 'invalid_grant' ? 'revoked' : 'error', last_error: `token: ${j.error ?? res.status}` })
    throw new Error(`Gmail token for ${m.email}: ${j.error ?? res.status}`)
  }
  return j.access_token
}

/** Push notifications for the mailbox's inbox and sent mail to the ingest topic. Lasts 7 days; renewed daily. */
export async function watchMailbox(m: Mailbox, token?: string): Promise<void> {
  const t = token ?? await accessTokenFor(m)
  const res = await fetch(`${GMAIL_API}/watch`, {
    method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ topicName: process.env.GMAIL_PUBSUB_TOPIC, labelIds: ['INBOX', 'SENT'], labelFilterBehavior: 'include' }),
  })
  const j = await res.json().catch(() => ({})) as { historyId?: string; expiration?: string; error?: { message?: string } }
  if (!res.ok || !j.historyId) { await patchMailbox(m.email, { last_error: `watch: ${j.error?.message ?? res.status}` }); throw new Error(`watch ${m.email}: ${j.error?.message ?? res.status}`) }
  await patchMailbox(m.email, { history_id: m.history_id ?? j.historyId, watch_expiration: new Date(Number(j.expiration)).toISOString(), last_error: null })
}

/** Message ids added to the inbox or sent mail since the stored history id. Null = history too old; re-list instead. */
export async function newMessageIds(m: Mailbox, token: string): Promise<string[] | null> {
  if (!m.history_id) return null
  const ids = new Set<string>()
  let page: string | undefined
  do {
    const res = await fetch(`${GMAIL_API}/history?startHistoryId=${m.history_id}&historyTypes=messageAdded${page ? `&pageToken=${page}` : ''}`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`history ${m.email}: ${res.status}`)
    const j = await res.json() as { history?: { messagesAdded?: { message?: { id?: string; labelIds?: string[] } }[] }[]; nextPageToken?: string }
    for (const h of j.history ?? []) for (const a of h.messagesAdded ?? []) {
      const l = a.message?.labelIds ?? []
      if (a.message?.id && (l.includes('INBOX') || l.includes('SENT')) && !l.includes('SPAM') && !l.includes('DRAFT')) ids.add(a.message.id)
    }
    page = j.nextPageToken
  } while (page)
  return [...ids]
}

/** One page of inbox and sent mail since a date, for the first read-back. */
export async function listSince(token: string, afterEpoch: number, pageToken?: string, size = 100): Promise<{ ids: string[]; next: string | null }> {
  const q = encodeURIComponent(`after:${afterEpoch} (in:inbox OR in:sent) -in:chats`)
  const res = await fetch(`${GMAIL_API}/messages?q=${q}&maxResults=${size}${pageToken ? `&pageToken=${pageToken}` : ''}`, { headers: { Authorization: `Bearer ${token}` } })
  const j = res.ok ? await res.json() as { messages?: { id: string }[]; nextPageToken?: string } : {}
  return { ids: (j.messages ?? []).map(m => m.id), next: j.nextPageToken ?? null }
}
