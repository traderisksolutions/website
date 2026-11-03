/**
 * The renewal report, as data: the pack rendered into sections of labelled figures, the
 * renewal options table, the dates TRS commits to, and the list of what is not on file. Pure,
 * so the PDF, the page and the tests all read the same model. Numbers come from the pack only;
 * a value not on file is "—" and is named under "Not on file" with where it comes from.
 */
import { LOSS_RATIO_BANDS, r2 } from './maths'
import type { RenewalPack, PeriodFigures } from './index'

export const DASH = '—'
/** The ai_drafts.email_type of a renewal report email. */
export const RENEWAL_ADVICE = 'RENEWAL_ADVICE'

export type ReportRow = { label: string; now: string; prior: string; change: string }
export type ReportSection = { key: 'cover' | 'movements' | 'claims' | 'prior'; title: string; period: string; rows: ReportRow[] }
export type OptionRow = { option: string; premium: string; basis: string }
export type PlanRow = { step: string; date: string }
export type NotOnFile = { item: string; source: string }

export type ReportModel = {
  title: string
  client: string
  policy: { insurer: string; class: string; number: string; period: string; expiry: string | null }
  as_of: string
  sections: ReportSection[]
  options: OptionRow[]
  plan: PlanRow[]
  not_on_file: NotOnFile[]
  footnote: string
  currency: string
}

const sym = (ccy: string) => (ccy === 'SGD' ? 'S$' : `${ccy} `)
export const money = (n: number | null | undefined, ccy = 'SGD'): string =>
  n == null || !Number.isFinite(Number(n)) ? DASH : `${n < 0 ? '-' : ''}${sym(ccy)}${Math.abs(Number(n)).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const pct = (r: number | null | undefined): string => (r == null ? DASH : `${Math.round(r * 100)}%`)
const count = (n: number | null | undefined): string => (n == null ? DASH : String(n))
const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return DASH
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? DASH : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
const period = (f: { start_date: string | null; end_date: string | null } | null): string => (f ? `${fmtDate(f.start_date)} to ${fmtDate(f.end_date)}` : DASH)

const moneyChange = (a: number | null | undefined, b: number | null | undefined, ccy: string): string => (a != null && b != null ? money(r2(a - b), ccy) : DASH)
const countChange = (a: number | null | undefined, b: number | null | undefined): string => (a != null && b != null ? `${a - b >= 0 ? '+' : ''}${a - b}` : DASH)
const pctChange = (a: number | null | undefined, b: number | null | undefined): string => (a != null && b != null ? `${Math.round((a - b) * 100)} pts` : DASH)

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** The dates TRS works to, counted back from the end date: the 45, 30 and 15 day marks (src/lib/cases/renewal.ts). */
export function planDates(expiry: string | null, asOf: string): PlanRow[] {
  if (!expiry) return [{ step: 'Terms back by', date: DASH }, { step: 'Comparison to you by', date: DASH }, { step: 'Decision by', date: DASH }, { step: 'Cover renews', date: DASH }]
  const later = (d: string) => (d < asOf ? asOf : d)
  return [
    { step: 'Terms back by', date: fmtDate(later(addDays(expiry, -45))) },
    { step: 'Comparison to you by', date: fmtDate(later(addDays(expiry, -30))) },
    { step: 'Decision by', date: fmtDate(later(addDays(expiry, -15))) },
    { step: 'Cover renews', date: fmtDate(addDays(expiry, 1)) },
  ]
}

/**
 * The renewal options a client can act on. Only derivable effects carry a figure: the
 * same-rate projection and its band from the pack, and a headcount correction when the rate
 * per head and both headcounts are on file. Excess and plan changes are priced by the insurer.
 */
export function optionRows(p: RenewalPack): OptionRow[] {
  const ccy = p.policy.currency
  const c = p.current
  // A claim with no paid figure makes the loss ratio read as 0: the band is not applied until the settlement letters are read.
  const rows: OptionRow[] = [
    { option: 'Renew as is, at this year\'s rate', premium: money(p.projection.same_rate, ccy), basis: p.projection.basis },
    paidUnknown(c)
      ? { option: 'Market range', premium: DASH, basis: 'Claims paid not on file; the loss-ratio band applies once the settlement letters are read' }
      : { option: `Market range · ${p.projection.band.label}`, premium: p.projection.low == null ? DASH : `${money(p.projection.low, ccy)} to ${money(p.projection.high, ccy)}`, basis: `${p.projection.band.low_pct >= 0 ? '+' : ''}${p.projection.band.low_pct}% to +${p.projection.band.high_pct}%` },
  ]
  if (p.policy.is_eb) {
    const headsOk = c.rate_per_head != null && c.members_inception != null && c.members_now != null
    const delta = headsOk ? r2(c.rate_per_head! * (c.members_now! - c.members_inception!)) : null
    rows.push({
      option: 'Headcount correction',
      premium: delta == null ? DASH : `${delta >= 0 ? '+' : ''}${money(delta, ccy)}`,
      basis: headsOk ? `${c.members_now} heads now against ${c.members_inception} at inception, at ${money(c.rate_per_head, ccy)} per head` : 'Rate per head and headcounts needed',
    })
    rows.push({ option: 'Plan change (benefit level)', premium: DASH, basis: 'Priced by the insurer on request' })
  }
  rows.push({ option: 'Higher excess', premium: DASH, basis: 'Priced by the insurer on request' })
  return rows
}

function coverRows(p: RenewalPack): ReportRow[] {
  const ccy = p.policy.currency
  const c = p.current
  const rate = c.rate_per_head != null ? `${money(c.rate_per_head, ccy)} per head` : p.projection.basis === 'No premium on file' ? DASH : 'Annual premium'
  return [
    { label: 'Insurer', now: p.policy.insurer ?? DASH, prior: '', change: '' },
    { label: 'Class', now: p.policy.class ?? p.policy.product_line ?? DASH, prior: '', change: '' },
    { label: 'Policy number', now: p.policy.policy_number ?? DASH, prior: '', change: '' },
    { label: 'Period', now: period(p.policy), prior: '', change: '' },
    { label: 'Sum insured', now: money(c.sum_insured, ccy), prior: '', change: '' },
    { label: 'Premium at inception', now: money(c.premium_inception, ccy), prior: '', change: '' },
    { label: 'Net premium after endorsements', now: money(c.premium_net, ccy), prior: '', change: '' },
    { label: 'Rate basis', now: rate, prior: '', change: '' },
  ]
}

function movementRows(c: PeriodFigures, ccy: string, eb: boolean): ReportRow[] {
  const rows: ReportRow[] = []
  if (eb) {
    rows.push(
      { label: 'Members at inception', now: count(c.members_inception), prior: '', change: '' },
      { label: 'Joiners', now: count(c.joiners), prior: '', change: '' },
      { label: 'Leavers', now: count(c.leavers), prior: '', change: '' },
      { label: 'Net lives', now: countChange(c.joiners, c.leavers).replace(/^\+?/, m => m), prior: '', change: '' },
      { label: 'Members now', now: count(c.members_now), prior: '', change: '' },
    )
  }
  rows.push(
    { label: 'Endorsements', now: count(c.endorsements_count), prior: '', change: '' },
    { label: 'Endorsement premium, net', now: money(c.endorsements_net, ccy), prior: '', change: '' },
  )
  return rows
}

/** A claim on file with a zero figure means the figure was never read, not that nothing was paid. */
const paidUnknown = (c: PeriodFigures) => c.claims_count > 0 && c.claims_paid === 0
const claimedUnknown = (c: PeriodFigures) => c.claims_count > 0 && c.claims_claimed === 0
const paidOf = (c: PeriodFigures, ccy: string) => (paidUnknown(c) ? DASH : money(c.claims_paid, ccy))
const ratioOf = (c: PeriodFigures) => (paidUnknown(c) ? DASH : pct(c.loss_ratio))

function claimRows(c: PeriodFigures, ccy: string): ReportRow[] {
  return [
    { label: 'Claims notified', now: count(c.claims_count), prior: '', change: '' },
    { label: 'Claims open', now: count(c.claims_open), prior: '', change: '' },
    { label: 'Amount claimed', now: claimedUnknown(c) ? DASH : money(c.claims_claimed, ccy), prior: '', change: '' },
    { label: 'Claims paid', now: paidOf(c, ccy), prior: '', change: '' },
    { label: 'Premium earned to date', now: money(c.earned_premium, ccy), prior: '', change: '' },
    { label: 'Loss ratio (paid / earned)', now: ratioOf(c), prior: '', change: '' },
  ]
}

function priorRows(c: PeriodFigures, q: PeriodFigures, ccy: string, eb: boolean): ReportRow[] {
  const m = (label: string, a: number | null, b: number | null): ReportRow => ({ label, now: money(a, ccy), prior: money(b, ccy), change: moneyChange(a, b, ccy) })
  const n = (label: string, a: number | null, b: number | null): ReportRow => ({ label, now: count(a), prior: count(b), change: countChange(a, b) })
  const rows: ReportRow[] = [
    { label: 'Period', now: period(c), prior: period(q), change: '' },
    m('Premium at inception', c.premium_inception, q.premium_inception),
    m('Endorsement premium, net', c.endorsements_net, q.endorsements_net),
    n('Endorsements', c.endorsements_count, q.endorsements_count),
    m('Net premium', c.premium_net, q.premium_net),
    n('Claims notified', c.claims_count, q.claims_count),
    { label: 'Claims paid', now: paidOf(c, ccy), prior: paidOf(q, ccy), change: paidUnknown(c) || paidUnknown(q) ? DASH : moneyChange(c.claims_paid, q.claims_paid, ccy) },
    { label: 'Loss ratio', now: ratioOf(c), prior: ratioOf(q), change: paidUnknown(c) || paidUnknown(q) ? DASH : pctChange(c.loss_ratio, q.loss_ratio) },
  ]
  if (eb) rows.push(n('Members at inception', c.members_inception, q.members_inception), n('Members now', c.members_now, q.members_now), m('Rate per head', c.rate_per_head, q.rate_per_head))
  return rows
}

/** What the pack could not supply, and the document or step that supplies it. */
export function notOnFile(p: RenewalPack): NotOnFile[] {
  const c = p.current
  const out: NotOnFile[] = []
  if (c.premium_inception == null) out.push({ item: 'Premium at inception', source: 'the policy schedule or the inception debit note' })
  if (!p.policy.start_date || !p.policy.end_date) out.push({ item: 'Policy period', source: 'the policy schedule' })
  if (c.sum_insured == null && !p.policy.is_eb) out.push({ item: 'Sum insured', source: 'the policy schedule' })
  if (c.claims_count && c.claims_paid === 0) out.push({ item: 'Claims paid', source: 'awaiting insurer settlement letters' })
  if (p.policy.is_eb && c.members_inception == null) out.push({ item: 'Members at inception', source: 'the census at bind' })
  if (p.policy.is_eb && c.members_now == null) out.push({ item: 'Members now', source: 'the insurer member listing' })
  if (p.policy.is_eb && c.rate_per_head == null) out.push({ item: 'Rate per head', source: 'the policy schedule or an insurer debit note' })
  if (!p.prior) out.push({ item: 'Prior period', source: 'the earlier policy record or its notes' })
  return out
}

export function buildReportModel(p: RenewalPack): ReportModel {
  const ccy = p.policy.currency
  const eb = p.policy.is_eb
  const cls = p.policy.class ?? p.policy.product_line ?? 'Policy'
  const sections: ReportSection[] = [
    { key: 'cover', title: 'Cover summary', period: period(p.policy), rows: coverRows(p) },
    { key: 'movements', title: 'Movements this period', period: period(p.current), rows: movementRows(p.current, ccy, eb) },
    { key: 'claims', title: 'Claims this period', period: period(p.current), rows: claimRows(p.current, ccy) },
  ]
  if (p.prior) sections.push({ key: 'prior', title: 'Prior period comparison', period: `${period(p.current)} against ${period(p.prior)}`, rows: priorRows(p.current, p.prior, ccy, eb) })
  const bands = LOSS_RATIO_BANDS.map(b => `${b.band.label}: ${b.band.low_pct >= 0 ? '+' : ''}${b.band.low_pct}% to +${b.band.high_pct}%`).join('; ')
  return {
    title: `Renewal of ${cls}`,
    client: p.policy.company_name ?? DASH,
    policy: { insurer: p.policy.insurer ?? DASH, class: cls, number: p.policy.policy_number ?? DASH, period: period(p.policy), expiry: p.policy.end_date },
    as_of: fmtDate(p.as_of),
    sections,
    options: optionRows(p),
    plan: planDates(p.policy.end_date, p.as_of),
    not_on_file: notOnFile(p),
    footnote: `Projection uses the loss-ratio bands in src/lib/policies/ledger/maths.ts (${bands}). ${p.projection.assumptions.join(' ')}`,
    currency: ccy,
  }
}

/** The email that carries the report: three lines, one decision, one date. */
export function adviceEmail(m: ReportModel, opts: { greeting: string | null; expiry: string | null }): { subject: string; body: string } {
  const decisionBy = m.plan.find(r => r.step === 'Decision by')?.date ?? DASH
  const subject = `Renewal of ${m.policy.class} · ${m.policy.insurer} · expiring ${fmtDate(opts.expiry)}`
  const body = [
    `Dear ${opts.greeting ?? 'Sir/Madam'},`,
    '',
    `Attached is the renewal report for your ${m.policy.class} policy with ${m.policy.insurer} (${m.policy.number}), expiring ${fmtDate(opts.expiry)}: this year's premium, endorsements and claims, and the premium range for next year.`,
    `The decision needed is in the Renewal options table: renew as is, or ask us to quote the alternatives listed.`,
    `Please let us have your choice by ${decisionBy}, so terms are confirmed before expiry.`,
    '',
    'Best regards,',
    '{owner_name}',
    'Trade Risk Solutions',
  ].join('\n')
  return { subject, body }
}
