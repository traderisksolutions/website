/**
 * What the loop does when a mind changes. The reading is in cues.ts; this file is the effects:
 * versioned movements, revision batches on the insurer's own thread, reversal requests, the
 * insurer's queries relayed to the client and the client's answers relayed back, pending drafts
 * withdrawn and regenerated. Nothing is deleted; every row links to what it replaces, and every
 * step goes on the case and into the company ledger through batchEvent.
 */
import { randomUUID } from 'node:crypto'
import { sb, sbTry, enc, bareEmail, isInternal } from '@/lib/crm/db'
import * as store from '@/lib/placement/store'
import { recordMovement, findMember, listMembers } from '@/lib/policies/members'
import { estimateMovements } from '@/lib/policies/movement-flow'
import { attachmentRefBytes, gmailRef } from '@/lib/storage/attachment-bytes'
import { storeImportFile } from '@/lib/debit-note-storage'
import { isNoise } from '@/lib/documents/taxonomy'
import { addDays } from '@/lib/admin/b/dates'
import { OPERATIONS } from '@/lib/admin/b/router'
import type { PolicyRow } from '@/lib/policies/types'
import { askedItems, ownText, type Action, type Incoming, type OnFile } from './cues'
import { lineFor, movementTypeFor } from './rules'
import { batch as batchById, batchEvent, batchMovements, patchBatch, patchMovements, touchItem, type MovementRow } from './store'
import type { BatchRow } from './types'

type Row = Record<string, any>
const REP = { Prefer: 'return=representation' }
const MIN = { Prefer: 'return=minimal' }
const now = () => new Date().toISOString()
const today = () => now().slice(0, 10)

/** Movements on the policy a new instruction can touch: everything not cancelled or settled. */
export async function movementsOnFile(policyId: string): Promise<MovementRow[]> {
  return sbTry<MovementRow[]>(`policy_movements?policy_id=eq.${enc(policyId)}&status=in.(reported,sent,noted,billed)&order=created_at.asc`, [])
}

export const asOnFile = (m: MovementRow): OnFile => ({ id: m.id, kind: m.kind, member_name: m.subject ?? m.member_name, effective_on: m.effective_on, last_day: m.last_day, status: m.status, batch_id: m.batch_id, version: (m as Row).version ?? 1, transaction_id: m.transaction_id })

/** Pending drafts on a case that a change has made wrong: withdrawn, never sent. The case drafts again. */
export async function withdrawDrafts(workItemId: string | null, reason: string): Promise<number> {
  if (!workItemId) return 0
  const rows = await sbTry<Row[]>(`ai_drafts?work_item_id=eq.${enc(workItemId)}&status=in.(pending,draft)&select=id`, [])
  if (!rows.length) return 0
  await sb(`ai_drafts?id=in.(${rows.map(r => r.id).join(',')})`, { method: 'PATCH', headers: MIN, body: JSON.stringify({ status: 'rejected', rejection_note: reason }) })
  await touchItem(workItemId, { draft_id: null })
  return rows.length
}

/** A movement withdrawn or replaced: cancelled with its reason; the member register put back as it was. */
export async function cancelMovement(m: MovementRow, reason: string, actor: string): Promise<void> {
  await patchMovements([m.id], { status: 'cancelled', cancelled_at: now(), cancel_reason: reason, next_chase_at: null })
  if (m.member_id) {
    if (m.kind === 'leave') await sb(`policy_members?id=eq.${enc(m.member_id)}`, { method: 'PATCH', headers: MIN, body: JSON.stringify({ status: 'active', left_on: null }) })
    if (m.kind === 'join') await sb(`policy_members?id=eq.${enc(m.member_id)}`, { method: 'PATCH', headers: MIN, body: JSON.stringify({ status: 'left', left_on: m.effective_on ?? today() }) })
  }
  await batchEvent(m.work_item_id, 'cancelled', actor, { movement_id: m.id, name: m.subject ?? m.member_name, kind: m.kind, version: (m as Row).version ?? 1, reason, was: m.status, batch_id: m.batch_id })
}

/**
 * The open revision of a batch the insurer already has: the amendment goes on the same thread as
 * a reply, numbered revision n+1. One open revision per parent; a second change joins it.
 */
export async function revisionBatchFor(parent: BatchRow, policy: PolicyRow): Promise<BatchRow> {
  const root = parent.parent_batch_id ? (await batchById(parent.parent_batch_id)) ?? parent : parent
  const [open] = await sbTry<BatchRow[]>(`movement_batches?parent_batch_id=eq.${enc(root.id)}&status=in.(open,ready)&order=revision.desc&limit=1`, [])
  if (open) return open
  const [latest] = await sbTry<BatchRow[]>(`movement_batches?or=(id.eq.${enc(root.id)},parent_batch_id.eq.${enc(root.id)})&select=revision&order=revision.desc&limit=1`, [])
  const d = today()
  const [made] = await sb<BatchRow[]>('movement_batches', { method: 'POST', headers: REP, body: JSON.stringify({
    policy_id: policy.id, company_id: policy.company_id, insurer_company_id: policy.chosen_insurer_company_id ?? null, cadence: 'immediate',
    window_start: d, window_end: d, status: 'open', revision: Number(latest?.revision ?? root.revision ?? 1) + 1, parent_batch_id: root.id,
    thread_id: root.thread_id ?? parent.thread_id, work_item_id: root.work_item_id ?? parent.work_item_id,
  }) })
  return made
}

/** An open batch that lost or gained a movement before sending: counts and drafts are redone when it closes. */
async function reopenBatch(batchId: string | null, reason: string): Promise<void> {
  if (!batchId) return
  const b = await batchById(batchId)
  if (!b) return
  if (b.status === 'ready') {
    await withdrawDrafts(b.work_item_id, reason)
    await patchBatch(b.id, { status: 'open', draft_id: null, pair_id: null, needs_human: null })
    if (b.work_item_id) await touchItem(b.work_item_id, { next_action: 'The batch is redrafted at its next close', last_activity_at: now() })
  }
}

type Ctx = { policy: PolicyRow; companyId: string; threadId: string; messageId: string; actor: string }

/** Where an amendment movement goes: the open batch when the original was never sent, else the revision of the batch the insurer has. */
async function targetBatch(ctx: Ctx, original: MovementRow, openBatch: BatchRow): Promise<{ batch: BatchRow; amendment: boolean }> {
  if (original.status === 'reported' || !original.batch_id) return { batch: openBatch, amendment: false }
  const parent = await batchById(original.batch_id)
  if (!parent || parent.status === 'open' || parent.status === 'ready') return { batch: parent ?? openBatch, amendment: false }
  return { batch: await revisionBatchFor(parent, ctx.policy), amendment: true }
}

async function writeAmendmentRow(ctx: Ctx, target: BatchRow, inc: Incoming, detail: Row, original: MovementRow | null): Promise<MovementRow> {
  const members = await listMembers(ctx.policy.id)
  const matched = inc.kind !== 'join' ? findMember(members, inc.name) : null
  const row = await recordMovement(ctx.policy.id, ctx.companyId, {
    kind: inc.kind, member_name: matched?.member_name ?? inc.name, relationship: null, effective_on: inc.effective_on,
    detail: { ...inc.detail, ...(inc.last_day ? { last_day: inc.last_day } : {}), ...detail }, reported_thread_id: ctx.threadId, reported_message_id: ctx.messageId,
  })
  const type = movementTypeFor(lineFor(ctx.policy))
  await patchMovements([row.id], {
    batch_id: target.id, work_item_id: target.work_item_id, movement_type: original?.movement_type ?? type, read_by: 'body', subject: original?.subject ?? null,
    version: original ? Number((original as Row).version ?? 1) + 1 : 1, supersedes_id: original?.id ?? null, reversal_of_transaction_id: detail.amendment === 'reverse' ? original?.transaction_id ?? null : null,
  })
  const [fresh] = await sbTry<MovementRow[]>(`policy_movements?id=eq.${enc(row.id)}&select=*&limit=1`, [])
  return fresh ?? (row as MovementRow)
}

export type ApplyResult = { cancelled: number; superseded: number; reversed: number; fresh: Incoming[]; amendmentBatchId: string | null; touchedBatches: string[] }

/**
 * Carries out a plan. Cancels and supersessions before sending stay in the open batch (redrafted
 * at close); after sending they become the revision the insurer gets; after the insurer's note
 * they become a reversal request. Returns the instructions that are new, for the normal intake.
 */
export async function applyClientPlan(ctx: Ctx, plan: Action[], onFile: MovementRow[], openBatch: BatchRow, cue: string | null): Promise<ApplyResult> {
  const r: ApplyResult = { cancelled: 0, superseded: 0, reversed: 0, fresh: [], amendmentBatchId: null, touchedBatches: [] }
  const byId = new Map(onFile.map(m => [m.id, m]))
  for (const a of plan) {
    if (a.do === 'new') { r.fresh.push(a.with); continue }
    const m = byId.get(a.movement.id)
    if (!m) continue
    const { batch: target, amendment } = await targetBatch(ctx, m, openBatch)
    if (a.do === 'cancel') {
      await cancelMovement(m, a.reason, ctx.actor)
      if (amendment) {
        // The insurer already has it: the revision carries the cancellation as a line to the insurer.
        const row = await writeAmendmentRow(ctx, target, { kind: 'change', name: m.subject ?? m.member_name, effective_on: m.effective_on, last_day: m.last_day, detail: {} }, { amendment: 'cancel', of_kind: m.kind, of_movement_id: m.id, cue }, m)
        await patchMovements([row.id], { estimate_amount: m.estimate_amount != null ? -Number(m.estimate_amount) : null })
        r.amendmentBatchId = target.id
      } else await reopenBatch(m.batch_id, 'a movement was withdrawn before sending')
      r.cancelled++
      if (!r.touchedBatches.includes(target.id)) r.touchedBatches.push(target.id)
      await batchEvent(m.work_item_id ?? target.work_item_id, amendment ? 'amended' : 'withdrawn', ctx.actor, { movement_id: m.id, name: m.subject ?? m.member_name, kind: m.kind, reason: a.reason, cue, revision: amendment ? target.revision : null, batch_id: target.id })
      continue
    }
    if (a.do === 'supersede') {
      await cancelMovement(m, 'superseded', ctx.actor)
      const row = await writeAmendmentRow(ctx, target, a.with, { amendment: amendment ? 'replace' : undefined, cue, reason: a.reason }, m)
      await estimateMovements(ctx.policy, [row]).catch(() => 0)
      if (amendment) r.amendmentBatchId = target.id; else await reopenBatch(m.batch_id, 'a movement changed before sending')
      r.superseded++
      if (!r.touchedBatches.includes(target.id)) r.touchedBatches.push(target.id)
      await batchEvent(m.work_item_id ?? target.work_item_id, 'amended', ctx.actor, { movement_id: row.id, supersedes: m.id, version: Number((m as Row).version ?? 1) + 1, name: a.with.name, kind: a.with.kind, effective_on: a.with.effective_on, last_day: a.with.last_day, reason: a.reason, cue, revision: amendment ? target.revision : null, batch_id: target.id })
      continue
    }
    if (a.do === 'reverse') {
      // The insurer noted it (and TRS may have billed it): ask the insurer to reverse against its note; the TRS note is reversed when that arrives.
      const parent = m.batch_id ? await batchById(m.batch_id) : null
      const rev = parent ? await revisionBatchFor(parent, ctx.policy) : openBatch
      const opposite = m.kind === 'leave' ? 'join' : m.kind === 'join' ? 'leave' : 'change'
      const row = await writeAmendmentRow(ctx, rev, { kind: opposite, name: m.subject ?? m.member_name, effective_on: m.effective_on, last_day: null, detail: {} }, { amendment: 'reverse', of_kind: m.kind, of_movement_id: m.id, cue, reason: a.reason }, m)
      await patchMovements([row.id], { estimate_amount: m.estimate_amount != null ? -Number(m.estimate_amount) : null })
      await patchMovements([m.id], { detail: { ...(m.detail ?? {}), reversed_by: row.id, reversal_reason: a.reason } })
      r.reversed++
      r.amendmentBatchId = rev.id
      if (!r.touchedBatches.includes(rev.id)) r.touchedBatches.push(rev.id)
      await batchEvent(m.work_item_id ?? rev.work_item_id, 'reversal_requested', ctx.actor, { movement_id: row.id, reverses_movement: m.id, transaction_id: m.transaction_id, name: m.subject ?? m.member_name, was: m.status, reason: a.reason, cue, revision: rev.revision, batch_id: rev.id })
    }
  }
  return r
}

// ── Insurer queries, rejections and the client's answers ────────────────────────────────────

/** The sent batch an insurer's mail is about: the one on its thread, else the latest sent on the policy. */
export async function sentBatchFor(policyId: string, threadId: string): Promise<BatchRow | null> {
  const [onThread] = await sbTry<BatchRow[]>(`movement_batches?policy_id=eq.${enc(policyId)}&thread_id=eq.${enc(threadId)}&status=in.(sent,noted)&order=sent_at.desc&limit=1`, [])
  if (onThread) return onThread
  const [latest] = await sbTry<BatchRow[]>(`movement_batches?policy_id=eq.${enc(policyId)}&status=in.(sent,noted)&order=sent_at.desc&limit=1`, [])
  return latest ?? null
}

async function clientReporters(ms: MovementRow[]): Promise<string[]> {
  const ids = Array.from(new Set(ms.map(m => m.reported_message_id).filter((x): x is string => !!x)))
  if (!ids.length) return []
  const msgs = await sbTry<Row[]>(`email_messages?id=in.(${ids.join(',')})&select=from_address,sent_at&order=sent_at.desc`, [])
  return Array.from(new Set(msgs.map(m => bareEmail(m.from_address)).filter(e => e && !isInternal(e))))
}

async function draft(workItemId: string, d: { thread_id: string | null; to: string[]; cc: string[]; subject: string; body: string; kind: string; party: 'client' | 'insurer'; pair_id: string; attachments?: { filename: string; mime_type?: string; storage_url: string }[] }, primary: boolean): Promise<string> {
  const [contact] = await sbTry<Row[]>(`contacts?email=ilike.${enc(d.to[0])}&select=id&limit=1`, [])
  const [row] = await sb<Row[]>('ai_drafts', { method: 'POST', headers: REP, body: JSON.stringify({
    contact_id: contact?.id ?? null, thread_id: d.thread_id, channel: 'email', email_type: 'CASE_WORK', status: 'pending', generated_by: 'template',
    to_email: d.to.join(', '), cc: d.cc.join(', ') || null, subject: d.subject, body: d.body, attachments: d.attachments ?? [],
    work_item_id: workItemId, pair_id: d.pair_id, party: d.party, context_used: { agent: 'endorsements', kind: d.kind },
  }) })
  if (primary) await touchItem(workItemId, { draft_id: row.id })
  return row.id as string
}

const sign = ['', 'Best regards,', '{owner_name}', 'Trade Risk Solutions']
const firstName = (email: string) => email.split('@')[0].split(/[._]/)[0].replace(/^\w/, c => c.toUpperCase())

/**
 * The insurer asks for something (a date of birth, a passport, a form) or will not take a member.
 * The question goes to the client who reported the change, the insurer gets a one-line ack on its
 * thread, the batch waits on the client and the chase clock pauses.
 */
export async function handleInsurerQuery(policy: PolicyRow, insurerName: string, msg: store.MailMessage, threadId: string, intent: 'query' | 'reject', cue: string): Promise<{ handled: boolean; detail: string }> {
  const b = await sentBatchFor(policy.id, threadId)
  if (!b || !b.work_item_id) return { handled: false, detail: 'no sent batch to attach the query to' }
  const ms = await batchMovements(b.id)
  const asked = askedItems(msg.body_text)
  const own = ownText(msg.body_text).replace(/\s+/g, ' ').trim().slice(0, 1200)
  const named = ms.filter(m => own.toLowerCase().includes((m.subject ?? m.member_name).toLowerCase()))
  const about = (named.length ? named : ms).map(m => m.subject ?? m.member_name)
  const label = policy.label || policy.class_of_insurance || 'the policy'
  const pairId = randomUUID()
  const to = await clientReporters(ms)
  const from = bareEmail(msg.from_address)

  if (intent === 'reject') {
    for (const m of named) await cancelMovement(m, 'insurer rejected', 'endorsements')
    await patchBatch(b.id, { sub_state: 'awaiting_client', awaiting_since: now(), question: cue, next_chase_at: null })
    await batchEvent(b.work_item_id, 'insurer_rejected', 'endorsements', { batch_id: b.id, names: named.map(m => m.subject ?? m.member_name), cue, message_id: msg.id })
    if (to.length) {
      const body = [`Dear ${firstName(to[0])},`, '', `${insurerName} has come back on ${label}${policy.policy_number ? ` (${policy.policy_number})` : ''} and is not able to take the following as requested:`, '', ...about.map(n => `- ${n}`), '', `The insurer's words: "${cue}".`, '', 'Let us know how you would like to proceed, and we will take it up with the insurer.', ...sign].join('\n')
      await draft(b.work_item_id, { thread_id: ms[ms.length - 1]?.reported_thread_id ?? null, to: [to[0]], cc: Array.from(new Set([...to.slice(1, 3), OPERATIONS])), subject: `${label}: ${insurerName} cannot process ${about.join(', ')}`, body, kind: 'insurer_rejected', party: 'client', pair_id: pairId }, true)
      await touchItem(b.work_item_id, { status: 'trs_to_act', next_action: 'Tell the client the insurer declined; ask how to proceed', needs_human: null, last_activity_at: now() })
    } else await touchItem(b.work_item_id, { status: 'trs_to_act', needs_human: `${insurerName} declined ${about.join(', ')} and no client address is on the case. Tell the client.`, last_activity_at: now() })
    return { handled: true, detail: `insurer rejected ${named.length}` }
  }

  await patchBatch(b.id, { sub_state: 'awaiting_client', awaiting_since: now(), question: (asked.join(' ') || cue).slice(0, 1000), next_chase_at: null })
  await batchEvent(b.work_item_id, 'insurer_query', 'endorsements', { batch_id: b.id, asked, cue, names: about, message_id: msg.id })
  if (!to.length) { await touchItem(b.work_item_id, { status: 'trs_to_act', needs_human: `${insurerName} asks: ${(asked[0] ?? cue).slice(0, 200)}. No client address is on the case; ask the client.`, last_activity_at: now() }); return { handled: true, detail: 'query; no client address' } }
  const body = [
    `Dear ${firstName(to[0])},`, '',
    `${insurerName} needs the following before it can process the change${ms.length === 1 ? '' : 's'} on ${label}${policy.policy_number ? ` (${policy.policy_number})` : ''}${named.length ? ` for ${about.join(', ')}` : ''}:`, '',
    ...(asked.length ? asked.map(s => `- ${s}`) : [`- ${cue}`]), '',
    'Please reply with the details and we will pass them on the same day.', ...sign,
  ].join('\n')
  await draft(b.work_item_id, { thread_id: ms[ms.length - 1]?.reported_thread_id ?? null, to: [to[0]], cc: Array.from(new Set([...to.slice(1, 3), OPERATIONS])), subject: `${label}: ${insurerName} needs ${asked.length ? 'further details' : 'your input'}${named.length ? ` for ${about.join(', ')}` : ''}`, body, kind: 'request_info', party: 'client', pair_id: pairId }, true)
  if (from) await draft(b.work_item_id, { thread_id: threadId, to: [from], cc: [OPERATIONS], subject: `Re: ${msg.subject ?? 'movement request'}`, body: ['Dear Underwriter,', '', 'Noted with thanks. We are getting the details from the client and will revert.', ...sign].join('\n'), kind: 'insurer_ack', party: 'insurer', pair_id: pairId }, false)
  await touchItem(b.work_item_id, { status: 'trs_to_act', next_action: 'Send the insurer\'s question to the client', needs_human: null, last_activity_at: now() })
  return { handled: true, detail: `query relayed: ${asked.length} items` }
}

/** Batches on a company's policies that wait on the client for an insurer's question. */
export async function awaitingClient(companyId: string, policyId?: string | null): Promise<BatchRow[]> {
  return sbTry<BatchRow[]>(`movement_batches?company_id=eq.${enc(companyId)}&sub_state=eq.awaiting_client${policyId ? `&policy_id=eq.${enc(policyId)}` : ''}&select=*&order=awaiting_since.asc&limit=20`, [])
}

/**
 * The client answers the insurer's question: the answer goes back on the insurer's thread with the
 * client's files, the wait ends and the chase clock starts again from today.
 */
export async function relayClientAnswer(b: BatchRow, policy: PolicyRow, insurerName: string, msg: store.MailMessage, threadId: string): Promise<{ handled: boolean; detail: string }> {
  if (!b.work_item_id) return { handled: false, detail: 'batch has no case' }
  const [orig] = b.draft_id ? await sbTry<Row[]>(`ai_drafts?id=eq.${enc(b.draft_id)}&select=to_email,cc,subject,contact_id,thread_id,sent_thread_id&limit=1`, []) : [null]
  if (!orig?.to_email) return { handled: false, detail: 'no insurer address on the batch' }
  const atts = await store.attachmentsFor(msg.id, !!msg.has_attachments, 20_000)
  const files: { filename: string; mime_type?: string; storage_url: string }[] = []
  for (const a of atts.filter(a => !isNoise(a.filename, a.mime_type))) {
    const bytes = await attachmentRefBytes(gmailRef(a.id)).catch(() => null)
    if (!bytes) continue
    const url = await storeImportFile(a.filename, bytes, a.mime_type ?? 'application/octet-stream').catch(() => null)
    if (url) files.push({ filename: a.filename, mime_type: a.mime_type ?? undefined, storage_url: url })
  }
  const answer = ownText(msg.body_text).trim().slice(0, 2500)
  const body = [
    'Dear Underwriter,', '',
    `Further to your query${b.awaiting_since ? ` of ${b.awaiting_since.slice(0, 10)}` : ''} on ${policy.label || policy.class_of_insurance || 'the policy'}${policy.policy_number ? ` (Policy No. ${policy.policy_number})` : ''}, our client advises:`, '',
    ...answer.split('\n').map(l => `> ${l}`), '',
    files.length ? `Attached: ${files.map(f => f.filename).join('; ')}.` : '',
    '', 'Kindly proceed with the endorsement, or let us know if anything else is needed.', ...sign,
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n')
  const pairId = randomUUID()
  const draftId = await draft(b.work_item_id, { thread_id: orig.sent_thread_id ?? b.thread_id ?? orig.thread_id ?? null, to: String(orig.to_email).split(/,\s*/), cc: [OPERATIONS], subject: `Re: ${orig.subject ?? 'movement request'}`, body, kind: 'client_answer', party: 'insurer', pair_id: pairId, attachments: files }, true)
  const from = bareEmail(msg.from_address)
  if (from && !isInternal(from)) await draft(b.work_item_id, { thread_id: threadId, to: [from], cc: [OPERATIONS], subject: `Re: ${msg.subject ?? 'your reply'}`, body: [`Dear ${firstName(from)},`, '', `Thank you. We have passed this on to ${insurerName} and will update you once the endorsement is issued.`, ...sign].join('\n'), kind: 'client_ack', party: 'client', pair_id: pairId }, false)
  await patchBatch(b.id, { sub_state: null, awaiting_since: null, next_chase_at: addDays(today(), 7) + 'T01:00:00Z' })
  await touchItem(b.work_item_id, { status: 'trs_to_act', next_action: 'Send the client\'s answer to the insurer', needs_human: null, last_activity_at: now() })
  await batchEvent(b.work_item_id, 'client_answered', 'endorsements', { batch_id: b.id, draft_id: draftId, files: files.map(f => f.filename), message_id: msg.id, waited_since: b.awaiting_since })
  return { handled: true, detail: `answer relayed with ${files.length} file${files.length === 1 ? '' : 's'}` }
}

// ── Re-issued insurer notes ─────────────────────────────────────────────────────────────────

/**
 * The earlier transaction a re-issued note replaces: the latest on the policy that settles the
 * same movements, else the latest whose number differs only by a suffix, else the latest note
 * within 90 days when the insurer says so in words.
 */
export async function findSupersededTransaction(policyId: string, latest: { id: string; note_no: string | null; member_names: string[] | null; issued_on: string | null }, matchedNames: string[], saidSo: boolean): Promise<Row | null> {
  const rows = await sbTry<Row[]>(`policy_transactions?policy_id=eq.${enc(policyId)}&id=neq.${enc(latest.id)}&superseded_at=is.null&select=id,note_no,amount,kind,member_names,issued_on,debit_note_id,batch_id&order=created_at.desc&limit=50`, [])
  const names = new Set([...(latest.member_names ?? []), ...matchedNames].map(n => n.toLowerCase().trim()).filter(Boolean))
  const base = (n: string | null) => String(n ?? '').toUpperCase().replace(/[\s/-]+/g, '').replace(/(R|REV|A|B|C)?\d{0,2}$/, '')
  const byNames = names.size ? rows.find(r => (r.member_names ?? []).some((n: string) => names.has(n.toLowerCase().trim()))) : null
  if (byNames) return byNames
  const byNo = latest.note_no ? rows.find(r => r.note_no && base(r.note_no) === base(latest.note_no) && base(r.note_no).length >= 6) : null
  if (byNo) return byNo
  if (saidSo && latest.issued_on) { const cutoff = addDays(latest.issued_on, -90); return rows.find(r => r.issued_on && r.issued_on >= cutoff) ?? null }
  return null
}
