/**
 * One-off backfill (Phase 1 of reply-threading): populate email_messages.rfc822_message_id
 * (and in_reply_to) for rows ingested before we captured the Message-ID header. Without it,
 * a reply on an existing thread can't build a References chain, so the recipient's client
 * (Outlook/AIA) won't thread it. New replies thread the moment the sent copy is ingested.
 *
 * Pulls each message's Message-ID / In-Reply-To from Gmail (ops mailbox) by its
 * gmail_message_id. Messages that don't live in the ops mailbox (personal-mailbox sends)
 * 404 and are skipped. Idempotent; only touches rows where rfc822_message_id is null.
 * Run until done=true.
 *
 * POST /api/admin/backfill-message-ids?limit=100
 * Auth: a signed-in employee (session) OR x-internal-secret: <CRON_SECRET>.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'

export const maxDuration = 300

const SB_URL          = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const GMAIL_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GMAIL_API       = 'https://gmail.googleapis.com/gmail/v1/users/me'

function sbH(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

async function getAccessToken(): Promise<string> {
  const res = await fetch(GMAIL_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
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

function headerVal(headers: { name: string; value: string }[], name: string): string {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

type MsgRow = { id: string; gmail_message_id: string }

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-internal-secret')
    if (secret !== (process.env.CRON_SECRET ?? '__none__')) {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const limit = Math.min(Number(new URL(req.url).searchParams.get('limit') ?? 100), 200)

    // Only rows still missing the Message-ID; newest first so open threads thread soonest.
    const listRes = await fetch(
      `${SB_URL}/rest/v1/email_messages?rfc822_message_id=is.null&select=id,gmail_message_id&order=sent_at.desc&limit=${limit}`,
      { headers: sbH('return=representation'), cache: 'no-store' },
    )
    const rows = (listRes.ok ? await listRes.json() : []) as MsgRow[]
    if (rows.length === 0) return NextResponse.json({ processed: 0, updated: 0, done: true })

    const token = await getAccessToken()
    let updated = 0, skipped = 0

    for (const row of rows) {
      try {
        const r = await fetch(
          `${GMAIL_API}/messages/${row.gmail_message_id}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=In-Reply-To`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        if (!r.ok) { skipped++; continue } // not in ops mailbox (personal send) or deleted
        const msg  = await r.json()
        const hdrs = msg.payload?.headers ?? []
        const mid  = headerVal(hdrs, 'Message-ID') || null
        const irt  = headerVal(hdrs, 'In-Reply-To') || null
        if (!mid && !irt) { skipped++; continue }
        const patch = await fetch(`${SB_URL}/rest/v1/email_messages?id=eq.${row.id}`, {
          method: 'PATCH', headers: sbH('return=minimal'),
          body: JSON.stringify({ rfc822_message_id: mid, in_reply_to: irt }),
        })
        if (patch.ok) updated++; else skipped++
      } catch { skipped++ }
    }

    // done when this page was smaller than the limit (no more null rows to fetch)
    return NextResponse.json({ processed: rows.length, updated, skipped, done: rows.length < limit })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
