/**
 * A policy's money, in date order: what the insurer billed, what TRS billed the client, every
 * endorsement, every claim, and the running position. The renewal pack reads the same lines into
 * the figures a broker needs 60 days out: this period against the last, claims paid against
 * premium earned, heads now against heads at inception, and a projected range for next year.
 *
 * Sources: debit_notes (TRS's notes to the client, by event type), policy_transactions (the
 * insurer's notes, read from documents), claims, policy_movements, policy_members and the cover
 * facts the policy reader wrote. Insurer and TRS notes for the same event sit on one line.
 */
import { sbTry, enc } from '@/lib/crm/db'
import { basePolicyNumber } from '@/lib/policies/endorsement'
import { policyTokens } from '@/lib/documents/money'
import { earnedPremium, lossRatio, projectRenewal, runningTotals, termDays, elapsedDays, r2, type Projection } from './maths'

type Row = Record<string, any>

export type LedgerLineKind = 'premium' | 'endorsement' | 'credit' | 'insurer_note' | 'claim' | 'movement'
export type LedgerLine = {
  date: string
  kind: LedgerLineKind
  label: string
  /** What the insurer billed, before GST, signed. */
  insurer_amount: number | null
  /** What TRS billed the client, before GST, signed. */
  trs_amount: number | null
  gst: number | null
  claim_claimed: number | null
  claim_paid: number | null
  pax: number | null
  running_net: number
  needs_review: boolean
  links: { label: string; url: string }[]
  source: { table: string; id: string }
}

export type PolicyHead = {
  id: string; company_id: string | null; company_name: string | null; insurer: string | null; class: string | null; product_line: string | null
  policy_number: string | null; start_date: string | null; end_date: string | null; lifecycle: string | null; currency: string
  premium: number | null; sum_insured: number | null; is_eb: boolean
}

export type PeriodFigures = {
  policy_id: string; policy_number: string | null; start_date: string | null; end_date: string | null
  premium_inception: number | null
  endorsements_net: number; endorsements_count: number
  premium_net: number
  gst: number
  earned_premium: number
  claims_count: number; claims_open: number; claims_paid: number; claims_claimed: number
  loss_ratio: number | null
  members_inception: number | null; members_now: number | null; joiners: number; leavers: number
  rate_per_head: number | null
  sum_insured: number | null
}

export type RenewalPack = {
  policy: PolicyHead
  as_of: string
  term_days: number; elapsed_days: number
  current: PeriodFigures
  prior: PeriodFigures | null
  projection: Projection
  missing: string[]
}

const num = (v: unknown): number | null => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)

export async function policyHead(policyId: string): Promise<PolicyHead | null> {
  const [p] = await sbTry<Row[]>(`policies?id=eq.${enc(policyId)}&select=id,company_id,insurer,class_of_insurance,product_line,policy_number,start_date,end_date,lifecycle,currency,premium,sum_insured,is_eb&limit=1`, [])
  if (!p) return null
  // policies has two keys into companies (client and chosen insurer), so the name is read apart rather than embedded.
  const [c] = p.company_id ? await sbTry<Row[]>(`companies?id=eq.${enc(p.company_id)}&select=company_name&limit=1`, []) : [null]
  return {
    id: p.id, company_id: p.company_id ?? null, company_name: c?.company_name ?? null, insurer: p.insurer ?? null,
    class: p.class_of_insurance ?? null, product_line: p.product_line ?? null, policy_number: p.policy_number ?? null,
    start_date: p.start_date ?? null, end_date: p.end_date ?? null, lifecycle: p.lifecycle ?? null, currency: p.currency ?? 'SGD',
    premium: num(p.premium), sum_insured: num(p.sum_insured), is_eb: !!p.is_eb,
  }
}

/**
 * The policy's renewal chain: the company's policies with the same base number or identity
 * token, else the same insurer and class, oldest first. The policy itself is in the list.
 */
export async function renewalChain(head: PolicyHead): Promise<PolicyHead[]> {
  if (!head.company_id) return [head]
  const rows = await sbTry<Row[]>(`policies?company_id=eq.${enc(head.company_id)}&select=id,company_id,insurer,class_of_insurance,product_line,policy_number,start_date,end_date,lifecycle,currency,premium,sum_insured,is_eb&limit=200`, [])
  const tokens = new Set(policyTokens(head.policy_number))
  const base = basePolicyNumber(head.policy_number)
  const insurerCore = (s: string | null) => (s ?? '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 6)
  const same = rows.filter(p => {
    if (p.id === head.id) return true
    if (tokens.size && policyTokens(p.policy_number).some(t => tokens.has(t))) return true
    if (base && basePolicyNumber(p.policy_number) === base) return true
    const cls = (head.class ?? head.product_line ?? '').toLowerCase()
    const pcls = (p.class_of_insurance ?? p.product_line ?? '').toLowerCase()
    return !!cls && cls === pcls && insurerCore(p.insurer) === insurerCore(head.insurer) && insurerCore(head.insurer) !== ''
  })
  return same.map(p => ({
    id: p.id, company_id: p.company_id ?? null, company_name: head.company_name, insurer: p.insurer ?? null, class: p.class_of_insurance ?? null,
    product_line: p.product_line ?? null, policy_number: p.policy_number ?? null, start_date: p.start_date ?? null, end_date: p.end_date ?? null,
    lifecycle: p.lifecycle ?? null, currency: p.currency ?? 'SGD', premium: num(p.premium), sum_insured: num(p.sum_insured), is_eb: !!p.is_eb,
  })).sort((a, b) => String(a.start_date ?? '').localeCompare(String(b.start_date ?? '')) || a.id.localeCompare(b.id))
}

const threadUrl = (id: string | null | undefined) => (id ? `/engagement?thread=${id}` : null)

/** Every line of one policy's ledger, oldest first, with the running net premium. */
export async function getPolicyLedger(policyId: string): Promise<{ policy: PolicyHead; lines: LedgerLine[] } | null> {
  const policy = await policyHead(policyId)
  if (!policy) return null
  const [dns, txs, claims, moves] = await Promise.all([
    sbTry<Row[]>(`debit_notes?policy_id=eq.${enc(policyId)}&select=id,debit_note_no,issue_date,event_type,gross_amount,gst_amount,net_amount,commission,line_items,status,paid_amount,currency,endorsement_effective_date&order=issue_date.asc`, []),
    sbTry<Row[]>(`policy_transactions?policy_id=eq.${enc(policyId)}&select=id,kind,note_no,issued_on,pax,amount,currency,description,period_start,period_end,insurer,source_thread_id,evidence,needs_review,debit_note_id&order=issued_on.asc.nullslast`, []),
    sbTry<Row[]>(`claims?policy_id=eq.${enc(policyId)}&select=id,work_item_id,claimant,loss_date,notified_at,stage,amount_claimed,amount_settled,insurer_ref,loss_summary,created_at,closed_at&order=created_at.asc`, []),
    sbTry<Row[]>(`policy_movements?policy_id=eq.${enc(policyId)}&select=id,kind,member_name,effective_on,pax,status,estimate_amount,transaction_id,reported_thread_id,created_at&order=effective_on.asc.nullslast`, []),
  ])
  const lines: LedgerLine[] = []
  // TRS's debit notes bill the client what the insurer charged, GST included where the insurer
  // charged it (DN260101 S$659.20 = QBE's S$604.77 + S$54.43 GST). gst_amount is TRS's own GST, usually 0.
  for (const d of dns) {
    const gross = r2(num(d.gross_amount) ?? 0)
    const kind: LedgerLineKind = d.event_type === 'endorsement' ? (gross < 0 ? 'credit' : 'endorsement') : 'premium'
    const first = Array.isArray(d.line_items) && d.line_items[0]?.description ? String(d.line_items[0].description) : null
    lines.push({
      date: d.issue_date ?? '', kind, label: `${d.debit_note_no}${first ? ` · ${first}` : ''}`,
      insurer_amount: null, trs_amount: gross, gst: num(d.gst_amount), claim_claimed: null, claim_paid: null, pax: null, running_net: 0,
      needs_review: false, links: [{ label: d.debit_note_no, url: `/api/debit-notes/${d.id}/pdf` }], source: { table: 'debit_notes', id: d.id },
    })
  }
  // An insurer note that matches a TRS note (the insurer's total with GST, or its premium, within
  // S$1 of what TRS billed, within 45 days) sits on that line.
  for (const t of txs) {
    const amt = r2(num(t.amount) ?? 0)
    const gst = num(t.evidence?.gst?.value)
    const withGst = gst != null ? r2(amt + gst) : null
    const when = t.issued_on ?? t.period_start ?? ''
    const close = (a: number, b: number) => Math.abs(Math.abs(a) - Math.abs(b)) <= 1 && Math.sign(a) === Math.sign(b)
    const twin = lines.find(l => l.source.table === 'debit_notes' && l.insurer_amount == null && l.trs_amount != null && (close(l.trs_amount, amt) || (withGst != null && close(l.trs_amount, withGst)))
      && (!when || !l.date || Math.abs(Date.parse(when) - Date.parse(l.date)) <= 45 * 86_400_000))
    const links: { label: string; url: string }[] = []
    if (t.evidence?.drive_url) links.push({ label: t.evidence.filename ?? 'Document', url: String(t.evidence.drive_url) })
    else if (t.evidence?.document_id) links.push({ label: t.evidence.filename ?? 'Document', url: `/api/documents/${t.evidence.document_id}/file` })
    const th = threadUrl(t.source_thread_id); if (th) links.push({ label: 'Thread', url: th })
    if (twin) { twin.insurer_amount = amt; twin.links.push(...links); twin.needs_review = twin.needs_review || !!t.needs_review; continue }
    lines.push({
      date: when, kind: 'insurer_note', label: `${t.insurer ?? policy.insurer ?? 'Insurer'} ${t.kind === 'credit' ? 'credit' : 'debit'} note${t.note_no ? ` ${t.note_no}` : ''}`,
      insurer_amount: amt, trs_amount: null, gst: num(t.evidence?.gst?.value), claim_claimed: null, claim_paid: null, pax: num(t.pax), running_net: 0,
      needs_review: !!t.needs_review, links, source: { table: 'policy_transactions', id: t.id },
    })
  }
  for (const c of claims) {
    lines.push({
      date: c.loss_date ?? c.notified_at ?? String(c.created_at ?? '').slice(0, 10), kind: 'claim',
      label: `Claim${c.claimant ? ` · ${c.claimant}` : ''}${c.insurer_ref ? ` · ${c.insurer_ref}` : ''} · ${c.stage}`,
      insurer_amount: null, trs_amount: null, gst: null, claim_claimed: num(c.amount_claimed), claim_paid: num(c.amount_settled), pax: null, running_net: 0,
      needs_review: false, links: [{ label: 'Claim', url: `/claims?claim=${c.id}` }, ...(c.work_item_id ? [{ label: 'Case', url: `/today/${c.work_item_id}` }] : [])], source: { table: 'claims', id: c.id },
    })
  }
  for (const m of moves) {
    lines.push({
      date: m.effective_on ?? String(m.created_at ?? '').slice(0, 10), kind: 'movement',
      label: `${m.kind === 'join' ? 'Joiner' : m.kind === 'leave' ? 'Leaver' : 'Change'} · ${m.member_name} · ${m.status}`,
      insurer_amount: null, trs_amount: null, gst: null, claim_claimed: null, claim_paid: null, pax: num(m.pax), running_net: 0,
      needs_review: false, links: threadUrl(m.reported_thread_id) ? [{ label: 'Thread', url: threadUrl(m.reported_thread_id)! }] : [], source: { table: 'policy_movements', id: m.id },
    })
  }
  lines.sort((a, b) => a.date.localeCompare(b.date) || a.source.table.localeCompare(b.source.table))
  const running = runningTotals(lines.map(l => l.trs_amount ?? l.insurer_amount ?? null))
  lines.forEach((l, i) => { l.running_net = running[i] })
  return { policy, lines }
}

async function coverFacts(policy: PolicyHead): Promise<Record<string, string>> {
  if (!policy.company_id) return {}
  // Keys read "premium.gross:A5614771:2026[:endorsement][:renewal]"; the policy's own period wins
  // over other years, the in-force schedule over an endorsement, both over a renewal invitation.
  const rows = await sbTry<Row[]>(`company_facts?policy_id=eq.${enc(policy.id)}&superseded_by=is.null&select=key,value,source_date&order=source_date.desc.nullslast&limit=200`, [])
  const year = (policy.start_date ?? '').slice(0, 4)
  const out: Record<string, string> = {}
  const rank = (k: string) => (k.includes(':renewal') ? 0 : k.includes(':endorsement') ? 2 : 4) + (year && k.split(':')[2] === year ? 1 : 0)
  const best: Record<string, number> = {}
  for (const r of rows) {
    const k = String(r.key), name = k.split(':')[0] + (k.endsWith(':renewal') ? ':renewal' : '')
    if (!(name in out) || rank(k) > best[name]) { out[name] = String(r.value); best[name] = rank(k) }
  }
  return out
}

const DAY = 86_400_000
const shift = (iso: string, days: number) => new Date(Date.parse(iso) + days * DAY).toISOString().slice(0, 10)

/**
 * The lines that belong to a period: dated from a month before its start (the insurer bills
 * ahead) to its end, with two months' grace after the end for credits, endorsements and insurer
 * notes (a leaver refunded after expiry). A premium note after the end is the next period's.
 * A policy with no dates keeps every line.
 */
export function linesInPeriod(lines: LedgerLine[], start: string | null, end: string | null): LedgerLine[] {
  if (!start || !end) return lines
  const lo = shift(start, -31), hi = shift(end, 62)
  return lines.filter(l => !l.date || (l.date >= lo && l.date <= (l.kind === 'premium' ? end : hi)))
}

/**
 * Which lines are the period's inception premium: TRS's new-business and renewal notes dated
 * within 45 days of the start. A "new business" note months later is an endorsement the note
 * was not marked as (debit_notes.event_type defaults to new_business).
 */
export function inceptionLines(lines: LedgerLine[], start: string | null): LedgerLine[] {
  const premium = lines.filter(l => l.kind === 'premium')
  if (!start) return premium
  const cutoff = shift(start, 45)
  const early = premium.filter(l => !l.date || l.date <= cutoff)
  return early.length ? early : premium.slice(0, 1)
}

/** The figures for one period: the policy's own, or an earlier twelve months of the same record. */
async function periodFigures(policy: PolicyHead, asOf: string, window?: { start: string; end: string }): Promise<PeriodFigures> {
  const all = (await getPolicyLedger(policy.id))?.lines ?? []
  const start = window?.start ?? policy.start_date, end = window?.end ?? policy.end_date
  const lines = linesInPeriod(all, start, end)
  const facts = window ? {} : await coverFacts(policy)
  policy = { ...policy, start_date: start, end_date: end }
  const premiumLines = inceptionLines(lines, start)
  // An earlier window of the same record has only its lines to go on; the policy row's premium is this period's.
  const inception = premiumLines.length ? r2(premiumLines.reduce((s, l) => s + (l.trs_amount ?? l.insurer_amount ?? 0), 0)) : window ? null : (policy.premium ?? num(facts['premium.gross']))
  const isInception = new Set(premiumLines)
  const endorsements = lines.filter(l => !isInception.has(l) && (l.kind === 'endorsement' || l.kind === 'credit' || l.kind === 'premium' || (l.kind === 'insurer_note' && premiumLines.length > 0)))
  const endorsementsNet = r2(endorsements.reduce((s, l) => s + (l.trs_amount ?? l.insurer_amount ?? 0), 0))
  const premiumNet = r2((inception ?? 0) + endorsementsNet)
  const gst = r2(lines.reduce((s, l) => s + (l.gst ?? 0), 0))
  const claims = lines.filter(l => l.kind === 'claim')
  const claimsPaid = r2(claims.reduce((s, l) => s + (l.claim_paid ?? 0), 0))
  const claimsClaimed = r2(claims.reduce((s, l) => s + (l.claim_claimed ?? 0), 0))
  const claimsOpen = claims.filter(l => !/settled|declined|withdrawn/.test(l.label)).length
  const earned = earnedPremium(premiumNet, policy.start_date, policy.end_date, asOf)
  const members = policy.is_eb ? await sbTry<Row[]>(`policy_members?policy_id=eq.${enc(policy.id)}&select=status,joined_on,source&limit=5000`, []) : []
  const headsFact = num(facts['headcount'])
  const membersInception = members.length ? members.filter(m => m.source === 'census' || (m.joined_on && policy.start_date && m.joined_on <= policy.start_date)).length || null : headsFact
  const membersNow = members.length ? members.filter(m => m.status === 'active').length : headsFact
  const joiners = lines.filter(l => l.kind === 'movement' && l.label.startsWith('Joiner')).reduce((s, l) => s + (l.pax ?? 1), 0)
  const leavers = lines.filter(l => l.kind === 'movement' && l.label.startsWith('Leaver')).reduce((s, l) => s + (l.pax ?? 1), 0)
  const rate = num(facts['rate.per_head']) ?? (inception && membersInception ? r2(inception / membersInception) : null)
  return {
    policy_id: policy.id, policy_number: policy.policy_number, start_date: policy.start_date, end_date: policy.end_date,
    premium_inception: inception ?? null, endorsements_net: endorsementsNet, endorsements_count: endorsements.length, premium_net: premiumNet, gst,
    earned_premium: earned, claims_count: claims.length, claims_open: claimsOpen, claims_paid: claimsPaid, claims_claimed: claimsClaimed,
    loss_ratio: lossRatio(claimsPaid, earned), members_inception: membersInception, members_now: membersNow ?? null, joiners, leavers,
    rate_per_head: rate, sum_insured: policy.sum_insured ?? num(facts['sum_insured']),
  }
}

export async function getRenewalPack(policyId: string, asOf = new Date().toISOString().slice(0, 10)): Promise<RenewalPack | null> {
  const policy = await policyHead(policyId)
  if (!policy) return null
  const chain = await renewalChain(policy)
  const at = chain.findIndex(p => p.id === policy.id)
  const priorHead = at > 0 ? chain[at - 1] : null
  const current = await periodFigures(policy, asOf)
  let prior = priorHead ? await periodFigures(priorHead, priorHead.end_date ?? asOf) : null
  // One record carried across renewals: the twelve months before this period are the prior one.
  if (!prior && policy.start_date && policy.end_date) {
    const window = { start: shift(policy.start_date, -365), end: shift(policy.start_date, -1) }
    const earlier = await periodFigures(policy, window.end, window)
    if (earlier.premium_inception != null || earlier.claims_count) prior = earlier
  }
  const projection = projectRenewal({
    inceptionPremium: current.premium_inception, endorsementsNet: current.endorsements_net, lossRatio: current.loss_ratio,
    headsInception: current.members_inception, headsNow: current.members_now, ratePerHead: current.rate_per_head,
  })
  const missing: string[] = []
  if (current.premium_inception == null) missing.push('Inception premium: no debit note or schedule on file')
  if (!policy.start_date || !policy.end_date) missing.push('Policy period')
  if (current.claims_count && current.claims_paid === 0) missing.push('Claims paid: no settlement letter read')
  if (policy.is_eb && current.members_now == null) missing.push('Members now: no census or headcount on file')
  if (!prior) missing.push('Prior period: no earlier policy or earlier notes on file')
  return { policy, as_of: asOf, term_days: termDays(policy.start_date, policy.end_date), elapsed_days: elapsedDays(policy.start_date, policy.end_date, asOf), current, prior, projection, missing }
}

export type CompanyRenewalRow = { policy: PolicyHead; current: PeriodFigures; projection: Projection; missing: number }

/** Every policy of a company (or its group) with its pack figures, soonest expiry first. */
export async function getCompanyRenewals(companyId: string, asOf = new Date().toISOString().slice(0, 10)): Promise<CompanyRenewalRow[]> {
  const kids = await sbTry<Row[]>(`companies?or=(id.eq.${enc(companyId)},parent_id.eq.${enc(companyId)})&select=id`, [])
  const ids = kids.map(k => k.id as string)
  if (!ids.length) return []
  const rows = await sbTry<Row[]>(`policies?company_id=in.(${ids.join(',')})&lifecycle=in.(bound,live,renewal_due,lapsed,closed)&select=id&order=end_date.asc.nullslast&limit=100`, [])
  const out: CompanyRenewalRow[] = []
  for (const r of rows) {
    const pack = await getRenewalPack(r.id, asOf)
    if (pack) out.push({ policy: pack.policy, current: pack.current, projection: pack.projection, missing: pack.missing.length })
  }
  return out
}
