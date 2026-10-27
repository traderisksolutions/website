/**
 * The mail loop on a live EB policy, after bind.
 *
 *   client mail  "X joined on 1 Nov, Y resigned"  → movements (reported) → draft to the insurer
 *   insurer mail with a debit / credit note        → transactions → the movements it settles
 *
 * Called from placement's handleInbound when the thread is not part of a placement. Drafts land
 * in ai_drafts as pending with email_type POLICY_MOVEMENT; a person approves and sends them.
 */
import { sbTry, bareEmail, emailDomain, isInternal } from '@/lib/crm/db'
import * as store from '@/lib/placement/store'
import type { InboundResult } from '@/lib/placement/workflow'
import { normInsurer } from '@/lib/insurers'
import * as agent from './agent'
import { liveEbPolicies, listMembers, recordMovement, openMovements } from './members'
import { matchMovement, noteMovements, recordTransaction } from './transactions'
import type { PolicyMovement, PolicyRow } from './types'

export const MOVEMENT_DRAFT_TYPE = 'POLICY_MOVEMENT'

type InsurerCompanyRow = { id: string; company_name: string; domains: string[] | null; domain: string | null }

async function insurerCompany(id: string | null): Promise<InsurerCompanyRow | null> {
  if (!id) return null
  const rows = await sbTry<InsurerCompanyRow[]>(`companies?id=eq.${id}&select=id,company_name,domains,domain&limit=1`, [])
  return rows[0] ?? null
}

/** Is the sender at this insurer: its domains first, else its name's words in the domain. */
export function senderIsInsurer(senderDomain: string, insurer: { company_name: string; domains: string[] | null; domain: string | null } | null, insurerName: string | null): boolean {
  if (!senderDomain) return false
  const domains = [...(insurer?.domains ?? []), insurer?.domain ?? ''].map(d => d.trim().toLowerCase()).filter(Boolean)
  if (domains.some(d => senderDomain === d || senderDomain.endsWith(`.${d}`))) return true
  const host = senderDomain.replace(/\./g, '')
  const words = `${insurer?.company_name ?? ''} ${insurerName ?? ''}`.toLowerCase().split(/[^a-z0-9]+/)
    .filter(w => w.length >= 3 && !/^(insurance|assurance|singapore|pte|ltd|limited|company|general|group|the|and|health|life)$/.test(w))
  return words.some(w => host.includes(w)) || (!!normInsurer(insurerName) && normInsurer(insurerName).length >= 3 && host.includes(normInsurer(insurerName)))
}

const label = (p: PolicyRow) => p.label || p.class_of_insurance || p.product_line || 'Employee benefits'
const money = (currency: string, amount: number) => {
  const sym = currency === 'SGD' ? 'S$' : `${currency} `
  const abs = Math.abs(amount).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${amount < 0 ? '-' : ''}${sym}${abs}`
}
const monthYear = (d: string | null) => d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-SG', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : null
const period = (a: string | null, b: string | null) => {
  const x = monthYear(a), y = monthYear(b)
  return x && y ? `${x.split(' ')[0]}–${y.split(' ')[0]}` : (x ?? y ?? null)
}
const countText = (ms: Pick<PolicyMovement, 'kind'>[]) => {
  const j = ms.filter(m => m.kind === 'join').length, l = ms.filter(m => m.kind === 'leave').length, c = ms.filter(m => m.kind === 'change').length
  const parts = [j ? `${j} joiner${j === 1 ? '' : 's'}` : '', l ? `${l} leaver${l === 1 ? '' : 's'}` : '', c ? `${c} change${c === 1 ? '' : 's'}` : ''].filter(Boolean)
  return parts.join(', ') || 'no movements'
}

// ── The request to the insurer ──────────────────────────────────────────────────────────────

/**
 * Drafts one email to the chosen insurer's EB contact covering every movement given, writes it
 * to ai_drafts (POLICY_MOVEMENT) and stamps the movements with the draft id. Throws when the
 * policy has no insurer or no contact on file for it.
 */
export async function requestMovements(policy: PolicyRow, movements: PolicyMovement[], actor: string): Promise<{ draftId: string; insurerName: string }> {
  if (movements.length === 0) throw new Error('No reported movements to request')
  if (!policy.company_id) throw new Error('Policy has no company')
  const company = await store.company(policy.company_id)
  const insurer = await insurerCompany(policy.chosen_insurer_company_id)
  const insurerName = insurer?.company_name ?? policy.insurer
  if (!insurerName) throw new Error('No insurer chosen on this policy')

  const routes = (await store.insurerRoutes([policy.product_line ?? 'employee_benefits', 'employee_benefits', 'group_health']))
    .filter(r => (insurer && r.insurer_company_id === insurer.id) || normInsurer(r.insurer_name) === normInsurer(insurerName))
  const to = routes[0]
  if (!to) throw new Error(`No contact on file for ${insurerName} on employee benefits. Add one under Companies → Insurers.`)

  const text = await agent.draftMovementRequest({
    insurerName, contactName: to.name, clientName: company?.company_name ?? 'the client', policyLabel: label(policy), policyNumber: policy.policy_number,
    movements: movements.map(m => ({
      kind: m.kind, member_name: m.member_name, relationship: m.relationship, effective_on: m.effective_on,
      dob: typeof m.detail?.dob === 'string' ? m.detail.dob : null, category: typeof m.detail?.category === 'string' ? m.detail.category : null,
      plan: typeof m.detail?.plan === 'string' ? m.detail.plan : null,
    })),
  })
  if (!text) throw new Error('The agent could not write the request')

  // The latest thread with this insurer on this company carries the draft; otherwise it starts one.
  const prior = insurer ? await sbTry<{ thread_id: string | null }[]>(`placement_dispatches?company_id=eq.${policy.company_id}&insurer_company_id=eq.${insurer.id}&thread_id=not.is.null&order=created_at.desc&limit=1`, []) : []
  const cc = [...new Set(routes.slice(1).map(r => r.email))].slice(0, 5)
  const draft = await store.createDraft({ contact_id: to.contact_id, to_email: to.email, subject: text.subject, body: text.body, thread_id: prior[0]?.thread_id ?? null, email_type: MOVEMENT_DRAFT_TYPE, cc })
  if (!draft) throw new Error('Could not save the draft')
  await store.patch('policy_movements', `id=in.(${movements.map(m => m.id).join(',')})`, { sent_draft_id: draft.id })
  await store.log({ company_id: policy.company_id, kind: 'ask', actor, text: `Endorsement request to ${insurerName} drafted: ${countText(movements)} on ${label(policy)}`, detail: { ai_draft_id: draft.id, policy_id: policy.id } })
  return { draftId: draft.id, insurerName }
}

// ── Inbound ─────────────────────────────────────────────────────────────────────────────────

export async function handlePolicyInbound(input: { message_id: string; thread_id: string; gmail_thread_id: string | null; direction: 'inbound' | 'outbound' }): Promise<InboundResult> {
  if (input.direction !== 'inbound') return { handled: 'none' }
  const thread = await store.thread(input.thread_id)
  if (!thread?.company_id) return { handled: 'none' }
  const policies = await liveEbPolicies(thread.company_id)
  if (policies.length === 0) return { handled: 'none' }
  const msg = await store.message(input.message_id)
  if (!msg) return { handled: 'none' }
  const sender = bareEmail(msg.from_address)
  if (!sender || isInternal(sender)) return { handled: 'none' }
  const domain = emailDomain(sender)

  // The chosen insurer writing in: its note settles movements.
  for (const p of policies) {
    const insurer = await insurerCompany(p.chosen_insurer_company_id)
    if (!senderIsInsurer(domain, insurer, p.insurer)) continue
    if (!msg.has_attachments) return { handled: 'none', detail: 'insurer mail without attachment' }
    return handleInsurerNote(p, insurer?.company_name ?? p.insurer ?? 'The insurer', msg, input.thread_id)
  }

  // The client writing in on the thread filed to its company.
  const company = await store.company(thread.company_id)
  const policy = policies[0]
  const cls = await agent.classifyMovementMail(msg, [], { companyName: company?.company_name ?? 'the client', policyLabel: label(policy) })
  if (!cls.isMovement || cls.confidence < 0.5) return { handled: 'none', detail: 'not a movement' }
  return handleClientMovements(policy, company?.company_name ?? 'the client', msg, input.thread_id)
}

async function handleClientMovements(policy: PolicyRow, companyName: string, msg: store.MailMessage, threadId: string): Promise<InboundResult> {
  const atts = await store.attachmentsFor(msg.id, !!msg.has_attachments)
  const members = await listMembers(policy.id)
  const read = await agent.readMovementMail(msg, atts, { companyName, policyLabel: label(policy), members })
  const base = { company_id: policy.company_id!, thread_id: threadId, message_id: msg.id }
  if (!read || read.movements.length === 0) {
    await store.log({ ...base, kind: 'reply', actor: 'system', text: 'Client wrote about staff movements; the agent could not list them. Open the thread.', detail: { policy_id: policy.id } })
    return { handled: 'client', detail: 'unread' }
  }
  const rows: PolicyMovement[] = []
  for (const m of read.movements) {
    try {
      rows.push(await recordMovement(policy.id, policy.company_id!, { ...m, reported_thread_id: threadId, reported_message_id: msg.id }))
    } catch (e) { console.error('[benefits_admin] movement write', e instanceof Error ? e.message : e) }
  }
  let tail = ''
  try {
    const r = await requestMovements(policy, rows, 'agent')
    tail = ` — request to ${r.insurerName} drafted`
  } catch (e) {
    tail = ` — ${e instanceof Error ? e.message : 'request not drafted'}`
  }
  await store.log({ ...base, kind: 'change', text: `Client reported ${countText(rows)}${tail}`, detail: { policy_id: policy.id, movement_ids: rows.map(r => r.id) } })
  return { handled: 'client', detail: `movements ${rows.length}` }
}

async function handleInsurerNote(policy: PolicyRow, insurerName: string, msg: store.MailMessage, threadId: string): Promise<InboundResult> {
  const atts = await store.attachmentsFor(msg.id, true)
  const members = await listMembers(policy.id)
  const read = await agent.readInsurerNote(msg, atts, { insurerName, policyLabel: label(policy), policyNumber: policy.policy_number, members })
  const base = { company_id: policy.company_id!, thread_id: threadId, message_id: msg.id }
  if (!read) {
    await store.log({ ...base, kind: 'reply', actor: 'system', text: `${insurerName} sent a document; the agent could not read it. Open the thread.`, detail: { policy_id: policy.id } })
    return { handled: 'insurer', detail: 'unread' }
  }
  if (read.notes.length === 0) return { handled: 'insurer', detail: 'no note' }
  let open = await openMovements(policy.id)
  let written = 0
  for (const n of read.notes) {
    if (n.amount == null && !n.note_no) continue
    const att = atts.find(a => (n.evidence.amount?.source ?? '').includes(a.filename)) ?? null
    const { transaction, duplicate } = await recordTransaction(policy.id, policy.company_id!, {
      kind: n.kind, note_no: n.note_no, issued_on: n.issued_on ?? msg.sent_at?.slice(0, 10) ?? null, pax: n.pax, amount: n.amount ?? 0,
      currency: n.currency ?? policy.currency ?? 'SGD', description: n.description, period_start: n.period_start, period_end: n.period_end,
      insurer: insurerName, member_names: n.member_names, source_thread_id: threadId, source_message_id: msg.id, source_attachment_id: att?.id ?? null,
      evidence: n.evidence, needs_review: n.needs_review,
    })
    if (duplicate) continue
    written++
    const matched = matchMovement(transaction, open)
    await noteMovements(transaction.id, matched)
    open = open.filter(m => !matched.some(x => x.id === m.id))
    const who = matched.length ? matched : null
    const whoText = who ? `${who.length} ${who[0].kind === 'leave' ? 'leaver' : who[0].kind === 'join' ? 'joiner' : 'change'}${who.length === 1 ? '' : 's'} (${who.map(m => m.member_name).join(', ')})`
      : n.member_names.length ? `${n.pax ?? n.member_names.length} pax (${n.member_names.join(', ')})` : n.pax ? `${n.pax} pax` : 'the policy'
    const per = period(transaction.period_start, transaction.period_end)
    await store.log({ ...base, kind: 'info', text: `${insurerName} ${transaction.kind} note${transaction.note_no ? ` ${transaction.note_no}` : ''}: ${money(transaction.currency, transaction.amount)} for ${whoText}${per ? `, ${per}` : ''}${transaction.needs_review ? ' — check the figure against the source' : ''}`,
      detail: { policy_id: policy.id, transaction_id: transaction.id, movement_ids: matched.map(m => m.id) } })
  }
  return { handled: 'insurer', detail: `notes ${written}` }
}
