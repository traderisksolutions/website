/**
 * What moves the loop without new mail: a batch approved in Today is sent → the movements are
 * marked sent; a TRS note paid → settled; an insurer quiet for a week → a chase in Today.
 */
import { sb, sbTry, enc } from '@/lib/crm/db'
import { markMovementsSent } from '@/lib/policies/members'
import { workingDaysBetween, addDays } from '@/lib/admin/b/dates'
import { OPERATIONS } from '@/lib/admin/b/router'
import { chaseDue, MAX_CHASES } from './rules'
import { batchEvent, batchMovements, batchesWhere, patchBatch, patchMovements, touchItem } from './store'

type Row = Record<string, any>
const REP = { Prefer: 'return=representation' }

/** Batches whose insurer draft went out: movements sent, the thread the mail started recorded. */
export async function syncSent(now = new Date()): Promise<number> {
  let n = 0
  for (const b of await batchesWhere('status=eq.ready&draft_id=not.is.null')) {
    const [d] = await sbTry<Row[]>(`ai_drafts?id=eq.${enc(b.draft_id!)}&select=id,status,sent_at,thread_id,subject&limit=1`, [])
    if (!d || d.status !== 'sent') continue
    const at = d.sent_at ?? now.toISOString()
    const sent = await markMovementsSent(b.draft_id!, at)
    // The batch is chased from here, not per movement; the per-movement chaser stays quiet.
    await patchMovements(sent.map(m => m.id), { next_chase_at: null })
    // A send that started a new thread is found by its subject, since the draft keeps no thread.
    let threadId: string | null = d.thread_id ?? b.thread_id
    if (!threadId && d.subject) {
      const [m] = await sbTry<Row[]>(`email_messages?direction=eq.outbound&subject=eq.${enc(d.subject)}&sent_at=gte.${enc(addDays(at.slice(0, 10), -1))}&select=thread_id&order=sent_at.desc&limit=1`, [])
      threadId = m?.thread_id ?? null
    }
    await patchBatch(b.id, { status: 'sent', sent_at: at, thread_id: threadId, next_chase_at: addDays(at.slice(0, 10), 7) + 'T01:00:00Z' })
    await batchEvent(b.work_item_id, 'batch_sent', 'endorsements', { batch_id: b.id, movements: sent.length, at })
    n++
  }
  return n
}

/** TRS notes the client has paid: the movements behind them are settled. */
export async function syncSettled(now = new Date()): Promise<number> {
  const ts = await sbTry<Row[]>('policy_transactions?debit_note_id=not.is.null&select=id,batch_id,debit_note_id,policy_movements(id,status)&limit=500', [])
  let n = 0
  for (const t of ts) {
    const open = (t.policy_movements ?? []).filter((m: Row) => m.status === 'billed')
    if (!open.length) continue
    const [dn] = await sbTry<Row[]>(`debit_notes?id=eq.${enc(t.debit_note_id)}&select=status,paid_amount&limit=1`, [])
    if (dn?.status !== 'paid') continue
    await patchMovements(open.map((m: Row) => m.id), { status: 'settled', settled_at: now.toISOString() })
    if (t.batch_id) { await patchBatch(t.batch_id, { status: 'settled', settled_at: now.toISOString() }); const [b] = await sbTry<Row[]>(`movement_batches?id=eq.${enc(t.batch_id)}&select=work_item_id&limit=1`, []); await batchEvent(b?.work_item_id ?? null, 'settled', 'endorsements', { transaction_id: t.id, debit_note_id: t.debit_note_id }) }
    n++
  }
  return n
}

/** A sent batch with no note after a week gets a chase draft on its case, in Today. Three at most. */
export async function chaseBatches(now = new Date()): Promise<number> {
  let n = 0
  for (const b of await batchesWhere('status=eq.sent')) {
    if (!chaseDue(b, now) || !b.work_item_id || !b.draft_id) continue
    const [orig] = await sbTry<Row[]>(`ai_drafts?id=eq.${enc(b.draft_id)}&select=to_email,cc,subject,contact_id,thread_id,sent_thread_id&limit=1`, [])
    if (!orig?.to_email) continue
    const [item] = await sbTry<Row[]>(`work_items?id=eq.${enc(b.work_item_id)}&select=draft_id,later_until&limit=1`, [])
    if (item?.draft_id || item?.later_until) continue   // a draft already waits, or a person set it aside
    const ms = await batchMovements(b.id)
    const sentOn = (b.sent_at ?? b.created_at).slice(0, 10)
    const wd = workingDaysBetween(sentOn, now.toISOString().slice(0, 10))
    const body = [
      'Dear Underwriter,',
      '',
      `Following up on the movement request we sent on ${sentOn}${orig.subject ? ` ("${orig.subject}")` : ''}, ${wd} working days ago:`,
      '',
      ...ms.map(m => `- ${m.subject ?? m.member_name} (${m.kind === 'join' ? 'addition' : m.kind === 'leave' ? 'deletion' : 'change'}${m.effective_on ? `, effective ${m.effective_on}` : ''})`),
      '',
      'May we have the endorsement and the debit or credit note, or let us know if anything else is needed?',
      '',
      'Best regards,',
      '{owner_name}',
      'Trade Risk Solutions',
    ].join('\n')
    const [draft] = await sb<Row[]>('ai_drafts', { method: 'POST', headers: REP, body: JSON.stringify({
      contact_id: orig.contact_id ?? null, thread_id: orig.sent_thread_id ?? b.thread_id ?? orig.thread_id ?? null, channel: 'email', email_type: 'CASE_WORK', status: 'pending', generated_by: 'template',
      to_email: orig.to_email, cc: orig.cc || OPERATIONS, subject: `Follow-up: ${orig.subject ?? 'movement request'}`, body, attachments: [], work_item_id: b.work_item_id, party: 'insurer',
      context_used: { agent: 'endorsements', kind: 'chase_insurer', round: b.chase_count + 1 },
    }) })
    const next = b.chase_count + 1 >= MAX_CHASES ? null : addDays(now.toISOString().slice(0, 10), 7) + 'T01:00:00Z'
    await patchBatch(b.id, { chase_count: b.chase_count + 1, last_chase_at: now.toISOString(), next_chase_at: next })
    await touchItem(b.work_item_id, { draft_id: draft.id, status: 'trs_to_act', next_action: `Send chase ${b.chase_count + 1} to the insurer` })
    await batchEvent(b.work_item_id, 'chase', 'endorsements', { batch_id: b.id, round: b.chase_count + 1, draft_id: draft.id })
    n++
  }
  return n
}
