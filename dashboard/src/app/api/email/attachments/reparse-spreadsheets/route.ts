/**
 * POST /api/email/attachments/reparse-spreadsheets   { apply?: boolean, limit?: number }
 *
 * Re-reads stored spreadsheet attachments from Gmail and rewrites their text with every date as
 * YYYY-MM-DD.
 *
 * Until 2 Oct 2026 spreadsheets were turned into text with the library's default, which writes a
 * date cell month-first with a two-digit year: a date of birth of 13 July 1971 was stored as
 * "7/13/71". 67 of 204 stored spreadsheets — member listings, premium calculators, statements —
 * held dates that way, and every agent that reads attachments read them that way. The text cannot
 * be repaired in place, because a two-digit year does not say its century ("25" is 1925 in a date
 * of birth and 2025 on a statement), so the original file is fetched again and re-read.
 *
 * Defaults to a dry run listing what it would change. Only spreadsheets are touched — no PDF, no
 * image, no model call — and a row is updated only when the new text differs.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { xlsxSheetsAsText } from '@/lib/xlsx-text'
import { logActivity } from '@/lib/log-activity'

export const maxDuration = 300

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

function sbH(prefer?: string) {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) }
}

async function gmailToken(): Promise<string | null> {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) return null
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: GMAIL_CLIENT_ID, client_secret: GMAIL_CLIENT_SECRET,
                                refresh_token: GMAIL_REFRESH_TOKEN, grant_type: 'refresh_token' }),
  }).catch(() => null)
  const d = res?.ok ? await res.json() as { access_token?: string } : null
  return d?.access_token ?? null
}

type Row = { id: string; filename: string; message_id: string; gmail_attachment_id: string | null; parsed_text: string | null }

/** Same shape the extraction route writes, so a re-read row is indistinguishable from a fresh one. */
const render = (buf: Buffer) =>
  xlsxSheetsAsText(buf, 10000).map(s => `Sheet: ${s.name}\n${s.text}`).join('\n\n').slice(0, 30000)

/** The month-first, two-digit-year form the old rendering produced. */
const OLD_FORM = /(?<![\d/])\d{1,2}\/\d{1,2}\/\d{2}(?![\d/])/

export async function POST(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const { apply, limit } = await req.json().catch(() => ({})) as { apply?: boolean; limit?: number }
    const res = await fetch(`${SB_URL}/rest/v1/email_attachments?select=id,filename,message_id,gmail_attachment_id,parsed_text` +
      `&or=(filename.ilike.*.xlsx,filename.ilike.*.xls,filename.ilike.*.xlsm)&limit=2000`, { headers: sbH(), cache: 'no-store' })
    const rows = (res.ok ? await res.json() as Row[] : []).filter(r => OLD_FORM.test(r.parsed_text ?? ''))
    const todo = rows.slice(0, Math.max(1, Math.min(limit ?? rows.length, 500)))

    const token = await gmailToken()
    if (!token) return NextResponse.json({ error: 'Gmail credentials are not configured on this deployment.' }, { status: 500 })

    // gmail_message_id lives on the message row.
    const ids = Array.from(new Set(todo.map(r => r.message_id)))
    const mRes = ids.length ? await fetch(`${SB_URL}/rest/v1/email_messages?id=in.(${ids.join(',')})&select=id,gmail_message_id`,
      { headers: sbH(), cache: 'no-store' }) : null
    const gmailIdOf = new Map((mRes?.ok ? await mRes.json() as { id: string; gmail_message_id: string }[] : []).map(m => [m.id, m.gmail_message_id]))

    const results: { filename: string; outcome: string; before?: string; after?: string }[] = []
    for (const r of todo) {
      const gmailId = gmailIdOf.get(r.message_id)
      if (!gmailId || !r.gmail_attachment_id) { results.push({ filename: r.filename, outcome: 'no Gmail reference' }); continue }
      const aRes = await fetch(`${GMAIL_API}/messages/${gmailId}/attachments/${r.gmail_attachment_id}`,
        { headers: { Authorization: `Bearer ${token}` } })
      if (!aRes.ok) { results.push({ filename: r.filename, outcome: `Gmail ${aRes.status}` }); continue }
      const { data } = await aRes.json() as { data?: string }
      if (!data) { results.push({ filename: r.filename, outcome: 'empty attachment' }); continue }
      let text: string
      try { text = render(Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64')) }
      catch (e) { results.push({ filename: r.filename, outcome: `unreadable: ${e instanceof Error ? e.message : e}` }); continue }
      if (text === r.parsed_text) { results.push({ filename: r.filename, outcome: 'unchanged' }); continue }

      const before = (r.parsed_text ?? '').match(OLD_FORM)?.[0]
      const after = text.match(/\d{4}-\d{2}-\d{2}/)?.[0]
      if (apply) {
        const up = await fetch(`${SB_URL}/rest/v1/email_attachments?id=eq.${r.id}`, {
          method: 'PATCH', headers: sbH('return=minimal'),
          body: JSON.stringify({ parsed_text: text, parsed_at: new Date().toISOString() }),
        })
        results.push({ filename: r.filename, outcome: up.ok ? 'rewritten' : `write failed ${up.status}`, before, after })
      } else {
        results.push({ filename: r.filename, outcome: 'would rewrite', before, after })
      }
    }

    const summary = results.reduce<Record<string, number>>((a, x) => { a[x.outcome.split(':')[0]] = (a[x.outcome.split(':')[0]] ?? 0) + 1; return a }, {})
    if (apply) void logActivity({ action: 'attachments.reparse_spreadsheets', resource_type: 'email_attachments', new_value: summary })
    return NextResponse.json({ dryRun: !apply, found: rows.length, processed: todo.length, summary, results })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
