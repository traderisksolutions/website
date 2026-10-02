/**
 * Earnings: what TRS earns, from whom, through which insurer.
 *
 * Read from debit notes. TRS's income is the commission on each note; the premium is what the
 * client paid the insurer through TRS, shown beside it because it is the volume the income comes
 * from. A credit note is a note numbered CN…, a negative premium, or a cancellation or refund, and
 * counts against income — net income is commission on debit notes less commission on credit notes.
 *
 * Lifetime value is a client's commission (or premium) across every note on record, whatever the
 * date filter, from its first note to its last. VIP clients are the fewest clients who together
 * make up 80% of lifetime value — the rule is stated on the page and nothing else decides it.
 *
 * Notes with no commission recorded are counted, not estimated. Notes in another currency are
 * left out of SGD totals and counted.
 *
 * Pure. No I/O.
 */

export type Note = {
  id: string
  no: string
  issueDate: string            // YYYY-MM-DD
  companyId: string | null
  companyName: string
  insurer: string
  className: string | null     // class of insurance, from the policy
  policyId: string | null
  eventType: string | null
  premium: number              // gross, incl. GST
  commission: number | null
  currency: string
  /** The policy this note bills: its number and when its term ends. */
  policyNumber?: string | null
  policyEnd?: string | null
}

export type Basis = 'commission' | 'premium'
export type Filter = { from: string | null; to: string | null; insurer: string | null; className: string | null }

export const isCredit = (n: Pick<Note, 'no' | 'premium' | 'eventType'>) =>
  /^CN/i.test(n.no) || n.premium < 0 || /cancel|refund|credit/i.test(n.eventType ?? '')

/** The note's value on a basis, signed: a credit note subtracts. */
export function valueOf(n: Note, basis: Basis): number {
  const v = basis === 'commission' ? (n.commission ?? 0) : n.premium
  return isCredit(n) ? -Math.abs(v) : Math.abs(v)
}

export function applyFilter(notes: Note[], f: Filter, opts: { ignoreDates?: boolean } = {}): Note[] {
  return notes.filter(n =>
    n.currency === 'SGD' &&
    (opts.ignoreDates || !f.from || n.issueDate >= f.from) &&
    (opts.ignoreDates || !f.to || n.issueDate <= f.to) &&
    (!f.insurer || n.insurer === f.insurer) &&
    (!f.className || n.className === f.className))
}

export type Totals = {
  commission: number; creditCommission: number; netCommission: number
  premium: number; creditPremium: number; netPremium: number
  debitNotes: number; creditNotes: number; clients: number; noCommission: number
}

export function totals(notes: Note[]): Totals {
  const debit = notes.filter(n => !isCredit(n)), credit = notes.filter(isCredit)
  const sum = (xs: Note[], f: (n: Note) => number) => round2(xs.reduce((a, n) => a + f(n), 0))
  const commission = sum(debit, n => n.commission ?? 0), creditCommission = sum(credit, n => Math.abs(n.commission ?? 0))
  const premium = sum(debit, n => n.premium), creditPremium = sum(credit, n => Math.abs(n.premium))
  return {
    commission, creditCommission, netCommission: round2(commission - creditCommission),
    premium, creditPremium, netPremium: round2(premium - creditPremium),
    debitNotes: debit.length, creditNotes: credit.length,
    clients: new Set(notes.map(n => n.companyId ?? n.companyName)).size,
    noCommission: notes.filter(n => n.commission == null).length,
  }
}

export type MonthPoint = { month: string; earned: number; credited: number; net: number }

/** Every month from the first to the last in range, including empty ones — a gap is information. */
export function monthly(notes: Note[], basis: Basis, from?: string | null, to?: string | null): MonthPoint[] {
  if (!notes.length && !(from && to)) return []
  const months = notes.map(n => n.issueDate.slice(0, 7)).sort()
  const start = (from ?? months[0]).slice(0, 7), end = (to ?? months[months.length - 1]).slice(0, 7)
  const out: MonthPoint[] = []
  let [y, m] = start.split('-').map(Number)
  const [ey, em] = end.split('-').map(Number)
  for (let i = 0; i < 240 && (y < ey || (y === ey && m <= em)); i++) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    const these = notes.filter(n => n.issueDate.startsWith(key))
    const earned = round2(these.filter(n => !isCredit(n)).reduce((a, n) => a + valueOf(n, basis), 0))
    const credited = round2(these.filter(isCredit).reduce((a, n) => a + valueOf(n, basis), 0))
    out.push({ month: key, earned, credited, net: round2(earned + credited) })
    m++; if (m > 12) { m = 1; y++ }
  }
  return out
}

export type ClientRow = {
  key: string; companyId: string | null; name: string
  periodValue: number; periodPremium: number; periodCommission: number; periodNotes: number
  lifetimeValue: number; lifetimePremium: number; lifetimeCommission: number
  firstIssue: string; lastIssue: string; tenureMonths: number
  policies: number; insurers: string[]; classes: string[]
  noCommission: number
  share: number          // of lifetime value, 0–1
  cumulative: number     // running share in rank order, 0–1
  rank: number
  vip: boolean
}

export const VIP_SHARE = 0.8

/**
 * One row per client. Period figures from `inPeriod`; lifetime figures from `all` (same
 * insurer/class filter, every date). Ranked by lifetime value on the basis chosen.
 */
export function clients(inPeriod: Note[], all: Note[], basis: Basis): ClientRow[] {
  const keyOf = (n: Note) => n.companyId ?? `name:${n.companyName}`
  const keys = Array.from(new Set(all.map(keyOf)))
  const rows = keys.map(k => {
    const life = all.filter(n => keyOf(n) === k), per = inPeriod.filter(n => keyOf(n) === k)
    const dates = life.map(n => n.issueDate).sort()
    const sum = (xs: Note[], b: Basis) => round2(xs.reduce((a, n) => a + valueOf(n, b), 0))
    const months = monthsBetween(dates[0], dates[dates.length - 1])
    return {
      key: k, companyId: life[0].companyId, name: life[0].companyName,
      periodValue: sum(per, basis), periodPremium: sum(per, 'premium'), periodCommission: sum(per, 'commission'), periodNotes: per.length,
      lifetimeValue: sum(life, basis), lifetimePremium: sum(life, 'premium'), lifetimeCommission: sum(life, 'commission'),
      firstIssue: dates[0], lastIssue: dates[dates.length - 1], tenureMonths: months,
      policies: new Set(life.map(n => n.policyId).filter(Boolean)).size,
      insurers: Array.from(new Set(life.map(n => n.insurer))).sort(),
      classes: Array.from(new Set(life.map(n => n.className).filter((c): c is string => !!c))).sort(),
      noCommission: life.filter(n => n.commission == null).length,
      share: 0, cumulative: 0, rank: 0, vip: false,
    }
  }).sort((a, b) => b.lifetimeValue - a.lifetimeValue || a.name.localeCompare(b.name))

  const total = rows.reduce((a, r) => a + Math.max(0, r.lifetimeValue), 0)
  let run = 0
  rows.forEach((r, i) => {
    r.rank = i + 1
    r.share = total > 0 ? Math.max(0, r.lifetimeValue) / total : 0
    // VIP while the running share BEFORE this client is under the line: the client that crosses
    // 80% is in, the next is not.
    r.vip = total > 0 && r.lifetimeValue > 0 && run < VIP_SHARE
    run += r.share
    r.cumulative = run
  })
  return rows
}

export type GroupRow = { name: string; premium: number; commission: number; notes: number; clients: number; rate: number | null }

/** By insurer or by class. Rate is commission over premium on notes that carry a commission. */
export function groupBy(notes: Note[], key: (n: Note) => string): GroupRow[] {
  const by = new Map<string, Note[]>()
  for (const n of notes) by.set(key(n), [...(by.get(key(n)) ?? []), n])
  return Array.from(by.entries()).map(([name, xs]) => {
    const withComm = xs.filter(n => n.commission != null)
    const premWithComm = withComm.reduce((a, n) => a + valueOf(n, 'premium'), 0)
    return {
      name,
      premium: round2(xs.reduce((a, n) => a + valueOf(n, 'premium'), 0)),
      commission: round2(xs.reduce((a, n) => a + valueOf(n, 'commission'), 0)),
      notes: xs.length,
      clients: new Set(xs.map(n => n.companyId ?? n.companyName)).size,
      rate: premWithComm > 0 ? withComm.reduce((a, n) => a + valueOf(n, 'commission'), 0) / premWithComm : null,
    }
  }).sort((a, b) => b.commission - a.commission || b.premium - a.premium)
}

function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number), [by, bm] = b.split('-').map(Number)
  return (by - ay) * 12 + (bm - am) + 1
}
export type Renewal = { policyId: string; policyNumber: string | null; companyId: string | null; client: string
  insurer: string; className: string | null; end: string; daysLeft: number; premium: number; commission: number }

/**
 * Policies whose term ends within `days` of `today` (and up to 30 days past, still unrenewed on
 * file): the income that has to be won again. Premium and commission are the last term's, from
 * the notes billed under that policy.
 */
export function renewalsDue(notes: Note[], today: string, days = 90): Renewal[] {
  const t0 = Date.parse(`${today}T00:00:00Z`)
  const by = new Map<string, Note[]>()
  for (const n of notes) if (n.policyId && n.policyEnd && n.currency === 'SGD') by.set(n.policyId, [...(by.get(n.policyId) ?? []), n])
  const out: Renewal[] = []
  by.forEach((xs, policyId) => {
    const end = xs[0].policyEnd!
    const daysLeft = Math.round((Date.parse(`${end}T00:00:00Z`) - t0) / 86_400_000)
    if (daysLeft < -30 || daysLeft > days) return
    out.push({
      policyId, policyNumber: xs[0].policyNumber ?? null, companyId: xs[0].companyId, client: xs[0].companyName,
      insurer: xs[0].insurer, className: xs[0].className, end, daysLeft,
      premium: round2(xs.reduce((a, n) => a + valueOf(n, 'premium'), 0)),
      commission: round2(xs.reduce((a, n) => a + valueOf(n, 'commission'), 0)),
    })
  })
  return out.sort((a, b) => a.daysLeft - b.daysLeft || b.commission - a.commission)
}

const round2 = (n: number) => Math.round(n * 100) / 100
