/**
 * What moves the loop without new mail: a batch approved in Today is sent → the movements are
 * marked sent; a TRS note paid → settled; an insurer quiet for a week → a chase in Today.
 */
import { sb, sbTry, enc } from '@/lib/crm/db'
import { markMovementsSent } from '@/lib/policies/members'
import { workingDaysBetween, addDays } from '@/lib/admin/b/dates'
import { OPERATIONS } from '@/lib/admin/b/router'
import { chaseDue, MAX_CHASES } from './rules'
import { partialLine } from './cues'
import { batchEvent, batchMovements, batchesWhere, patchBatch, patchMovements, touchItem } from './store'
import { downloadObject } from '@/lib/debit-note-storage'
import { fileToDrive, groupFolderName } from '@/lib/documents/drive'

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

/**
 * TRS notes a person approved and sent: the PDF is filed in the group's data room under the
 * policy's Billing folder, the note carries the Drive link, and the case and company log record
 * "note sent" with that link. Runs after every send, so a note never sits only in app storage.
 */
export async function syncNotesSent(now = new Date()): Promise<number> {
  const ts = await sbTry<Row[]>('policy_transactions?debit_note_id=not.is.null&trs_note_work_item_id=not.is.null&select=id,batch_id,debit_note_id,trs_note_work_item_id,policy_id,work_items!trs_note_work_item_id(draft_id,company_id)&limit=500', [])
  let n = 0
  for (const t of ts) {
    const item = t.work_items as Row | null
    if (!item?.draft_id) continue
    const [d] = await sbTry<Row[]>(`ai_drafts?id=eq.${enc(item.draft_id)}&select=status,sent_at,to_email&limit=1`, [])
    if (d?.status !== 'sent') continue
    const [dn] = await sbTry<Row[]>(`debit_notes?id=eq.${enc(t.debit_note_id)}&select=id,debit_note_no,pdf_storage_url,drive_folder_url,insurer,issue_date&limit=1`, [])
    if (!dn || dn.drive_folder_url || !dn.pdf_storage_url) continue
    try {
      const [policy] = await sbTry<Row[]>(`policies?id=eq.${enc(t.policy_id)}&select=id,label,class_of_insurance,insurer,policy_number,start_date,drive_folder_url,company_id&limit=1`, [])
      const [company] = await sbTry<Row[]>(`companies?id=eq.${enc(item.company_id)}&select=company_name&limit=1`, [])
      const bytes = await downloadObject(dn.pdf_storage_url)
      const r = await fileToDrive({
        companyName: await groupFolderName(item.company_id, company?.company_name ?? 'Unnamed company'),
        policy: policy ? { id: policy.id, label: policy.label ?? null, class_of_insurance: policy.class_of_insurance ?? null, insurer: policy.insurer ?? null, policy_number: policy.policy_number ?? null, start_date: policy.start_date ?? null, drive_folder_url: policy.drive_folder_url ?? null } : null,
        doc: { doc_type: 'trs_debit_note', filename: `${dn.debit_note_no}.pdf`, received_at: d.sent_at ?? now.toISOString(), insurer_name: dn.insurer ?? null, mime_type: 'application/pdf' },
      }, bytes)
      if (policy && r.policyFolderUrl && !policy.drive_folder_url) await sb(`policies?id=eq.${enc(policy.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ drive_folder_url: r.policyFolderUrl }) })
      await sb(`debit_notes?id=eq.${enc(dn.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ drive_folder_url: r.url }) })
      await batchEvent(t.trs_note_work_item_id, 'note_sent', 'endorsements', { debit_note_id: dn.id, trs_note: dn.debit_note_no, to: d.to_email, sent_at: d.sent_at, drive_url: r.url })
      await touchItem(t.trs_note_work_item_id, { status: 'waiting_client', next_action: 'Payment due; the chaser follows up', last_activity_at: now.toISOString() })
      n++
    } catch (e) { console.warn('[endorsements] note filing failed (retried next sync):', e instanceof Error ? e.message : e) }
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
    const all = await batchMovements(b.id)
    // Only what the insurer has not yet noted is chased; the noted ones are already on their way to billing.
    const ms = all.filter(m => m.status === 'sent')
    if (!ms.length) continue
    const partial = partialLine(all.length, ms.length)
    const sentOn = (b.sent_at ?? b.created_at).slice(0, 10)
    const wd = workingDaysBetween(sentOn, now.toISOString().slice(0, 10))
    const body = [
      'Dear Underwriter,',
      '',
      `Following up on the movement request we sent on ${sentOn}${orig.subject ? ` ("${orig.subject}")` : ''}, ${wd} working days ago${partial ? ` — ${partial}` : ''}:`,
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
    await batchEvent(b.work_item_id, 'chase', 'endorsements', { batch_id: b.id, round: b.chase_count + 1, draft_id: draft.id, remaining: ms.map(m => m.subject ?? m.member_name), partial })
    n++
  }
  return n
}
