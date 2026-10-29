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
import { checkNote, estimateMovements, movementAttachments } from './movement-flow'
import { movementSubject } from './movement-sheet'
import { shortInsurer } from '@/lib/gb/insurer-names'

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
  // An insurer with domains on record is matched by them only. Words of its name inside a domain
  // misfire: "aia" is inside "malaysia", and a client named like its insurer would read as the insurer.
  if (domains.length) return domains.some(d => senderDomain === d || senderDomain.endsWith(`.${d}`))
  // No domain on record: a domain label that is, or starts with, a distinctive word of the name.
  const labels = senderDomain.split('.').slice(0, -1).flatMap(l => [l, ...l.split('-')])
  const words = `${insurer?.company_name ?? ''} ${insurerName ?? ''}`.toLowerCase().split(/[^a-z0-9]+/)
    .filter(w => w.length >= 3 && !/^(insurance|assurance|singapore|pte|ltd|limited|company|general|group|the|and|health|life)$/.test(w))
  const whole = normInsurer(insurerName)
  return words.some(w => labels.some(l => l === w || l.startsWith(w))) || (!!whole && whole.length >= 3 && labels.some(l => l === whole || l.startsWith(whole)))
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

  // What each movement should cost, for checking the insurer's note when it comes.
  await estimateMovements(policy, movements).catch(e => console.error('[benefits_admin] estimate', e instanceof Error ? e.message : e))
  // The insurer's own sheet and the client's original files go with the request.
  const files = await movementAttachments(policy, movements, company?.company_name ?? 'Client', insurerName)
  const counts = { joins: movements.filter(m => m.kind === 'join').length, leaves: movements.filter(m => m.kind === 'leave').length, changes: movements.filter(m => m.kind === 'change').length }
  const subject = movementSubject(shortInsurer(insurerName), company?.company_name ?? 'Client', policy.policy_number, counts)
  const attachedLine = files.attachments.length ? `\n\nAttached: ${files.attachments.map(a => a.filename).join('; ')}.` : ''

  // The latest thread with this insurer on this company carries the draft; otherwise it starts one.
  const prior = insurer ? await sbTry<{ thread_id: string | null }[]>(`placement_dispatches?company_id=eq.${policy.company_id}&insurer_company_id=eq.${insurer.id}&thread_id=not.is.null&order=created_at.desc&limit=1`, []) : []
  const cc = [...new Set(routes.slice(1).map(r => r.email))].slice(0, 5)
  const draft = await store.createDraft({ contact_id: to.contact_id, to_email: to.email, subject, body: `${text.body.trimEnd()}${attachedLine}`, thread_id: prior[0]?.thread_id ?? null, email_type: MOVEMENT_DRAFT_TYPE, cc, attachments: files.attachments })
  if (!draft) throw new Error('Could not save the draft')
  await store.patch('policy_movements', `id=in.(${movements.map(m => m.id).join(',')})`, { sent_draft_id: draft.id })
  await store.log({ company_id: policy.company_id, kind: 'movement', actor, text: `Endorsement request to ${insurerName} drafted: ${countText(movements)} on ${label(policy)}${files.sheetError ? ' (insurer sheet not attached: Drive unavailable)' : ''}`, detail: { ai_draft_id: draft.id, policy_id: policy.id, attachments: files.attachments.map(a => a.filename) } })
  return { draftId: draft.id, insurerName }
}

// ── Inbound ─────────────────────────────────────────────────────────────────────────────────

/**
 * The client whose policy a thread is about. The thread's own company first; then a movement
 * request TRS sent on this thread (insurer replies are often filed under the insurer); then a live
 * EB policy whose number appears in the subject, or whose client's name does (QBE's automated
 * "Customer <INSURED NAME>" mails).
 */
async function clientFor(threadId: string, threadCompany: string | null, subject: string | null): Promise<{ companyId: string; policyId: string | null } | null> {
  if (threadCompany && (await liveEbPolicies(threadCompany)).length) return { companyId: threadCompany, policyId: null }
  const sent = await sbTry<{ id: string }[]>(`ai_drafts?thread_id=eq.${threadId}&email_type=eq.${MOVEMENT_DRAFT_TYPE}&select=id&limit=5`, [])
  if (sent.length) {
    const [m] = await sbTry<{ company_id: string; policy_id: string }[]>(`policy_movements?sent_draft_id=in.(${sent.map(d => d.id).join(',')})&select=company_id,policy_id&limit=1`, [])
    if (m) return { companyId: m.company_id, policyId: m.policy_id }
  }
  const subj = (subject ?? '').toLowerCase()
  if (!subj) return null
  const live = await liveEbPolicies()
  const byNo = live.filter(p => p.policy_number && p.policy_number.length >= 5 && subj.includes(p.policy_number.toLowerCase()))
  if (byNo.length === 1) return { companyId: byNo[0].company_id!, policyId: byNo[0].id }
  const names = await sbTry<{ id: string; company_name: string }[]>(`companies?id=in.(${[...new Set(live.map(p => p.company_id).filter(Boolean))].join(',') || '00000000-0000-0000-0000-000000000000'})&select=id,company_name`, [])
  const norm = (x: string) => x.toLowerCase().replace(/\b(pte|ltd|limited|private)\b\.?/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()
  const hit = names.filter(c => norm(c.company_name).length >= 5 && norm(subj).includes(norm(c.company_name)))
  return hit.length === 1 ? { companyId: hit[0].id, policyId: null } : null
}

/** The policy a mail is about when the client has several: the one whose number or insurer the mail names. */
function pickPolicy(policies: PolicyRow[], text: string): PolicyRow {
  const t = text.toLowerCase()
  const byNo = policies.filter(p => p.policy_number && t.includes(p.policy_number.toLowerCase()))
  if (byNo.length === 1) return byNo[0]
  const byInsurer = policies.filter(p => p.insurer && normInsurer(p.insurer).length >= 3 && t.replace(/[^a-z0-9]/g, '').includes(normInsurer(p.insurer)))
  return byInsurer.length === 1 ? byInsurer[0] : policies[0]
}

export async function handlePolicyInbound(input: { message_id: string; thread_id: string; gmail_thread_id: string | null; direction: 'inbound' | 'outbound' }): Promise<InboundResult> {
  if (input.direction !== 'inbound') return { handled: 'none' }
  const thread = await store.thread(input.thread_id)
  if (!thread) return { handled: 'none' }
  const client = await clientFor(input.thread_id, thread.company_id, thread.subject)
  if (!client) return { handled: 'none' }
  const all = await liveEbPolicies(client.companyId)
  const policies = client.policyId ? [...all.filter(p => p.id === client.policyId), ...all.filter(p => p.id !== client.policyId)] : all
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

  // The client writing in. Its attachments are read first: a list sent only as an Excel or PDF
  // with "please update" in the body is still a movement.
  const company = await store.company(client.companyId)
  const atts = await store.attachmentsFor(msg.id, !!msg.has_attachments)
  const policy = pickPolicy(policies, `${msg.subject ?? ''}\n${msg.body_text ?? ''}\n${atts.map(a => `${a.filename}\n${(a.parsed_text ?? '').slice(0, 2000)}`).join('\n')}`)
  const cls = await agent.classifyMovementMail(msg, atts, { companyName: company?.company_name ?? 'the client', policyLabel: label(policy) })
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
    const check = await checkNote(policy, transaction, matched).catch(() => null)
    open = open.filter(m => !matched.some(x => x.id === m.id))
    const who = matched.length ? matched : null
    const whoText = who ? `${who.length} ${who[0].kind === 'leave' ? 'leaver' : who[0].kind === 'join' ? 'joiner' : 'change'}${who.length === 1 ? '' : 's'} (${who.map(m => m.member_name).join(', ')})`
      : n.member_names.length ? `${n.pax ?? n.member_names.length} pax (${n.member_names.join(', ')})` : n.pax ? `${n.pax} pax` : 'the policy'
    const per = period(transaction.period_start, transaction.period_end)
    const vsEstimate = check?.estimate != null ? ` (expected ${money(transaction.currency, check.estimate)}${check.withinTolerance ? '' : ', check the difference'})` : ''
    await store.log({ ...base, kind: 'billing', text: `${insurerName} ${transaction.kind} note${transaction.note_no ? ` ${transaction.note_no}` : ''}: ${money(transaction.currency, transaction.amount)} for ${whoText}${per ? `, ${per}` : ''}${vsEstimate}${transaction.needs_review ? ' — check the figure against the source' : ''}`,
      detail: { policy_id: policy.id, transaction_id: transaction.id, movement_ids: matched.map(m => m.id) } })
  }
  return { handled: 'insurer', detail: `notes ${written}` }
}
