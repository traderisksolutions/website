/**
 * The client portfolio (13 Nov 2026, Jarod): every business ranked by the commission TRS earns
 * from it, with the admin it takes beside it, so the top 20% that earn most can have their admin
 * automated and the time saved goes to winning other clients.
 *
 * A business is a company group (src/lib/admin/k/deposit.ts directory().group): an entity and the
 * entities it owns count once. Every figure is read from records; nothing is estimated:
 *   commission  debit notes, SGD only (USD notes are counted apart, never converted)
 *   premium     debit notes' gross amount (policies rarely carry a premium)
 *   admin       emails TRS sent and received (company_ledger), requests opened (follow_ups, put
 *               under the client its thread is about, as Nexus does),
 *               each over the window the records cover, stated as a monthly rate
 *   claims      count, and claims paid ÷ premium billed with how many claims carry a paid amount
 *
 * Pure and safe in the browser; loaded from the database by portfolio-load.ts. Tested in
 * src/__tests__/client-portfolio.test.ts.
 */

export const REQUEST_TYPES = ['Claims', 'Members and endorsements', 'Billing and payment', 'Documents and certificates', 'Quotations and renewals', 'Other'] as const
export type RequestType = typeof REQUEST_TYPES[number]

/** A request in words → its type. Order matters: "claims payment" is a claim, not billing. */
export function requestType(what: string): RequestType {
  const t = what.toLowerCase()
  if (/\bclaim|payout|reimburs|medical report|\bbill for\b|summari[sz]ed bill/.test(t)) return 'Claims'
  if (/endors|\benrol|member|dependa?e?nt|new ?born|deletion|addition|movement|census|headcount|employee list/.test(t)) return 'Members and endorsements'
  if (/payment|\bpay\b|premium|invoice|debit (note|advice)|credit note|refund|commission|outstanding|collateral|receipt/.test(t)) return 'Billing and payment'
  if (/cover note|certificate|\bcoi\b|wording|schedule|policy (document|agreement)|\bloi\b|\blog\b|letter|issue|signed|form/.test(t)) return 'Documents and certificates'
  if (/quot|renewal|proposal|placement|competitive|terms|underwrit/.test(t)) return 'Quotations and renewals'
  return 'Other'
}

export type PortfolioInput = {
  today: string                                                                       // YYYY-MM-DD
  window: '12m' | 'all'
  businesses: { id: string; name: string; kind: string | null }[]                     // group roots
  groupOf: (companyId: string) => string
  debitNotes: { company_id: string | null; issue_date: string | null; gross_amount: number | null; commission: number | null; currency: string | null }[]
  claims: { company_id: string | null; amount_claimed: number | null; amount_settled: number | null }[]
  policies: { company_id: string | null; end_date: string | null; lifecycle: string | null }[]
  emails: { group_id: string | null; kind: string; occurred_at: string }[]           // ledger email_out / email_in
  requests: { company_id: string | null; owner_party: string; what: string; since_at: string }[]
}

export type PortfolioRow = {
  id: string; name: string; rank: number
  commission: number; premium: number; share: number; cumulative: number; top: boolean
  sent: number; received: number; requests: number; trsOwed: number; perMonth: { sent: number; requests: number }
  byType: Record<RequestType, number>
  commissionPerEmail: number | null
  claims: number; claimsWithAmount: number; paid: number; lossRatio: number | null
  nextRenewal: string | null
}
export type Portfolio = {
  window: '12m' | 'all'; from: string | null; to: string
  rows: PortfolioRow[]
  summary: {
    businesses: number; commission: number; topCount: number; topShare: number
    topSentShare: number | null; topRequestShare: number | null
    topByType: Record<RequestType, number>
    usd: { notes: number; commission: number }
    emailsFrom: string | null; requestsFrom: string | null
  }
}

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }
const monthsBetween = (from: string | null, to: string) => from ? Math.max(1, (Date.parse(to) - Date.parse(from)) / (30.44 * 86_400_000)) : 1
const zero = () => Object.fromEntries(REQUEST_TYPES.map(t => [t, 0])) as Record<RequestType, number>

export function buildPortfolio(i: PortfolioInput): Portfolio {
  const yearAgo = new Date(Date.parse(i.today) - 365 * 86_400_000).toISOString().slice(0, 10)
  const inWindow = (d: string | null) => i.window === 'all' || (!!d && d.slice(0, 10) >= yearAgo)
  const business = new Map(i.businesses.map(b => [b.id, b]))
  const rows = new Map<string, PortfolioRow>()
  const row = (companyId: string | null): PortfolioRow | null => {
    if (!companyId) return null
    const g = i.groupOf(companyId)
    const b = business.get(g)
    if (!b) return null
    let r = rows.get(g)
    if (!r) {
      r = { id: g, name: b.name, rank: 0, commission: 0, premium: 0, share: 0, cumulative: 0, top: false, sent: 0, received: 0, requests: 0, trsOwed: 0, perMonth: { sent: 0, requests: 0 }, byType: zero(), commissionPerEmail: null, claims: 0, claimsWithAmount: 0, paid: 0, lossRatio: null, nextRenewal: null }
      rows.set(g, r)
    }
    return r
  }
  const usd = { notes: 0, commission: 0 }
  let firstNote: string | null = null
  for (const d of i.debitNotes) {
    if (!inWindow(d.issue_date)) continue
    if ((d.currency ?? 'SGD') !== 'SGD') { usd.notes++; usd.commission += n(d.commission); continue }
    const r = row(d.company_id); if (!r) continue
    r.commission += n(d.commission); r.premium += n(d.gross_amount)
    if (d.issue_date && (!firstNote || d.issue_date < firstNote)) firstNote = d.issue_date
  }
  for (const c of i.claims) {
    const r = row(c.company_id); if (!r) continue
    r.claims++
    if (c.amount_settled != null) r.claimsWithAmount++
    r.paid += n(c.amount_settled)
  }
  for (const p of i.policies) {
    const r = row(p.company_id); if (!r || !p.end_date || p.end_date < i.today || p.lifecycle === 'cancelled') continue
    if (!r.nextRenewal || p.end_date < r.nextRenewal) r.nextRenewal = p.end_date
  }
  const emailsFrom = i.emails.reduce<string | null>((a, e) => !a || e.occurred_at < a ? e.occurred_at : a, null)
  for (const e of i.emails) {
    const r = e.group_id ? row(e.group_id) : null; if (!r) continue
    if (e.kind === 'email_out') r.sent++; else if (e.kind === 'email_in') r.received++
  }
  const requestsFrom = i.requests.reduce<string | null>((a, e) => !a || e.since_at < a ? e.since_at : a, null)
  for (const q of i.requests) {
    const r = row(q.company_id); if (!r) continue
    r.requests++; r.byType[requestType(q.what)]++
    if (q.owner_party === 'trs') r.trsOwed++
  }
  const emailMonths = monthsBetween(emailsFrom, i.today), requestMonths = monthsBetween(requestsFrom, i.today)
  const list = [...rows.values()].filter(r => r.commission > 0 || r.sent + r.received + r.requests + r.claims > 0)
  const total = list.reduce((a, r) => a + r.commission, 0)
  list.sort((a, b) => b.commission - a.commission || b.premium - a.premium || a.name.localeCompare(b.name))
  const earning = list.filter(r => r.commission > 0).length
  const topCount = Math.ceil(earning * 0.2)
  let cum = 0
  list.forEach((r, k) => {
    r.rank = k + 1
    r.share = total ? r.commission / total : 0
    cum += r.commission; r.cumulative = total ? cum / total : 0
    r.top = k < topCount
    r.perMonth = { sent: Math.round(r.sent / emailMonths * 10) / 10, requests: Math.round(r.requests / requestMonths * 10) / 10 }
    r.commissionPerEmail = r.sent ? Math.round(r.commission / r.sent) : null
    r.lossRatio = r.premium > 0 && r.claimsWithAmount > 0 ? r.paid / r.premium : null
    r.commission = Math.round(r.commission * 100) / 100; r.premium = Math.round(r.premium * 100) / 100
  })
  const top = list.filter(r => r.top)
  const sum = (rs: PortfolioRow[], k: 'sent' | 'requests') => rs.reduce((a, r) => a + r[k], 0)
  const topByType = zero()
  for (const r of top) for (const t of REQUEST_TYPES) topByType[t] += r.byType[t]
  return {
    window: i.window, from: i.window === '12m' ? yearAgo : firstNote, to: i.today, rows: list,
    summary: {
      businesses: earning, commission: Math.round(total * 100) / 100, topCount, topShare: total ? top.reduce((a, r) => a + r.commission, 0) / total : 0,
      topSentShare: sum(list, 'sent') ? sum(top, 'sent') / sum(list, 'sent') : null,
      topRequestShare: sum(list, 'requests') ? sum(top, 'requests') / sum(list, 'requests') : null,
      topByType, usd: { notes: usd.notes, commission: Math.round(usd.commission * 100) / 100 },
      emailsFrom: emailsFrom?.slice(0, 10) ?? null, requestsFrom: requestsFrom?.slice(0, 10) ?? null,
    },
  }
}
