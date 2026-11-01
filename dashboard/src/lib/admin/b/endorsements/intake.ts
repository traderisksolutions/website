/**
 * A client's email about a mid-term change → movements on the policy, in the open batch.
 *
 * Reads the attachments first (a sheet is the list), then the body, with rules alone. The model
 * (agent.readMovementMail) is asked only when the rules read nothing and the mail still looks like
 * a movement; a model failure leaves a note on the case and the mail for a person, never a guess.
 */
import { sbTry, enc, bareEmail } from '@/lib/crm/db'
import * as store from '@/lib/placement/store'
import * as agent from '@/lib/policies/agent'
import { listMembers, recordMovement, findMember } from '@/lib/policies/members'
import { estimateMovements } from '@/lib/policies/movement-flow'
import { attachmentRefBytes, gmailRef } from '@/lib/storage/attachment-bytes'
import { isNoise } from '@/lib/documents/taxonomy'
import type { PolicyRow, PolicyMovement } from '@/lib/policies/types'
import { parseMovementBody } from './parse-body'
import { parseMovementRows } from './parse-sheet'
import { isSpreadsheet, sheetRows } from './read-xlsx'
import { lineFor, movementTypeFor } from './rules'
import { batch as batchById, openBatchFor, patchMovements, livePolicies, type MovementRow } from './store'
import { detectClientIntent, planClientAmendment, type Incoming } from './cues'
import { applyClientPlan, asOnFile, awaitingClient, movementsOnFile, relayClientAnswer } from './amendments'
import { prepareBatch } from './batches'
import type { ParsedMovement, Cadence } from './types'

const LOOKS_LIKE_MOVEMENT = /\b(resign\w*|last day|leaver|joiner|new (?:staff|hire|employee)|onboard\w*|add(?:ition)?\b|delet\w*|remov\w*|terminat\w*|movement|endorse\w*|include|exclude|update (?:the )?(?:member|staff|list)|vehicle|registration)\b/i

export type ReadOutcome = { movements: ParsedMovement[]; readBy: 'sheet' | 'body' | 'model' | null; looksLikeMovement: boolean }

/** Rules first: every spreadsheet on the mail, then the words. Pure apart from reading the files. */
export async function readMovements(msg: store.MailMessage, atts: store.MailAttachment[]): Promise<ReadOutcome> {
  const fromSheets: ParsedMovement[] = []
  for (const a of atts) {
    if (!isSpreadsheet(a.filename, a.mime_type) || isNoise(a.filename, a.mime_type)) continue
    const bytes = await attachmentRefBytes(gmailRef(a.id)).catch(() => null)
    if (!bytes) continue
    for (const sheet of sheetRows(bytes, a.filename)) fromSheets.push(...parseMovementRows(sheet.rows, a.filename))
  }
  const text = (msg.body_text ?? '').split(/\n(?:On .{10,120} wrote:|From: .+|-{3,} ?Original Message|_{10,})/)[0]
  const looks = LOOKS_LIKE_MOVEMENT.test(`${msg.subject ?? ''}\n${text}`) || fromSheets.length > 0
  if (fromSheets.length) return { movements: fromSheets, readBy: 'sheet', looksLikeMovement: true }
  const fromBody = parseMovementBody(text, msg.sent_at?.slice(0, 10) ?? null)
  if (fromBody.length) return { movements: fromBody, readBy: 'body', looksLikeMovement: true }
  return { movements: [], readBy: null, looksLikeMovement: looks }
}

/** The policy a change belongs to: the one whose number, insurer or class the mail names; the member-bearing one by default. */
export function pickPolicy<T extends PolicyRow>(policies: T[], text: string, wantType: 'member' | 'vehicle' | 'any'): T | null {
  const t = text.toLowerCase()
  const byNo = policies.filter(p => p.policy_number && p.policy_number.length >= 5 && t.includes(p.policy_number.toLowerCase()))
  if (byNo.length === 1) return byNo[0]
  const typed = wantType === 'any' ? policies : policies.filter(p => movementTypeFor(lineFor(p)) === wantType)
  if (typed.length === 1) return typed[0]
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const byInsurer = typed.filter(p => p.insurer && norm(p.insurer).slice(0, 8).length >= 3 && norm(t).includes(norm(p.insurer).slice(0, 8)))
  if (byInsurer.length === 1) return byInsurer[0]
  const byClass = typed.filter(p => {
    const words = `${p.class_of_insurance ?? ''} ${p.label ?? ''}`.toLowerCase().split(/[^a-z]+/).filter(w => w.length >= 4 && !/insurance|group|plan|policy/.test(w))
    return words.some(w => t.includes(w))
  })
  if (byClass.length === 1) return byClass[0]
  return typed[0] ?? null
}

export type IntakeResult = { handled: boolean; detail: string; policyId?: string; batchId?: string; movements?: number }

/**
 * The client's mail on one of its policies. Records every movement read, puts it in the open
 * batch, prices it, and says what happened. Nothing is sent from here.
 */
export async function intakeClientMail(companyId: string, msg: store.MailMessage, threadId: string, opts: { allowModel?: boolean } = {}): Promise<IntakeResult> {
  const policies = await livePolicies(companyId)
  if (!policies.length) return { handled: false, detail: 'no live policy' }
  const atts = await store.attachmentsFor(msg.id, !!msg.has_attachments)
  const read = await readMovements(msg, atts)
  const wantType = read.movements.some(m => m.movement_type === 'vehicle') ? 'vehicle' : read.movements.length ? 'member' : 'any'
  const policy = pickPolicy(policies, `${msg.subject ?? ''}\n${msg.body_text ?? ''}\n${atts.map(a => a.filename).join('\n')}`, wantType)
  if (!policy) return { handled: false, detail: 'no policy matched' }
  const company = await store.company(companyId)
  let movements = read.movements
  let readBy: string | null = read.readBy

  // Minds change. A withdrawal, a cancellation or a correction is settled against what is on file
  // before anything new is recorded; the client's answer to an insurer's question goes back to the insurer.
  const intent = detectClientIntent(msg.subject, msg.body_text)
  if (!movements.length && intent.intent === 'none') {
    const waiting = await awaitingClient(companyId, policy.id)
    if (waiting.length) {
      const r = await relayClientAnswer(waiting[0], policy, policy.insurer ?? 'the insurer', msg, threadId)
      if (r.handled) return { handled: true, detail: r.detail, policyId: policy.id, batchId: waiting[0].id, movements: 0 }
    }
  }
  if (intent.intent !== 'none' || movements.length) {
    const onFile = await movementsOnFile(policy.id)
    const incoming: Incoming[] = movements.map(m => ({ kind: m.kind, name: m.name, effective_on: m.effective_on, last_day: m.last_day, detail: m.detail }))
    let plan = planClientAmendment(intent.intent, incoming, onFile.map(asOnFile), threadId, m => onFile.find(x => x.id === m.id)?.reported_thread_id ?? null)
    if (intent.intent === 'withdraw' && !plan.length) {
      // "Ignore my last email" on a new thread: it means what the same person reported most recently.
      const recent = await recentByReporter(onFile, bareEmail(msg.from_address), msg.sent_at)
      plan = planClientAmendment('withdraw', [], recent.map(asOnFile), null, () => null)
    }
    if (plan.some(a => a.do !== 'new')) {
      const batch = await openBatchFor(policy)
      const applied = await applyClientPlan({ policy, companyId, threadId, messageId: msg.id, actor: 'endorsements' }, plan, onFile, batch, intent.cue)
      if (applied.amendmentBatchId) {
        // The insurer already has the request: the amendment is drafted now, on the same thread, for Today.
        const rev = await batchById(applied.amendmentBatchId)
        if (rev && rev.status === 'open') await prepareBatch(rev).catch(e => console.error('[endorsements] amendment draft', e instanceof Error ? e.message : e))
      }
      await store.log({ company_id: companyId, thread_id: threadId, message_id: msg.id, kind: 'movement', actor: 'endorsements',
        text: `Client ${intent.intent === 'withdraw' ? 'withdrew' : intent.intent === 'cancel' ? 'cancelled' : 'changed'} ${applied.cancelled + applied.superseded + applied.reversed} earlier change${applied.cancelled + applied.superseded + applied.reversed === 1 ? '' : 's'} on ${policy.label || policy.class_of_insurance || 'the policy'}${applied.amendmentBatchId ? '; amendment drafted to the insurer' : ''}${applied.reversed ? '; reversal requested' : ''}`,
        detail: { policy_id: policy.id, cue: intent.cue, cancelled: applied.cancelled, superseded: applied.superseded, reversed: applied.reversed, amendment_batch_id: applied.amendmentBatchId } })
      movements = read.movements.filter(m => applied.fresh.some(f => f.name === m.name && f.kind === m.kind))
      if (!movements.length) return { handled: true, detail: `amendment: ${applied.cancelled} cancelled, ${applied.superseded} changed, ${applied.reversed} reversed`, policyId: policy.id, batchId: applied.amendmentBatchId ?? batch.id, movements: 0 }
    }
  }
  if (!movements.length) {
    if (!read.looksLikeMovement) return { handled: false, detail: 'not a movement' }
    if (opts.allowModel === false) return { handled: false, detail: 'rules read nothing; model not allowed' }
    // The rules found nothing but the words say movement: the model reads it, if it can.
    const cls = await agent.classifyMovementMail(msg, atts, { companyName: company?.company_name ?? 'the client', policyLabel: policy.label || policy.class_of_insurance || 'policy' })
    if (!cls.isMovement || cls.confidence < 0.5) return { handled: false, detail: 'model says not a movement' }
    const members = await listMembers(policy.id)
    const r = await agent.readMovementMail(msg, atts, { companyName: company?.company_name ?? 'the client', policyLabel: policy.label || policy.class_of_insurance || 'policy', members })
    if (!r || !r.movements.length) {
      await store.log({ company_id: companyId, thread_id: threadId, message_id: msg.id, kind: 'reply', actor: 'endorsements', text: 'Client wrote about a change to the policy; neither the rules nor the model could list it. Open the thread.', detail: { policy_id: policy.id } })
      return { handled: true, detail: 'unread', policyId: policy.id }
    }
    movements = r.movements.map(m => ({ kind: m.kind, movement_type: 'member', name: m.member_name, effective_on: m.effective_on, last_day: typeof m.detail.last_day === 'string' ? m.detail.last_day : null, relationship: m.relationship, detail: m.detail, source: 'model', quote: '' }))
    readBy = 'model'
  }
  const batch = await openBatchFor(policy)
  const members = await listMembers(policy.id)
  const rows: PolicyMovement[] = []
  for (const m of movements) {
    // A leaver or change already reported on an open batch is not reported twice.
    const dup = await sbTry<{ id: string }[]>(`policy_movements?policy_id=eq.${enc(policy.id)}&kind=eq.${m.kind}&member_name=ilike.${enc(m.name)}&status=in.(reported,sent)&select=id&limit=1`, [])
    if (dup.length) continue
    const matched = m.kind !== 'join' ? findMember(members, m.name) : null
    try {
      const row = await recordMovement(policy.id, companyId, {
        kind: m.kind, member_name: matched?.member_name ?? m.name, relationship: m.relationship, effective_on: m.effective_on,
        detail: { ...m.detail, ...(m.last_day ? { last_day: m.last_day } : {}) }, reported_thread_id: threadId, reported_message_id: msg.id,
      })
      rows.push(row)
    } catch (e) { console.error('[endorsements] movement write', e instanceof Error ? e.message : e) }
  }
  if (!rows.length) return { handled: true, detail: 'already on file', policyId: policy.id, batchId: batch.id, movements: 0 }
  const type = movementTypeFor(lineFor(policy))
  await patchMovements(rows.map(r => r.id), { batch_id: batch.id, movement_type: type, read_by: readBy, quote: null })
  for (const r of rows) {
    const src = movements.find(m => m.name.toLowerCase() === r.member_name.toLowerCase() && m.kind === r.kind)
    if (src?.quote) await patchMovements([r.id], { quote: src.quote.slice(0, 400), subject: type === 'vehicle' ? src.name : null })
  }
  await estimateMovements(policy, rows as MovementRow[]).catch(e => console.error('[endorsements] estimate', e instanceof Error ? e.message : e))
  const reporter = bareEmail(msg.from_address)
  await store.log({ company_id: companyId, thread_id: threadId, message_id: msg.id, kind: 'movement', actor: 'endorsements',
    text: `Client reported ${rows.length} change${rows.length === 1 ? '' : 's'} on ${policy.label || policy.class_of_insurance || 'the policy'} (${readBy}); in the ${batch.cadence} batch from ${batch.window_start}`,
    detail: { policy_id: policy.id, batch_id: batch.id, movement_ids: rows.map(r => r.id), reporter } })
  return { handled: true, detail: `movements ${rows.length} (${readBy})`, policyId: policy.id, batchId: batch.id, movements: rows.length }
}

/** The movements a reporter sent in the week before this mail, newest first. */
async function recentByReporter(onFile: MovementRow[], reporter: string, sentAt: string | null): Promise<MovementRow[]> {
  if (!reporter) return []
  const ids = Array.from(new Set(onFile.map(m => m.reported_message_id).filter((x): x is string => !!x)))
  if (!ids.length) return []
  const since = new Date(Date.parse(sentAt ?? new Date().toISOString()) - 7 * 86_400_000).toISOString()
  const msgs = await sbTry<{ id: string; from_address: string | null; sent_at: string | null }[]>(`email_messages?id=in.(${ids.join(',')})&sent_at=gte.${enc(since)}&select=id,from_address,sent_at&order=sent_at.desc`, [])
  const mine = msgs.filter(m => bareEmail(m.from_address) === reporter)
  if (!mine.length) return []
  const latest = mine[0].id
  return onFile.filter(m => m.reported_message_id === latest)
}

export type { Cadence }
