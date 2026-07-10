/**
 * One-off backfill: re-pull the HTML body from Gmail for messages ingested before
 * we started storing it, and extract highlights (#2). Existing rows had their HTML
 * discarded at ingest, so highlights can only be recovered from Gmail.
 *
 * POST /api/admin/backfill-highlights?limit=100
 *   → processes a batch of messages whose body_html is still null, sets body_html
 *     ('' when the message has no HTML part, so it isn't re-picked) + highlights.
 *   Returns { processed, updated, remaining }. Run repeatedly until remaining = 0.
 * Auth: a signed-in employee (session) OR x-internal-secret: <CRON_SECRET>.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { extractHighlights }         from '@/lib/extract-highlights'

export const maxDuration = 300

const SB_URL          = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const GMAIL_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GMAIL_API       = 'https://gmail.googleapis.com/gmail/v1/users/me'

function sbH(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

async function getGmailToken(): Promise<string | null> {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) return null
  try {
    const res = await fetch(GMAIL_TOKEN_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: GMAIL_CLIENT_ID, client_secret: GMAIL_CLIENT_SECRET, refresh_token: GMAIL_REFRESH_TOKEN, grant_type: 'refresh_token' }),
    })
    const d = await res.json()
    return d.access_token ?? null
  } catch { return null }
}

type MimePart = { mimeType?: string; body?: { data?: string }; parts?: MimePart[] }
function findHtml(parts: MimePart[] | undefined): string {
  for (const p of parts ?? []) {
    if (p.mimeType === 'text/html' && p.body?.data) return Buffer.from(p.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
    if (p.parts) { const n = findHtml(p.parts); if (n) return n }
  }
  return ''
}

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-internal-secret')
    if (secret !== (process.env.CRON_SECRET ?? '__none__')) {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const limit = Math.min(Number(new URL(req.url).searchParams.get('limit') ?? 100), 250)

    const token = await getGmailToken()
    if (!token) return NextResponse.json({ error: 'Gmail token unavailable' }, { status: 500 })

    // Remaining count (messages still missing HTML that we could fetch).
    const cntRes = await fetch(`${SB_URL}/rest/v1/email_messages?body_html=is.null&gmail_message_id=not.is.null&select=id`, { headers: { ...sbH(), Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' } })
    const remainingBefore = Number(cntRes.headers.get('content-range')?.split('/')?.[1] ?? '0')

    // This batch — newest first.
    const listRes = await fetch(
      `${SB_URL}/rest/v1/email_messages?body_html=is.null&gmail_message_id=not.is.null&deleted_at=is.null&select=id,gmail_message_id&order=sent_at.desc&limit=${limit}`,
      { headers: sbH(), cache: 'no-store' },
    )
    const rows = (listRes.ok ? await listRes.json() : []) as { id: string; gmail_message_id: string }[]

    let processed = 0, updated = 0
    for (const m of rows) {
      processed++
      let html = ''
      try {
        const gRes = await fetch(`${GMAIL_API}/messages/${m.gmail_message_id}?format=full`, { headers: { Authorization: `Bearer ${token}` } })
        if (gRes.ok) { const g = await gRes.json(); html = findHtml(g.payload?.parts ?? [g.payload]) }
      } catch { /* leave html empty */ }

      const highlights = extractHighlights(html)
      await fetch(`${SB_URL}/rest/v1/email_messages?id=eq.${m.id}`, {
        method: 'PATCH', headers: sbH('return=minimal'),
        body: JSON.stringify({ body_html: html || '', highlights: highlights.length ? highlights : null }),
      }).catch(() => {})
      if (highlights.length) updated++
    }

    return NextResponse.json({ processed, updated_with_highlights: updated, remaining: Math.max(0, remainingBefore - processed) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
