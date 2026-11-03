/**
 * POST  /api/followups { draft_id, gmail_message_id, days, auto }  the chase a person set when sending on Today
 *         days 0 = no chase. auto = chases go out on schedule without asking again.
 * GET   /api/followups?status=waiting|all                          the follow-ups, newest first, with a summary by type
 * PATCH /api/followups { id, status?: 'off', days? }                stop or re-time one follow-up
 *
 * The monitor (src/lib/followups/monitor.ts) registers every other sent email with its default.
 */
import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/sales/auth'
import { sbTry, enc, isInternal, isAutomated } from '@/lib/crm/db'
import { addDays, classify, defaultSchedule, expectsReply, TYPE_LABEL, type Party } from '@/lib/followups/rules'

export const dynamic = 'force-dynamic'
type Row = Record<string, any>

export async function POST(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const b = await req.json().catch(() => ({})) as Row
  const days = Math.max(0, Math.min(60, Math.floor(Number(b.days ?? 0))))
  const [m] = b.gmail_message_id ? await sbTry<Row[]>(`email_messages?gmail_message_id=eq.${enc(String(b.gmail_message_id))}&select=id,thread_id,subject,body_text,sent_at,from_address&limit=1`, []) : []
  if (!m) return json({ error: 'The sent email is not on file yet' }, 404)
  const [d] = b.draft_id ? await sbTry<Row[]>(`ai_drafts?id=eq.${enc(String(b.draft_id))}&select=id,to_email,cc,party,work_item_id,context_used&limit=1`, []) : []
  const to = String(d?.to_email ?? '').split(/[,;]\s*/).map(s => s.trim().toLowerCase()).filter(e => e && !isInternal(e) && !isAutomated(e))
  const party: Party = d?.party === 'insurer' ? 'insurer' : d?.party === 'client' ? 'client' : 'other'
  const type = classify({ subject: m.subject, body: m.body_text, party, draftKind: d?.context_used?.kind ?? null })
  const s = defaultSchedule(party, type)
  const working = party === 'insurer' || type === 'quote_to_client'
  const row = {
    message_id: m.id, thread_id: m.thread_id, work_item_id: d?.work_item_id ?? null, draft_id: d?.id ?? null, sent_at: m.sent_at, sent_by: who.email,
    to_party: party, to_email: to.join(', ') || null, cc: d?.cc ?? null, subject: m.subject, email_type: type, expects_reply: days > 0 || expectsReply(type, m.body_text),
    first_after_days: days || s.firstAfterDays, every_days: days || s.everyDays, working_days: working, max_chases: s.maxChases,
    next_chase_at: days ? addDays(m.sent_at, days, working) : null, set_by: who.email, preapproved: days > 0 && b.auto === true,
    status: days ? 'waiting' : 'off', updated_at: new Date().toISOString(),
  }
  await sbTry('email_followups?on_conflict=message_id', null, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) })
  return json({ ok: true, next_chase_at: row.next_chase_at, type })
}

export async function GET(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const all = req.nextUrl.searchParams.get('status') === 'all'
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString()
  const rows = await sbTry<Row[]>(`email_followups?sent_at=gte.${enc(since)}${all ? '' : '&status=in.(waiting,chased_out)'}&select=id,thread_id,work_item_id,sent_at,sent_by,to_party,to_email,subject,email_type,status,chases,max_chases,next_chase_at,replied_at,set_by,preapproved&order=sent_at.desc&limit=1000`, [])
  const now = Date.now()
  const types = new Map<string, { type: string; label: string; waiting: number; overdue: number; replied: number; chased_out: number; reply_days: number[] }>()
  const every = all ? rows : await sbTry<Row[]>(`email_followups?sent_at=gte.${enc(since)}&select=email_type,status,sent_at,replied_at,next_chase_at&limit=5000`, [])
  for (const r of every) {
    const t = types.get(r.email_type) ?? { type: r.email_type, label: TYPE_LABEL[r.email_type as keyof typeof TYPE_LABEL] ?? r.email_type, waiting: 0, overdue: 0, replied: 0, chased_out: 0, reply_days: [] as number[] }
    if (r.status === 'waiting') { t.waiting++; if (r.next_chase_at && Date.parse(r.next_chase_at) < now) t.overdue++ }
    if (r.status === 'replied') { t.replied++; if (r.replied_at) t.reply_days.push((Date.parse(r.replied_at) - Date.parse(r.sent_at)) / 86_400_000) }
    if (r.status === 'chased_out') t.chased_out++
    types.set(r.email_type, t)
  }
  const summary = Array.from(types.values()).map(t => ({ ...t, median_reply_days: t.reply_days.length ? Math.round(t.reply_days.sort((a, b) => a - b)[Math.floor(t.reply_days.length / 2)] * 10) / 10 : null, reply_days: undefined }))
    .sort((a, b) => b.waiting - a.waiting)
  return json({ rows, summary })
}

export async function PATCH(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const b = await req.json().catch(() => ({})) as Row
  const [f] = await sbTry<Row[]>(`email_followups?id=eq.${enc(String(b.id ?? ''))}&select=id,sent_at,working_days&limit=1`, [])
  if (!f) return json({ error: 'Follow-up not found' }, 404)
  const set: Row = { set_by: who.email, updated_at: new Date().toISOString() }
  if (b.status === 'off') { set.status = 'off'; set.next_chase_at = null }
  if (Number(b.days) > 0) { const d = Math.min(60, Math.floor(Number(b.days))); set.every_days = d; set.next_chase_at = addDays(new Date().toISOString(), d, f.working_days); set.status = 'waiting' }
  await sbTry(`email_followups?id=eq.${enc(f.id)}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(set) })
  return json({ ok: true })
}
