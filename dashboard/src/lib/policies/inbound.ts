/**
 * The mail loop on a live policy, after bind — any class, not only employee benefits.
 *
 *   client mail  "X joined on 1 Nov, Y resigned"  → movements in the open batch (one Today item a week)
 *   insurer mail with a debit / credit note        → transaction → the movements it settles → TRS note
 *
 * Called from placement's handleInbound when the thread is not part of a placement, and from the
 * eb_movements agent. The ingest call only queues the work (one task per message, whoever asks);
 * the agent runs it with `direct`, so one code path handles every message once. Set
 * ADMIN_EB_DIRECT=1 to run inline instead (local tests). The reading itself lives in
 * src/lib/admin/b/endorsements.
 */
import { sbTry, bareEmail, emailDomain, isInternal } from '@/lib/crm/db'
import * as store from '@/lib/placement/store'
import type { InboundResult } from '@/lib/placement/workflow'
import { normInsurer } from '@/lib/insurers'
import * as agent from './agent'
import { liveEbPolicies, recordMovement } from './members'
import type { PolicyMovement, PolicyRow } from './types'
import { estimateMovements, movementAttachments } from './movement-flow'
import { movementSubject } from './movement-sheet'
import { shortInsurer } from '@/lib/gb/insurer-names'
import { enqueue } from '@/lib/agent-tasks/queue'
import { intakeClientMail } from '@/lib/admin/b/endorsements/intake'
import { intakeInsurerMail } from '@/lib/admin/b/endorsements/notes'
import { livePolicies } from '@/lib/admin/b/endorsements/store'

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
const countText = (ms: Pick<PolicyMovement, 'kind'>[]) => {
  const j = ms.filter(m => m.kind === 'join').length, l = ms.filter(m => m.kind === 'leave').length, c = ms.filter(m => m.kind === 'change').length
  const parts = [j ? `${j} joiner${j === 1 ? '' : 's'}` : '', l ? `${l} leaver${l === 1 ? '' : 's'}` : '', c ? `${c} change${c === 1 ? '' : 's'}` : ''].filter(Boolean)
  return parts.join(', ') || 'no movements'
}

// ── The request to the insurer (a person asks for it from the policy page) ──────────────────

/**
 * Drafts one email to the chosen insurer's EB contact covering every movement given, writes it
 * to ai_drafts (POLICY_MOVEMENT) and stamps the movements with the draft id. Throws when the
 * policy has no insurer or no contact on file for it. The weekly batch (endorsements/batches.ts)
 * does the same by itself; this stays for the policy page's "Request now" button.
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

  await estimateMovements(policy, movements).catch(e => console.error('[benefits_admin] estimate', e instanceof Error ? e.message : e))
  const files = await movementAttachments(policy, movements, company?.company_name ?? 'Client', insurerName)
  const counts = { joins: movements.filter(m => m.kind === 'join').length, leaves: movements.filter(m => m.kind === 'leave').length, changes: movements.filter(m => m.kind === 'change').length }
  const subject = movementSubject(shortInsurer(insurerName), company?.company_name ?? 'Client', policy.policy_number, counts)
  const attachedLine = files.attachments.length ? `\n\nAttached: ${files.attachments.map(a => a.filename).join('; ')}.` : ''

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
 * request TRS sent on this thread (insurer replies are often filed under the insurer); then a
 * live policy whose number appears in the subject, or whose client's name does (QBE's automated
 * "Customer <INSURED NAME>" mails).
 */
async function clientFor(threadId: string, threadCompany: string | null, subject: string | null): Promise<{ companyId: string; policyId: string | null } | null> {
  if (threadCompany && (await livePolicies(threadCompany)).length) return { companyId: threadCompany, policyId: null }
  const sent = await sbTry<{ id: string; work_item_id: string | null }[]>(`ai_drafts?thread_id=eq.${threadId}&or=(email_type.eq.${MOVEMENT_DRAFT_TYPE},context_used->>kind.eq.movement_batch)&select=id,work_item_id&limit=5`, [])
  if (sent.length) {
    const [m] = await sbTry<{ company_id: string; policy_id: string }[]>(`policy_movements?sent_draft_id=in.(${sent.map(d => d.id).join(',')})&select=company_id,policy_id&limit=1`, [])
    if (m) return { companyId: m.company_id, policyId: m.policy_id }
  }
  const [batch] = await sbTry<{ company_id: string; policy_id: string }[]>(`movement_batches?thread_id=eq.${threadId}&select=company_id,policy_id&limit=1`, [])
  if (batch) return { companyId: batch.company_id, policyId: batch.policy_id }
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

export const ebDirect = (env: Record<string, string | undefined> = process.env) => env.ADMIN_EB_DIRECT === '1'

export async function handlePolicyInbound(input: { message_id: string; thread_id: string; gmail_thread_id: string | null; direction: 'inbound' | 'outbound' }, opts: { direct?: boolean } = {}): Promise<InboundResult> {
  if (input.direction !== 'inbound') return { handled: 'none' }
  if (!opts.direct && !ebDirect()) {
    // Queued once per message, whoever asks (ingest, intake): the eb_movements agent runs it.
    await enqueue({ agent: 'eb_movements', kind: 'inbound_mail', idem_key: `eb:${input.message_id}`, created_by_agent: 'system', message_id: input.message_id, thread_id: input.thread_id, payload: { message_id: input.message_id } })
    return { handled: 'none', detail: 'queued' }
  }
  const thread = await store.thread(input.thread_id)
  if (!thread) return { handled: 'none' }
  const client = await clientFor(input.thread_id, thread.company_id, thread.subject)
  if (!client) return { handled: 'none' }
  const all = await livePolicies(client.companyId)
  const policies = client.policyId ? [...all.filter(p => p.id === client.policyId), ...all.filter(p => p.id !== client.policyId)] : all
  if (policies.length === 0) return { handled: 'none' }
  const msg = await store.message(input.message_id)
  if (!msg) return { handled: 'none' }
  const sender = bareEmail(msg.from_address)
  if (!sender || isInternal(sender)) return { handled: 'none' }
  const domain = emailDomain(sender)

  // The insurer writing in: its note settles movements. The policy its mail names, else the first whose insurer it is.
  const insurerPolicies: PolicyRow[] = []
  for (const p of policies) {
    const insurer = await insurerCompany(p.chosen_insurer_company_id)
    if (senderIsInsurer(domain, insurer, p.insurer)) insurerPolicies.push(p)
  }
  if (insurerPolicies.length) {
    if (!msg.has_attachments && !/credit note|debit note|tax invoice|endorsement/i.test(`${msg.subject ?? ''}\n${msg.body_text ?? ''}`)) return { handled: 'none', detail: 'insurer mail without a note' }
    const p = pickPolicy(insurerPolicies, `${msg.subject ?? ''}\n${msg.body_text ?? ''}`)
    const insurer = await insurerCompany(p.chosen_insurer_company_id)
    const r = await intakeInsurerMail(p, insurer?.company_name ?? p.insurer ?? 'The insurer', msg, input.thread_id)
    return { handled: 'insurer', detail: r.detail }
  }

  // The client writing in: a change request on one of its policies.
  const r = await intakeClientMail(client.companyId, msg, input.thread_id)
  return { handled: r.handled ? 'client' : 'none', detail: r.detail }
}

export { recordMovement }
