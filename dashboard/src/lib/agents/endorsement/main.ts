/**
 * The endorsement main agent. One run per email; see docs/agent-routing.md.
 *
 *   voice     the client or insurer as written; a TRS staff forward read as the client it forwards
 *   insurer   its note goes to the note reader for its policy (unchanged)
 *   client    the live policies the email touches, then one run per policy at that line's desk:
 *             eb and motor read movements (date gate, batch, price); other desks are logged as
 *             routed to general and stay with the case worker until their phase is built
 *
 * The routing is returned as the task result, so agent_tasks shows what went where and why.
 */
import { sbTry, enc, bareEmail, emailDomain, isInternal } from '@/lib/crm/db'
import * as store from '@/lib/placement/store'
import { intakeClientMail } from '@/lib/admin/b/endorsements/intake'
import { intakeInsurerMail } from '@/lib/admin/b/endorsements/notes'
import { detectInsurerIntent } from '@/lib/admin/b/endorsements/cues'
import { livePolicies } from '@/lib/admin/b/endorsements/store'
import { lineFor } from '@/lib/admin/b/endorsements/rules'
import { clientFor, insurerCompany, senderIsInsurer } from '@/lib/policies/inbound'
import type { PolicyRow } from '@/lib/policies/types'
import { deskFor, MOVEMENT_DESKS, type Desk } from '../desks'
import { policiesTouched, voiceOf } from './route'

const LIST_LIKE = /\b(resign\w*|last day|leaver|joiner|new (?:staff|hire|employee|joiner)|onboard\w*|enrol\w*|add(?:ition)?\b|delet\w*|remov\w*|terminat\w*|cessation|movement|name ?list|census|include|exclude|dependants?|dependents?)\b/i

export type PolicyRun = { policy_id: string; policy_number: string | null; line: string | null; desk: Desk; outcome: string }
export type RouteResult = {
  handled: 'client' | 'insurer' | 'none'
  voice: string
  forwarded_by?: string | null
  basis?: string
  desks?: Desk[]
  per_policy?: PolicyRun[]
  detail?: string
}

/** The client company for a forwarded email when the thread has none: the forwarded sender's contact record. */
async function companyOfSender(email: string): Promise<string | null> {
  if (!email) return null
  const [c] = await sbTry<{ company_id: string | null }[]>(`contacts?email=ilike.${enc(email)}&company_id=not.is.null&select=company_id&limit=1`, [])
  return c?.company_id ?? null
}

export async function routeEndorsementMail(input: { message_id: string; thread_id: string }): Promise<RouteResult> {
  const msg = await store.message(input.message_id)
  if (!msg || msg.direction === 'outbound') return { handled: 'none', voice: 'outbound' }
  const thread = await store.thread(input.thread_id)
  if (!thread) return { handled: 'none', voice: 'none', detail: 'thread gone' }

  // Who is speaking: an insurer is known only once the client's policies are known.
  const voice = voiceOf(msg, isInternal)
  if (voice.kind === 'staff') return { handled: 'none', voice: 'staff', detail: 'staff email that forwards no client' }
  const client = (await clientFor(input.thread_id, thread.company_id, thread.subject))
    ?? (voice.kind === 'staff_forward' ? await companyOfSender(voice.from).then(id => id ? { companyId: id, policyId: null } : null) : null)
  if (!client) return { handled: 'none', voice: voice.kind, forwarded_by: voice.forwardedBy, detail: 'no client with a live policy' }
  const all = await livePolicies(client.companyId) as PolicyRow[]
  if (!all.length) return { handled: 'none', voice: voice.kind, detail: 'no live policy' }

  // The insurer writing in: its note settles movements on the policy its mail names.
  const domain = emailDomain(bareEmail(voice.from))
  const insurerPolicies: PolicyRow[] = []
  for (const p of all) if (senderIsInsurer(domain, await insurerCompany(p.chosen_insurer_company_id), p.insurer)) insurerPolicies.push(p)
  if (insurerPolicies.length) {
    const text = `${msg.subject ?? ''}\n${voice.body}`
    if (!msg.has_attachments && !/credit note|debit note|tax invoice|endorsement/i.test(text) && detectInsurerIntent(msg.subject, voice.body).intent === 'none') return { handled: 'none', voice: 'insurer', detail: 'insurer mail without a note' }
    const named = insurerPolicies.filter(p => p.policy_number && text.toLowerCase().includes(p.policy_number.toLowerCase()))
    const p = named[0] ?? (client.policyId ? insurerPolicies.find(x => x.id === client.policyId) : null) ?? insurerPolicies[0]
    const insurer = await insurerCompany(p.chosen_insurer_company_id)
    const r = await intakeInsurerMail(p, insurer?.company_name ?? p.insurer ?? 'The insurer', { ...msg, from_address: voice.from, body_text: voice.body }, input.thread_id)
    return { handled: 'insurer', voice: 'insurer', forwarded_by: voice.forwardedBy, detail: r.detail, per_policy: [{ policy_id: p.id, policy_number: p.policy_number, line: lineFor(p), desk: deskFor(lineFor(p)), outcome: r.detail }] }
  }

  // The client: every policy the email touches, one run each at its desk.
  const atts = await store.attachmentsFor(msg.id, !!msg.has_attachments)
  const text = `${msg.subject ?? ''}\n${voice.body}\n${atts.map(a => a.filename).join('\n')}`
  const ordered = client.policyId ? [...all.filter(p => p.id === client.policyId), ...all.filter(p => p.id !== client.policyId)] : all
  const touched = policiesTouched(ordered, text, p => lineFor(p), LIST_LIKE.test(text) || atts.length > 0)
  if (!touched.policies.length) return { handled: 'none', voice: voice.kind, forwarded_by: voice.forwardedBy, basis: touched.basis, detail: 'touches no live policy' }

  const asClient = { ...msg, from_address: voice.from, body_text: voice.body }
  const runs: PolicyRun[] = []
  for (const p of touched.policies) {
    const line = lineFor(p), desk = deskFor(line)
    if (!MOVEMENT_DESKS.has(desk)) { runs.push({ policy_id: p.id, policy_number: p.policy_number, line, desk, outcome: 'routed to general' }); continue }
    try {
      const r = await intakeClientMail(client.companyId, asClient, input.thread_id, { policyId: p.id })
      runs.push({ policy_id: p.id, policy_number: p.policy_number, line, desk, outcome: r.detail })
    } catch (e) {
      runs.push({ policy_id: p.id, policy_number: p.policy_number, line, desk, outcome: `failed: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200) })
    }
  }
  const general = runs.filter(r => r.outcome === 'routed to general')
  if (general.length) {
    await store.log({ company_id: client.companyId, thread_id: input.thread_id, message_id: msg.id, kind: 'movement', actor: 'endorsement_main',
      text: `Endorsement on ${general.map(r => `${r.line ?? 'policy'} ${r.policy_number ?? ''}`.trim()).join(', ')}: with the case worker (no line agent yet)`,
      detail: { policies: general.map(r => r.policy_id), voice: voice.kind, forwarded_by: voice.forwardedBy } })
  }
  const failed = runs.find(r => r.outcome.startsWith('failed'))
  if (failed && runs.every(r => r.outcome.startsWith('failed'))) throw new Error(failed.outcome)
  return {
    handled: runs.some(r => MOVEMENT_DESKS.has(r.desk) && !/^(not a movement|model says not a movement|rules read nothing)/.test(r.outcome)) ? 'client' : 'none',
    voice: voice.kind, forwarded_by: voice.forwardedBy, basis: touched.basis, desks: [...new Set(runs.map(r => r.desk))], per_policy: runs,
  }
}
