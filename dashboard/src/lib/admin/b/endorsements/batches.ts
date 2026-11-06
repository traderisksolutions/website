/**
 * Closing a batch: the week's movements on one policy become one sheet in the insurer's layout,
 * one email to the insurer's desk, one note to the client, and ONE item in Today to approve.
 * Nothing is sent from here; approval in Today sends both emails.
 */
import { oneRecipient } from '@/lib/email/recipients'
import { randomUUID } from 'node:crypto'
import { sb, sbTry, enc, bareEmail, isInternal } from '@/lib/crm/db'
import * as store from '@/lib/placement/store'
import { normInsurer } from '@/lib/insurers'
import { shortInsurer } from '@/lib/gb/insurer-names'
import { movementAttachments } from '@/lib/policies/movement-flow'
import { movementSubject } from '@/lib/policies/movement-sheet'
import type { PolicyRow } from '@/lib/policies/types'
import { insurerLastHandler } from '@/lib/admin/b/data'
import { OPERATIONS } from '@/lib/admin/b/router'
import { amendmentOps, amendmentTitle, batchDue, batchTitle, countOf, estimateTotal, lineFor, movementTypeFor } from './rules'
import { batch as batchById, batchMovements, batchEvent, openBatches, patchBatch, patchMovements, touchItem, type MovementRow } from './store'
import type { BatchRow } from './types'

type Row = Record<string, any>
const REP = { Prefer: 'return=representation' }
const MIN = { Prefer: 'return=minimal' }

const fmt = (iso: string | null) => iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : null
const word = (m: MovementRow) => m.movement_type === 'vehicle' ? (m.kind === 'join' ? 'add' : m.kind === 'leave' ? 'delete' : 'change') : (m.kind === 'join' ? 'addition' : m.kind === 'leave' ? 'deletion' : 'change')
const kindWord = (k: string) => k === 'join' ? 'addition' : k === 'leave' ? 'deletion' : 'change'
/** A line of an amendment: what the insurer should undo or redo against the earlier request. */
const amendLine = (m: MovementRow) => {
  const d = (m.detail ?? {}) as Record<string, unknown>
  const name = m.subject ?? m.member_name
  if (d.amendment === 'cancel') return `- ${name} — please cancel the ${kindWord(String(d.of_kind ?? 'change'))} we requested; no change to be made`
  if (d.amendment === 'reverse') return `- ${name} — please reverse the ${kindWord(String(d.of_kind ?? 'change'))} already endorsed and issue the corresponding ${d.of_kind === 'join' ? 'credit' : 'debit'} note`
  return `${line(m)}${m.supersedes_id ? ' (replaces our earlier instruction)' : ''}`
}
const line = (m: MovementRow) => {
  const when = m.kind === 'leave' ? (m.last_day ? `last day ${fmt(m.last_day)}` : m.effective_on ? `effective ${fmt(m.effective_on)}` : 'date to confirm') : m.effective_on ? `effective ${fmt(m.effective_on)}` : 'date to confirm'
  const extra = [m.relationship && m.relationship !== 'employee' ? m.relationship : null, m.plan_code ? `plan ${m.plan_code}` : null, m.category].filter(Boolean).join(', ')
  return `- ${m.subject ?? m.member_name} — ${word(m)}, ${when}${extra ? ` (${extra})` : ''}`
}

/** The insurer desk for this policy's line: product contacts, then the insurer's last handler on such mail. */
export async function insurerDesk(policy: PolicyRow, insurerName: string): Promise<{ to: string[]; cc: string[]; basis: string; contactId: string | null }> {
  const l = lineFor(policy)
  const lines = Array.from(new Set([l, ...(movementTypeFor(l) === 'member' ? ['employee_benefits', 'group_health'] : [])].filter((x): x is string => !!x)))
  const routes = (await store.insurerRoutes(lines)).filter(r => (policy.chosen_insurer_company_id && r.insurer_company_id === policy.chosen_insurer_company_id) || normInsurer(r.insurer_name) === normInsurer(insurerName))
  if (routes.length) {
    const first = routes.find(r => r.is_default) ?? routes[0]
    return { to: [first.email], cc: Array.from(new Set(routes.filter(r => r.email !== first.email).map(r => r.email))).slice(0, 3), basis: `insurer list (${first.product_line})`, contactId: first.contact_id }
  }
  const last = await insurerLastHandler(insurerName, movementTypeFor(l) === 'member' ? 'member' : 'endorsement')
  if (last) return { to: [last], cc: [], basis: 'last handler of such mail', contactId: null }
  return { to: [], cc: [], basis: 'nobody on file', contactId: null }
}

/** The client people who reported the movements, newest reporter first. */
async function reporters(ms: MovementRow[]): Promise<string[]> {
  const ids = Array.from(new Set(ms.map(m => m.reported_message_id).filter((x): x is string => !!x)))
  if (!ids.length) return []
  const msgs = await sbTry<Row[]>(`email_messages?id=in.(${ids.join(',')})&select=from_address,sent_at&order=sent_at.desc`, [])
  return Array.from(new Set(msgs.map(m => bareEmail(m.from_address)).filter(e => e && !isInternal(e))))
}

async function storeDraft(workItemId: string, d: { thread_id: string | null; to: string[]; cc: string[]; subject: string; body: string; kind: string; party: 'client' | 'insurer'; pair_id: string; attachments?: { filename: string; mime_type?: string; storage_url: string }[]; contact_id?: string | null }, primary: boolean): Promise<string> {
  const r = oneRecipient(d.to, d.cc)
  const [contact] = d.contact_id ? [{ id: d.contact_id }] : await sbTry<Row[]>(`contacts?email=ilike.${enc(r.to)}&select=id&limit=1`, [])
  const [draft] = await sb<Row[]>('ai_drafts', { method: 'POST', headers: REP, body: JSON.stringify({
    contact_id: contact?.id ?? null, thread_id: d.thread_id, channel: 'email', email_type: 'CASE_WORK', status: 'pending', generated_by: 'template',
    to_email: r.to, cc: r.cc.join(', ') || null, subject: d.subject, body: d.body, attachments: d.attachments ?? [],
    work_item_id: workItemId, pair_id: d.pair_id, party: d.party, context_used: { agent: 'endorsements', kind: d.kind, ...(r.removed.length ? { removed_recipients: r.removed } : {}) },
  }) })
  if (primary) await touchItem(workItemId, { draft_id: draft.id })
  return draft.id as string
}

/** Opens the Today item for a batch: one item, one primary draft to the insurer, one paired note to the client. */
export async function prepareBatch(b: BatchRow, now = new Date()): Promise<{ workItemId: string | null; question: string | null }> {
  const ms = await batchMovements(b.id)
  if (!ms.length) { await patchBatch(b.id, { status: 'cancelled' }); return { workItemId: null, question: null } }
  const [policy] = await sbTry<PolicyRow[]>(`policies?id=eq.${enc(b.policy_id)}&limit=1`, [])
  const company = await store.company(b.company_id)
  if (!policy || !company) return { workItemId: null, question: 'policy or company missing' }
  const insurerName = policy.insurer ?? (policy.chosen_insurer_company_id ? (await store.company(policy.chosen_insurer_company_id))?.company_name ?? null : null)
  const type = movementTypeFor(lineFor(policy))
  const counts = countOf(ms)
  const estimate = estimateTotal(ms)
  // A revision amends a batch the insurer already has: same thread, "further to our request", its own title.
  const parent = b.parent_batch_id ? await batchById(b.parent_batch_id) : null
  const [parentDraft] = parent?.draft_id ? await sbTry<Row[]>(`ai_drafts?id=eq.${enc(parent.draft_id)}&select=subject,to_email,cc,sent_at&limit=1`, []) : [null]
  const title = parent ? amendmentTitle(amendmentOps(ms), estimate, insurerName ? shortInsurer(insurerName) : null, policy.policy_number, b.revision) : batchTitle(counts, estimate, insurerName ? shortInsurer(insurerName) : null, policy.policy_number, type)
  const quotes = ms.filter(m => m.quote).map(m => ({ thread: m.reported_thread_id, quote: String(m.quote).slice(0, 160) }))

  // One open item per batch; the thread that reported the movements joins it.
  let itemId = b.work_item_id ?? parent?.work_item_id ?? null
  if (!itemId) {
    const [item] = await sb<Row[]>('work_items', { method: 'POST', headers: REP, body: JSON.stringify({
      company_id: b.company_id, client_name: company.company_name, case_type: type === 'member' ? 'member_movement' : 'endorsement', title,
      status: 'trs_to_act', last_activity_at: now.toISOString(), summary: `${ms.length} change${ms.length === 1 ? '' : 's'} reported between ${fmt(b.window_start)} and ${fmt(b.window_end)}.`,
      next_action: 'Approve the batch to the insurer', insurer_name: insurerName, policy_id: policy.id, policy_number: policy.policy_number,
      source: 'endorsements', confidence: 'high', evidence: quotes,
    }) })
    itemId = item.id as string
    const threads = Array.from(new Set(ms.map(m => m.reported_thread_id).filter((x): x is string => !!x)))
    if (threads.length) await sb('work_item_threads?on_conflict=thread_id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(threads.map(t => ({ work_item_id: itemId, thread_id: t, side: 'client', joined_by: 'movement', joined_evidence: 'reported the movements' }))) })
    await patchMovements(ms.map(m => m.id), { work_item_id: itemId })
    await batchEvent(itemId, 'reported', 'endorsements', { batch_id: b.id, movements: ms.map(m => ({ kind: m.kind, name: m.subject ?? m.member_name, effective_on: m.effective_on, last_day: m.last_day, quote: m.quote, read_by: m.read_by })) })
  } else await touchItem(itemId, { title, last_activity_at: now.toISOString() })

  if (!insurerName) {
    const q = 'The policy has no insurer on file, so the batch cannot be addressed. Set the insurer on the policy.'
    await patchBatch(b.id, { work_item_id: itemId, counts, estimate_total: estimate, needs_human: q })
    await touchItem(itemId, { needs_human: q })
    return { workItemId: itemId, question: q }
  }
  const desk = await insurerDesk(policy, insurerName)
  if (!desk.to.length) {
    const q = `No ${shortInsurer(insurerName)} desk is on file for ${lineFor(policy) ?? 'this line'}. Add the underwriter under Insurers, then the batch drafts itself.`
    await patchBatch(b.id, { work_item_id: itemId, counts, estimate_total: estimate, needs_human: q })
    await touchItem(itemId, { needs_human: q })
    return { workItemId: itemId, question: q }
  }

  const files = parent ? { attachments: [] as { filename: string; mime_type?: string; storage_url: string }[], sheetError: null as string | null } : await movementAttachments(policy, ms as unknown as Parameters<typeof movementAttachments>[1], company.company_name, insurerName)
  const subject = parent ? `Re: ${parentDraft?.subject ?? movementSubject(shortInsurer(insurerName), company.company_name, policy.policy_number, counts)}` : movementSubject(shortInsurer(insurerName), company.company_name, policy.policy_number, counts)
  const label = policy.label || policy.class_of_insurance || 'policy'
  const sentOn = parent?.sent_at ? fmt(parent.sent_at) : parentDraft?.sent_at ? fmt(parentDraft.sent_at) : null
  const body = [
    'Dear Underwriter,',
    '',
    parent
      ? `Further to our request${sentOn ? ` of ${sentOn}` : ''} on ${company.company_name}'s ${label}${policy.policy_number ? ` (Policy No. ${policy.policy_number})` : ''}, please amend as follows:`
      : `Please process the following ${type === 'vehicle' ? 'vehicle' : 'member'} movement${ms.length === 1 ? '' : 's'} on ${company.company_name}'s ${label}${policy.policy_number ? ` (Policy No. ${policy.policy_number})` : ''}:`,
    '',
    ...ms.map(parent ? amendLine : line),
    '',
    files.attachments.length ? `Attached: ${files.attachments.map(a => a.filename).join('; ')}.` : '',
    '',
    'Kindly issue the endorsement and the debit or credit note, or let us know if anything else is needed.',
    '',
    'Best regards,',
    '{owner_name}',
    'Trade Risk Solutions',
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n')
  // The latest batch on this policy carries the thread with the insurer; otherwise this starts one.
  const [prior] = await sbTry<Row[]>(`movement_batches?policy_id=eq.${enc(policy.id)}&thread_id=not.is.null&status=in.(sent,noted,billed,settled)&select=thread_id&order=sent_at.desc&limit=1`, [])
  const pairId = randomUUID()
  const insurerTo = parent && parentDraft?.to_email ? String(parentDraft.to_email).split(/,\s*/) : desk.to
  const draftId = await storeDraft(itemId, { thread_id: parent?.thread_id ?? b.thread_id ?? prior?.thread_id ?? null, to: insurerTo, cc: Array.from(new Set([...desk.cc, OPERATIONS])), subject, body, kind: parent ? 'movement_amendment' : 'movement_batch', party: 'insurer', pair_id: pairId, attachments: files.attachments, contact_id: desk.contactId }, true)

  const to = await reporters(ms)
  let pairDraftId: string | null = null
  if (to.length) {
    const ack = [
      `Dear ${to[0].split('@')[0].split(/[._]/)[0].replace(/^\w/, c => c.toUpperCase())},`,
      '',
      parent ? `Noted. We have asked ${shortInsurer(insurerName)} to amend our earlier request on ${label}${policy.policy_number ? ` (${policy.policy_number})` : ''} as follows:` : `Thank you. We have sent the following to ${shortInsurer(insurerName)} on ${label}${policy.policy_number ? ` (${policy.policy_number})` : ''}:`,
      '',
      ...ms.map(m => parent ? amendLine(m) : `${line(m)}${m.supersedes_id ? ' (replaces your earlier instruction)' : ''}`),
      '',
      estimate != null ? `Estimated premium adjustment: ${estimate < 0 ? '-' : ''}S$${Math.abs(estimate).toFixed(2)}, subject to the insurer's note.` : 'We will send the insurer\'s debit or credit note once issued.',
      '',
      'Best regards,',
      '{owner_name}',
      'Trade Risk Solutions',
    ].join('\n')
    pairDraftId = await storeDraft(itemId, { thread_id: ms[ms.length - 1].reported_thread_id, to: [to[0]], cc: Array.from(new Set([...to.slice(1, 3), OPERATIONS])), subject: `Re: ${subject}`, body: ack, kind: 'client_ack', party: 'client', pair_id: pairId }, false)
  }
  await patchMovements(ms.map(m => m.id), { sent_draft_id: draftId })
  await patchBatch(b.id, { status: 'ready', work_item_id: itemId, draft_id: draftId, pair_id: pairId, counts, estimate_total: estimate, needs_human: null, sheet_storage_url: files.attachments[0]?.storage_url ?? null })
  await touchItem(itemId, { needs_human: null, next_action: parent ? 'Approve the amendment to the insurer' : 'Approve the batch to the insurer' })
  await batchEvent(itemId, parent ? 'amendment_draft' : 'draft', 'endorsements', { batch_id: b.id, revision: b.revision, parent_batch_id: b.parent_batch_id, draft_id: draftId, pair_draft_id: pairDraftId, to: insurerTo, basis: parent ? 'same desk as the request' : desk.basis, sheet: files.attachments[0]?.filename ?? null, sheet_error: files.sheetError })
  return { workItemId: itemId, question: null }
}

/** Every open batch whose window has ended. Returns what happened per batch, for the log. */
export async function closeDueBatches(now = new Date()): Promise<{ closed: number; asked: number; skipped: number }> {
  let closed = 0, asked = 0, skipped = 0
  for (const b of await openBatches()) {
    if (!batchDue(b, now)) { skipped++; continue }
    try {
      const r = await prepareBatch(b, now)
      if (r.question) asked++; else closed++
    } catch (e) { console.error('[endorsements] close batch', b.id, e instanceof Error ? e.message : e); skipped++ }
  }
  return { closed, asked, skipped }
}

/** A batch a person asked to go now, ahead of its window. */
export async function closeBatchNow(batchId: string): Promise<{ workItemId: string | null; question: string | null }> {
  const [b] = await sbTry<BatchRow[]>(`movement_batches?id=eq.${enc(batchId)}&limit=1`, [])
  if (!b || b.status !== 'open') throw new Error('The batch is not open')
  return prepareBatch(b)
}

export { MIN }
