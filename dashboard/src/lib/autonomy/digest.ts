/**
 * The daily digest: one case in the dashboard listing everything the agents sent today, so
 * nothing goes out unseen. No email. One per Singapore day; re-running updates it.
 */
import { sb, sbTry, enc } from '@/lib/crm/db'
import { todaySGT } from '@/lib/sgt-time'
import { autoSentToday } from './send'
import { digestText, type SentLine } from './rules'

type Row = Record<string, any>
const ACTOR = 'agent'

export async function writeDigest(now = new Date()): Promise<{ sends: number; itemId: string }> {
  const day = todaySGT()
  const rows = await autoSentToday(now)
  const sends: SentLine[] = rows.map(r => ({ work_item_id: r.work_item_id ?? null, draft_class: String(r.draft_class ?? ''), to: String(r.to_email ?? ''), subject: String(r.subject ?? ''), client: r.work_items?.client_name ?? null, sent_at: String(r.sent_at) }))
  const title = `Auto-sent today: ${sends.length}`
  const summary = digestText(sends)
  const [existing] = await sbTry<Row[]>(`work_items?source=eq.autonomy_digest&title=like.Auto-sent*&created_at=gte.${enc(day + 'T00:00:00+08:00')}&select=id&limit=1`, [])
  if (existing) {
    await sb(`work_items?id=eq.${enc(existing.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ title, summary, last_activity_at: now.toISOString(), read_at: null }) })
    return { sends: sends.length, itemId: existing.id }
  }
  const [item] = await sb<Row[]>('work_items', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
    case_type: 'other', title, summary, status: 'trs_to_act', next_action: 'Read and mark read', source: 'autonomy_digest', confidence: 'high', last_activity_at: now.toISOString(), client_name: 'TRS',
  }) })
  await sbTry('work_item_events', null, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ work_item_id: item.id, kind: 'note', actor: ACTOR, detail: { digest_for: day, sends: sends.length } }) })
  return { sends: sends.length, itemId: item.id }
}
