/**
 * "Draft renewal advice": the renewal report as a PDF attached to a three-line email, on the
 * policy's renewal case, for a person to approve on Today. Opens (or reuses) the case, builds
 * and stores the PDF, routes the email to the client's renewal contact through the recipient
 * router, and writes the draft with draft_class 'renewal_advice'. Nothing sends. Signed
 * "{owner_name}"; the queue fills the name at send time.
 */
import { sb, sbTry, enc } from '@/lib/crm/db'
import { routeRecipients, OPERATIONS } from '@/lib/admin/b/router'
import { scopedContacts, departedStaff, itemEvent } from '@/lib/admin/b/data'
import { storeDraft } from '@/lib/admin/b/drafter'
import { getRenewalPack, type RenewalPack, type PeriodFigures } from './index'
import { adviceEmail, buildReportModel, RENEWAL_ADVICE } from './report-model'
import { buildRenewalReport, storeRenewalReport, reportable } from './report'

type Row = Record<string, any>
const ACTOR = 'policy_ledger'
export { RENEWAL_ADVICE }

const money = (n: number | null | undefined, ccy = 'SGD') => n == null ? '—' : `${ccy === 'SGD' ? 'S$' : `${ccy} `}${Math.abs(n).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${n < 0 ? ' credit' : ''}`
const pct = (r: number | null) => r == null ? '—' : `${Math.round(r * 100)}%`

/** The pack as plain text: numbers and labels only. Kept for the review screen's case summary. */
export function renderAdvice(p: RenewalPack): { subject: string; body: string } {
  const c = p.current, q = p.prior, ccy = p.policy.currency
  const row = (label: string, now: string, before: string) => `${label.padEnd(28)}${now.padStart(16)}${before.padStart(16)}`
  const fig = (f: PeriodFigures | null, k: (f: PeriodFigures) => string) => f ? k(f) : '—'
  const lines = [
    `Policy ${p.policy.policy_number ?? ''} · ${p.policy.class ?? p.policy.product_line ?? ''} · ${p.policy.insurer ?? ''}`,
    `Period ${p.policy.start_date ?? '?'} to ${p.policy.end_date ?? '?'} · ${p.elapsed_days} of ${p.term_days} days run`,
    '',
    row('', 'This period', 'Last period'),
    row('Premium at inception', money(c.premium_inception, ccy), fig(q, f => money(f.premium_inception, ccy))),
    row('Endorsements, net', money(c.endorsements_net, ccy), fig(q, f => money(f.endorsements_net, ccy))),
    row('Net premium', money(c.premium_net, ccy), fig(q, f => money(f.premium_net, ccy))),
    row('Claims paid', money(c.claims_paid, ccy), fig(q, f => money(f.claims_paid, ccy))),
    row('Loss ratio', pct(c.loss_ratio), fig(q, f => pct(f.loss_ratio))),
    '',
    `Next period at this year's rate: ${money(p.projection.same_rate, ccy)} (${p.projection.basis})`,
    `${p.projection.band.label}: ${money(p.projection.low, ccy)} to ${money(p.projection.high, ccy)}`,
  ]
  return { subject: `Renewal · ${p.policy.class ?? p.policy.product_line ?? 'policy'} · ${p.policy.policy_number ?? ''}`.trim(), body: lines.join('\n') }
}

/** The policy's open renewal case, opened when none exists. */
export async function renewalCase(pack: RenewalPack, by: string): Promise<Row> {
  const policyId = pack.policy.id
  let [item] = await sbTry<Row[]>(`work_items?policy_id=eq.${enc(policyId)}&case_type=eq.renewal&closed_at=is.null&select=id,owner_email,company_id&limit=1`, [])
  if (!item && pack.policy.policy_number && pack.policy.company_id) {
    [item] = await sbTry<Row[]>(`work_items?company_id=eq.${enc(pack.policy.company_id)}&policy_number=eq.${enc(pack.policy.policy_number)}&case_type=eq.renewal&closed_at=is.null&select=id,owner_email,company_id&limit=1`, [])
  }
  if (item) return item
  const [made] = await sb<Row[]>('work_items', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
    company_id: pack.policy.company_id, client_name: pack.policy.company_name, case_type: 'renewal',
    title: `Renewal: ${pack.policy.class ?? pack.policy.product_line ?? 'policy'}${pack.policy.policy_number ? ` ${pack.policy.policy_number}` : ''}`.slice(0, 140),
    status: 'trs_to_act', next_action: 'Send the renewal report', deadline: pack.policy.end_date, deadline_basis: 'policy expiry', insurer_name: pack.policy.insurer,
    policy_id: policyId, policy_number: pack.policy.policy_number, owner_email: by.includes('@') ? by : null, source: ACTOR, summary: `Renewal pack drawn ${pack.as_of}.`, confidence: 'high',
  }) })
  await itemEvent(made.id, 'note', by, { opened: 'renewal advice', expiry: pack.policy.end_date })
  return made
}

/** The client's renewal contact, through the router: acts-for scope renewal, accounts or the line, then the group's, then the primary contact. */
async function renewalRoute(pack: RenewalPack, owner: string | null): Promise<{ ok: true; to: string[]; cc: string[]; basis: string } | { ok: false; question: string }> {
  const companyId = pack.policy.company_id!
  const [company] = await sbTry<Row[]>(`companies?id=eq.${enc(companyId)}&select=parent_id&limit=1`, [])
  const clientContacts = await scopedContacts(companyId)
  const groupContacts = company?.parent_id ? await scopedContacts(company.parent_id) : []
  const scope = clientContacts.some(c => (c.scope ?? []).includes('renewal')) ? 'renewal' : clientContacts.some(c => (c.scope ?? []).includes('accounts')) ? 'accounts' : String(pack.policy.product_line ?? 'renewal').toLowerCase()
  const r = routeRecipients({ side: 'client', scope, messages: [], clientContacts, groupContacts, insurerDesk: [], insurerLastHandler: null, insurerDomains: [], departed: await departedStaff(), owner })
  if (r.ok) return r
  // No scoped contact: the client's first contact on file, so the draft still has an address.
  const [c] = await sbTry<Row[]>(`contacts?company_id=eq.${enc(companyId)}&email=not.is.null&select=email&order=created_at.asc&limit=1`, [])
  return c?.email ? { ok: true, to: [String(c.email).toLowerCase()], cc: [OPERATIONS, ...(owner ? [owner] : [])], basis: 'first contact on file' } : r
}

async function firstName(email: string | undefined): Promise<string | null> {
  if (!email) return null
  const [p] = await sbTry<Row[]>(`contacts?email=ilike.${enc(email)}&select=first_name&limit=1`, [])
  return p?.first_name ?? null
}

export type AdviceResult = { work_item_id: string; draft_id: string | null; to: string | null; report_ref: string | null; reason?: string }

/**
 * Builds the report and its email on the policy's renewal case. When the pack cannot be
 * reported (no premium or period on file) the case is opened with the question for a person
 * and no report is made.
 */
export async function draftRenewalAdvice(policyId: string, by: string, asOf?: string): Promise<AdviceResult> {
  const pack = await getRenewalPack(policyId, asOf)
  if (!pack) throw new Error('Policy not found')
  if (!pack.policy.company_id) throw new Error('Policy has no client')
  const item = await renewalCase(pack, by)
  const can = reportable(pack)
  if (!can.ok) {
    await sb(`work_items?id=eq.${enc(item.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ needs_human: `Renewal report not made: ${can.reason}`, next_action: 'Put the premium and period on the policy, then draft the report', updated_at: new Date().toISOString() }) })
    await itemEvent(item.id, 'note', by, { kind: 'renewal_advice', skipped: can.reason })
    return { work_item_id: item.id, draft_id: null, to: null, report_ref: null, reason: can.reason }
  }
  const built = await buildRenewalReport(policyId, asOf)
  if (!built) throw new Error('Policy not found')
  const ref = await storeRenewalReport(built)
  const route = await renewalRoute(pack, item.owner_email ?? (by.includes('@') ? by : null))
  const to = route.ok ? route.to : []
  const email = adviceEmail(buildReportModel(pack), { greeting: await firstName(to[0]), expiry: pack.policy.end_date })
  // The previous unsent report for this case is replaced, never left beside the new one.
  await sbTry(`ai_drafts?work_item_id=eq.${enc(item.id)}&status=in.(pending,draft)&email_type=eq.${RENEWAL_ADVICE}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'rejected', rejection_note: 'replaced by a newer report' }) })
  const draftId = await storeDraft(item.id, {
    thread_id: null, to, cc: route.ok ? route.cc : [OPERATIONS], subject: email.subject, body: email.body, kind: 'renewal_advice', party: 'client',
    attachments: [{ filename: built.filename, mime_type: 'application/pdf', storage_url: ref, message_id: '' }],
  })
  await sbTry(`ai_drafts?id=eq.${enc(draftId)}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ email_type: RENEWAL_ADVICE, generated_by: ACTOR, draft_class: 'renewal_advice', context_used: { agent: ACTOR, kind: 'renewal_advice', as_of: pack.as_of, report_ref: ref, basis: route.ok ? route.basis : null } }) })
  await sb(`work_items?id=eq.${enc(item.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({
    draft_id: draftId, next_action: 'Approve the renewal report to the client', status: 'trs_to_act',
    needs_human: route.ok ? null : route.question, updated_at: new Date().toISOString(),
  }) })
  await itemEvent(item.id, 'draft', by, { kind: 'renewal_advice', draft_id: draftId, to: to[0] ?? null, report_ref: ref, not_on_file: pack.missing })
  return { work_item_id: item.id, draft_id: draftId, to: to[0] ?? null, report_ref: ref }
}
