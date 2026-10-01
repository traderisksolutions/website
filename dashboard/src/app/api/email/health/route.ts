/**
 * GET /api/email/health
 *
 * Answers "why am I not seeing new mail?" without anyone having to read a credential.
 *
 * The dashboard only ever looks at INBOX: the Gmail watch is registered on labelIds ['INBOX'],
 * and both the push path and the daily catch-up filter on it. So mail that skips the inbox —
 * a filter that archives or relabels, or mail delivered to an address this mailbox does not
 * receive — is invisible to the dashboard however healthy the pipeline is. Nothing in the
 * database can show that, because the messages never reach the database. Only Gmail can.
 *
 * So this asks Gmail: which mailbox is connected, how much has arrived in INBOX against the
 * whole mailbox, and what the newest message is — then sets that beside what we actually stored.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { isAutomated, isInternal, bareEmail } from '@/lib/crm/db'

export const maxDuration = 60

const SB_URL    = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

function sbHeaders() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}` }
}

async function getAccessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GMAIL_CLIENT_ID ?? '',
      client_secret: process.env.GMAIL_CLIENT_SECRET ?? '',
      refresh_token: process.env.GMAIL_REFRESH_TOKEN ?? '',
      grant_type:    'refresh_token',
    }),
  })
  const j = await res.json() as { access_token?: string; error_description?: string; error?: string }
  if (!j.access_token) throw new Error(`Gmail token refresh failed: ${j.error_description ?? j.error ?? 'no token'}`)
  return j.access_token
}

async function gmail<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${GMAIL_API}${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
  if (!res.ok) throw new Error(`Gmail ${path.split('?')[0]} -> ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return await res.json() as T
}

/** Gmail caps a list page at 500; this only needs "how many recently", so one page is enough. */
async function countMessages(q: string, token: string, inboxOnly: boolean): Promise<number> {
  const url = `/messages?maxResults=500&q=${encodeURIComponent(q)}${inboxOnly ? '&labelIds=INBOX' : ''}`
  const d = await gmail<{ messages?: unknown[] }>(url, token)
  return (d.messages ?? []).length
}

async function config(key: string): Promise<string | null> {
  const res = await fetch(`${SB_URL}/rest/v1/system_config?key=eq.${encodeURIComponent(key)}&select=value&limit=1`,
    { headers: sbHeaders(), cache: 'no-store' })
  const rows = res.ok ? await res.json() as { value?: string }[] : []
  return rows[0]?.value ?? null
}

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized

  try {
    const token = await getAccessToken()

    const [profile, storedHistory, storedExpiry, newestRes] = await Promise.all([
      gmail<{ emailAddress?: string; messagesTotal?: number; historyId?: string }>('/profile', token),
      config('gmail_history_id'),
      config('gmail_watch_expiration'),
      fetch(`${SB_URL}/rest/v1/email_messages?select=sent_at,direction&order=sent_at.desc&limit=1`,
        { headers: sbHeaders(), cache: 'no-store' }),
    ])

    const newestRows = newestRes.ok ? await newestRes.json() as { sent_at: string; direction: string }[] : []
    const newestStored = newestRows[0]?.sent_at ?? null

    const [inbox1, all1, inbox7, all7] = await Promise.all([
      countMessages('newer_than:1d', token, true),
      countMessages('newer_than:1d', token, false),
      countMessages('newer_than:7d', token, true),
      countMessages('newer_than:7d', token, false),
    ])

    // ?detail=1 — for each recent INBOX message, say whether it was stored and, if not, which
    // rule dropped it. Counts alone cannot distinguish "nothing arrived" from "everything that
    // arrived was discarded", and those have opposite fixes.
    let detail: unknown[] | undefined
    if (req.nextUrl.searchParams.get('detail') === '1') {
      const list = await gmail<{ messages?: { id: string }[] }>(
        `/messages?maxResults=40&labelIds=INBOX&q=${encodeURIComponent('newer_than:2d')}`, token)
      const ids = (list.messages ?? []).map(m => m.id)

      const storedRes = ids.length
        ? await fetch(`${SB_URL}/rest/v1/email_messages?select=gmail_message_id&gmail_message_id=in.(${ids.map(i => `"${i}"`).join(',')})`,
            { headers: sbHeaders(), cache: 'no-store' })
        : null
      const storedIds = new Set<string>(
        storedRes?.ok ? ((await storedRes.json()) as { gmail_message_id: string }[]).map(r => r.gmail_message_id) : [])

      detail = await Promise.all(ids.slice(0, 40).map(async id => {
        const m = await gmail<{ payload?: { headers?: { name: string; value: string }[] }; internalDate?: string }>(
          `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`, token)
        const h = Object.fromEntries((m.payload?.headers ?? []).map(x => [x.name, x.value]))
        const from = bareEmail(h.From ?? '')
        const stored = storedIds.has(id)
        return {
          from,
          subject: (h.Subject ?? '').slice(0, 70),
          at: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : null,
          stored,
          // Why it is absent, in the order ingestMessage applies the rules.
          droppedBy: stored ? null
            : isAutomated(from) ? 'isAutomated — sender looks like a no-reply or notification address'
            : isInternal(from)  ? 'internal sender with no external party resolved on the thread'
            : 'not stored, and neither skip rule explains it',
        }
      }))
    }

    const expiryMs = storedExpiry ? parseInt(storedExpiry, 10) : 0
    const watchHoursLeft = expiryMs ? (expiryMs - Date.now()) / 3_600_000 : null

    // The two conditions worth naming, because each has a different fix.
    const mailSkippingInbox = all7 > inbox7
    const behind = storedHistory && profile.historyId && Number(profile.historyId) > Number(storedHistory)

    return NextResponse.json({
      mailbox: profile.emailAddress ?? null,
      messagesInMailbox: profile.messagesTotal ?? null,
      watch: {
        expiresAt: expiryMs ? new Date(expiryMs).toISOString() : null,
        hoursRemaining: watchHoursLeft === null ? null : Math.round(watchHoursLeft),
        healthy: watchHoursLeft !== null && watchHoursLeft > 0,
      },
      history: { gmail: profile.historyId ?? null, stored: storedHistory, behind: !!behind },
      arrivals: {
        last24h: { inInbox: inbox1, anywhere: all1 },
        last7d:  { inInbox: inbox7, anywhere: all7 },
      },
      newestStored,
      detail,
      // Said plainly, because the whole point is that the database cannot show this.
      verdict: mailSkippingInbox
        ? `${all7 - inbox7} of the last ${all7} messages are not in INBOX. The dashboard only reads INBOX, so it cannot see them — check this mailbox's filters for one that archives or relabels on arrival.`
        : inbox1 === 0
          ? 'No mail has arrived in this mailbox in 24 hours. The pipeline is not the problem; the mailbox is quiet, or client mail is going to an address this mailbox does not receive.'
          : 'Mail is arriving in INBOX and the dashboard can see it.',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
