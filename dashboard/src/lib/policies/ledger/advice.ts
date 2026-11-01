/**
 * "Draft renewal advice": the renewal pack as a plain email draft for a person to approve on
 * Today. Opens (or reuses) the policy's renewal case, writes the draft to ai_drafts with the
 * figures as a table, and addresses it to the client contact on file for renewals or accounts.
 * Nothing sends. Signed "{owner_name}"; the queue fills the name at send time.
 */
import { sb, sbTry, enc } from '@/lib/crm/db'
import { getRenewalPack, type RenewalPack, type PeriodFigures } from './index'

type Row = Record<string, any>
const ACTOR = 'policy_ledger'

const money = (n: number | null | undefined, ccy = 'SGD') => n == null ? '—' : `${ccy === 'SGD' ? 'S$' : `${ccy} `}${Math.abs(n).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${n < 0 ? ' credit' : ''}`
const pct = (r: number | null) => r == null ? '—' : `${Math.round(r * 100)}%`

/** The advice body: numbers and labels only. */
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
    row('Endorsements, count', String(c.endorsements_count), fig(q, f => String(f.endorsements_count))),
    row('Net premium', money(c.premium_net, ccy), fig(q, f => money(f.premium_net, ccy))),
    row('Premium earned to date', money(c.earned_premium, ccy), fig(q, f => money(f.earned_premium, ccy))),
    row('Claims notified', String(c.claims_count), fig(q, f => String(f.claims_count))),
    row('Claims paid', money(c.claims_paid, ccy), fig(q, f => money(f.claims_paid, ccy))),
    row('Loss ratio', pct(c.loss_ratio), fig(q, f => pct(f.loss_ratio))),
    ...(p.policy.is_eb ? [row('Members at inception', c.members_inception == null ? '—' : String(c.members_inception), fig(q, f => f.members_inception == null ? '—' : String(f.members_inception))),
      row('Members now', c.members_now == null ? '—' : String(c.members_now), fig(q, f => f.members_now == null ? '—' : String(f.members_now))),
      row('Joiners / leavers', `${c.joiners} / ${c.leavers}`, fig(q, f => `${f.joiners} / ${f.leavers}`))] : []),
    '',
    `Next period at this year's rate: ${money(p.projection.same_rate, ccy)} (${p.projection.basis})`,
    `${p.projection.band.label}: ${p.projection.band.low_pct >= 0 ? '+' : ''}${p.projection.band.low_pct}% to +${p.projection.band.high_pct}% · ${money(p.projection.low, ccy)} to ${money(p.projection.high, ccy)}`,
    `Budget: ${money(p.projection.high, ccy)}`,
    ...(p.missing.length ? ['', 'Not on file:', ...p.missing.map(m => `- ${m}`)] : []),
    '', p.projection.assumptions.join(' '),
  ]
  return { subject: `Renewal · ${p.policy.class ?? p.policy.product_line ?? 'policy'} · ${p.policy.policy_number ?? ''} · ${p.policy.end_date ?? ''}`.replace(/\s+·\s*$/, ''), body: lines.join('\n') }
}

/** The client's contact for renewals: acts-for scope renewal/accounts/all, else the primary contact, else none. */
async function renewalRecipient(companyId: string): Promise<{ email: string; contact_id: string | null } | null> {
  const links = await sbTry<Row[]>(`company_contacts?company_id=eq.${enc(companyId)}&status=eq.active&select=contact_id,scope,is_primary,contacts(id,email)&limit=100`, [])
  const score = (l: Row) => (Array.isArray(l.scope) && l.scope.some((s: string) => /renewal|accounts|all/.test(s)) ? 2 : 0) + (l.is_primary ? 1 : 0)
  const best = links.filter(l => l.contacts?.email).sort((a, b) => score(b) - score(a))[0]
  if (best) return { email: String(best.contacts.email), contact_id: best.contacts.id ?? null }
  const [c] = await sbTry<Row[]>(`contacts?company_id=eq.${enc(companyId)}&email=not.is.null&select=id,email&order=created_at.asc&limit=1`, [])
  return c ? { email: String(c.email), contact_id: c.id } : null
}

export async function draftRenewalAdvice(policyId: string, by: string): Promise<{ work_item_id: string; draft_id: string; to: string | null }> {
  const pack = await getRenewalPack(policyId)
  if (!pack) throw new Error('Policy not found')
  if (!pack.policy.company_id) throw new Error('Policy has no client')
  const { subject, body } = renderAdvice(pack)
  let [item] = await sbTry<Row[]>(`work_items?policy_id=eq.${enc(policyId)}&case_type=eq.renewal&closed_at=is.null&select=id&limit=1`, [])
  if (!item) {
    [item] = await sb<Row[]>('work_items', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
      company_id: pack.policy.company_id, client_name: pack.policy.company_name, case_type: 'renewal', title: `Renewal · ${pack.policy.class ?? pack.policy.product_line ?? 'policy'} · ${pack.policy.insurer ?? ''}`.trim(),
      status: 'trs_to_act', next_action: 'Send the renewal advice', deadline: pack.policy.end_date, deadline_basis: 'policy expiry', insurer_name: pack.policy.insurer,
      policy_id: policyId, policy_number: pack.policy.policy_number, owner_email: by, source: ACTOR, summary: `Renewal pack drawn ${pack.as_of}.`,
    }) })
  }
  const to = await renewalRecipient(pack.policy.company_id)
  await sbTry(`ai_drafts?work_item_id=eq.${enc(item.id)}&status=in.(pending,draft)&email_type=eq.RENEWAL_ADVICE`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'rejected', rejection_note: 'replaced by a newer pack' }) })
  const [draft] = await sb<Row[]>('ai_drafts', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
    contact_id: to?.contact_id ?? null, thread_id: null, channel: 'email', email_type: 'RENEWAL_ADVICE', status: 'pending', generated_by: ACTOR,
    to_email: to?.email ?? '', cc: 'operations@trade-risksol.com', subject, body: `${body}\n\nBest regards,\n{owner_name}\nTrade Risk Solutions`,
    attachments: [], work_item_id: item.id, party: 'client', context_used: { agent: ACTOR, kind: 'renewal_advice', as_of: pack.as_of },
  }) })
  await sb(`work_items?id=eq.${enc(item.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ draft_id: draft.id, updated_at: new Date().toISOString() }) })
  await sb('work_item_events', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ work_item_id: item.id, kind: 'draft', actor: by, detail: { kind: 'renewal_advice', draft_id: draft.id, to: to?.email ?? null } }) })
  return { work_item_id: item.id, draft_id: draft.id, to: to?.email ?? null }
}
