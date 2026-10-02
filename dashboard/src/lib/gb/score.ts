/**
 * Group Benefits — the value score.
 *
 * The comparison (compare.ts) lines benefits up and stops. This turns the same lines into one
 * coverage figure per insurer, divides it by the premium per employee per month, and ranks. The
 * broker sets the weights and sees them, per quotation; nothing here is a hidden preference.
 * Added 2 Oct 2026 on Jarod's decision ("Both, as the spec says") — the comparison's own header
 * argues against scoring, and this answers that argument by making every weight explicit.
 *
 * Method, in full:
 *
 *   1. Each orderable benefit line is scored 0–1 per option, against the other options on the
 *      same line. Higher-is-more lines score value / best. Co-payments score (100 − v) / (100 −
 *      lowest). Deductibles and survival periods score lowest / v. Ward class scores best rank /
 *      rank. "As charged" scores 1 and a finite cap on the same line at most 0.8. Text lines
 *      are not scored. A line needs at least two options with a value to be scored at all.
 *   2. A headline line (room & board, annual limit, co-payment…) counts twice.
 *   3. Lines roll up into four dimensions: inpatient, outpatient, life & accident, cost sharing.
 *      An option's dimension score is the weighted mean of the lines it has a value on.
 *   4. An insurer's dimension score is the member-weighted mean of its plan tiers. An insurer
 *      that does not quote a dimension another insurer does quote scores 0 on it.
 *   5. Coverage = Σ weight × dimension / Σ weight, 0–100. Every insurer is scored on the same
 *      dimensions: one enters only when every insurer quoting it has a score on it. If one
 *      insurer has nothing comparable on record for outpatient, outpatient is left out for all
 *      and the panel names who — otherwise having data would count against the insurer that has it.
 *   6. PEPM = annual premium ÷ 12 ÷ employees. Value = coverage ÷ PEPM, shown as an index where
 *      the best option is 100.
 *   7. An insurer with unpriced member lines is shown but not ranked: its premium is understated.
 *
 * What it does not do: renewal risk. The spec's renewal projection needs a claims loss ratio,
 * and no table holds claims. Lines with nothing on record are left out rather than scored 0, and
 * the count of lines scored is shown beside every figure, because an insurer whose schedule was
 * half-read would otherwise look better or worse than it is.
 *
 * Pure. No I/O, no model.
 */
import { BENEFIT_BY_CODE, LOWER_IS_MORE_COVER, PRODUCT_BY_CODE, roomTierRank } from './canon'
import type { Comparable, Comparison, Option } from './compare'
import { ageLastBirthday, parseCalendarDate, todaySGT } from '../dates/dob'

export type DimensionKey = 'inpatient' | 'outpatient' | 'life' | 'cost_sharing'

export const DIMENSIONS: { key: DimensionKey; label: string; products: string[] }[] = [
  { key: 'inpatient',    label: 'Inpatient',       products: ['GHS', 'EMM', 'GHS_FW'] },
  { key: 'outpatient',   label: 'Outpatient',      products: ['GOPC', 'GOSC', 'GD'] },
  { key: 'life',         label: 'Life & accident', products: ['GTL', 'GCI', 'GPA', 'GADD'] },
  // Spans products: a co-payment is the same trade on GHS as on GP.
  { key: 'cost_sharing', label: 'Cost sharing',    products: ['GHS', 'EMM', 'GHS_FW', 'GOPC', 'GOSC', 'GD'] },
]

export type Weights = Record<DimensionKey, number>
export const DEFAULT_WEIGHTS: Weights = { inpatient: 40, outpatient: 20, life: 20, cost_sharing: 20 }

export type SortMode = 'value' | 'pepm' | 'coverage'

export type Filters = {
  /** Most the client will pay per employee per month. */
  maxPepm: number | null
  /** Lowest ward class acceptable, as a ROOM_TIER_RANK rank (lower = better ward). */
  minWardRank: number | null
  /** Canonical products every option must quote. */
  requiredProducts: string[]
  /** Rate table ids the broker has struck out. */
  excludeTables: string[]
}
export const NO_FILTERS: Filters = { maxPepm: null, minWardRank: null, requiredProducts: [], excludeTables: [] }

/** Everything the broker sets, as stored on the quotation. */
export type ScoreSettings = { weights: Weights; filters: Filters; sort: SortMode }
export const DEFAULT_SETTINGS: ScoreSettings = { weights: DEFAULT_WEIGHTS, filters: NO_FILTERS, sort: 'value' }

/** Ward classes a broker picks from as a floor. Ranks match canon.ts ROOM_TIER_RANK. */
export const WARD_FLOORS: { rank: number; label: string }[] = [
  { rank: 2, label: '1-bed or Class A' },
  { rank: 3, label: '2-bed or Class B1' },
  { rank: 4, label: '4-bed' },
  { rank: 5, label: '6-bed, B2 or ward' },
]

/** A finite cap set against "as charged" on the same line scores at most this. */
export const AS_CHARGED_CAP = 0.8

const COST_SHARING = /(CO_PAYMENT|CO_INSURANCE|DEDUCTIBLE)$/

export function dimensionOf(benefitCode: string): DimensionKey | null {
  if (COST_SHARING.test(benefitCode)) return 'cost_sharing'
  const product = BENEFIT_BY_CODE[benefitCode]?.productCode
  const d = DIMENSIONS.find(x => x.key !== 'cost_sharing' && product && x.products.includes(product))
  return d?.key ?? null
}

/**
 * Score one line across the options holding a value on it. Returns 0–1 per option key; options
 * absent from the map take no part. Fewer than two scorable values → empty map.
 */
export function lineScores(cells: { key: string; c: Comparable }[], benefitCode: string): Map<string, number> {
  const out = new Map<string, number>()
  const invert = LOWER_IS_MORE_COVER.has(benefitCode)
  const isPercentLine = BENEFIT_BY_CODE[benefitCode]?.compareAs === 'percent'

  // A flat S$0 co-payment on a percentage line is a 0% co-payment. Any other flat amount cannot
  // be set against a percentage and stays out of the line.
  const norm = cells.map(({ key, c }) =>
    isPercentLine && c.kind === 'sgd' && c.n === 0 ? { key, c: { kind: 'percent', n: 0 } as Comparable } : { key, c })

  const scorable = norm.filter(x => ['sgd', 'number', 'percent', 'room', 'boolean', 'as_charged'].includes(x.c.kind))
  if (scorable.length < 2) return out

  // One kind per line: the most common numeric kind, with "as charged" alongside money.
  const counts: Record<string, number> = {}
  for (const x of scorable) if (x.c.kind !== 'as_charged') counts[x.c.kind] = (counts[x.c.kind] ?? 0) + 1
  const kind = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'as_charged'
  const same = scorable.filter(x => x.c.kind === kind || (x.c.kind === 'as_charged' && kind !== 'room' && kind !== 'boolean'))
  if (same.length < 2) return out

  const nums = same.filter(x => x.c.kind !== 'as_charged').map(x => (x.c as { n: number }).n)
  const anyAsCharged = same.some(x => x.c.kind === 'as_charged')

  for (const { key, c } of same) {
    let s: number
    if (c.kind === 'as_charged') s = 1
    else if (c.kind === 'room') {
      const best = Math.min(...same.map(x => (x.c as { rank: number }).rank))
      s = best / c.rank
    } else if (c.kind === 'boolean') {
      s = (invert ? !c.v : c.v) ? 1 : 0
    } else {
      // Only sgd, number and percent remain, all carrying n.
      const n = (c as { n: number }).n
      if (c.kind === 'percent' && invert) {
        const low = Math.min(...nums)
        s = low >= 100 ? 1 : (100 - n) / (100 - low)
      } else if (invert) {
        const low = Math.min(...nums), high = Math.max(...nums)
        s = low > 0 ? low / n : high > 0 ? 1 - n / high : 1
      } else {
        const high = Math.max(...nums)
        s = high > 0 ? n / high : 1
        if (anyAsCharged) s *= AS_CHARGED_CAP
      }
    }
    out.set(key, clamp01(s))
  }
  return out
}

export type DimensionScore = {
  /** 0–100, or null when quoted but nothing on record to score. */
  score: number | null
  /** The insurer quotes a product in this dimension. */
  quoted: boolean
  linesScored: number
}

export type InsurerScore = {
  tableId: string
  insurerName: string
  planLabels: string[]
  verification: Option['verification']
  productCodes: string[]
  annualTotal: number | null
  pricingGaps: number
  pepm: number | null
  dimensions: Record<DimensionKey, DimensionScore>
  coverage: number | null
  /** Coverage ÷ PEPM, indexed so the best option in view is 100. */
  valueIndex: number | null
  linesScored: number
  linesAvailable: number
  /** The least private ward across its GHS tiers. */
  worstWardRank: number | null
  /** Why a filter removed it. Empty when it is ranked. */
  excluded: string[]
  rank: number | null
}

export type ScoreResult = {
  insurers: InsurerScore[]
  activeDimensions: DimensionKey[]
  /** Dimensions left out of coverage because these insurers quote them with nothing scorable. */
  droppedDimensions: { key: DimensionKey; insurers: string[] }[]
  employees: number
  /** Total weight over active dimensions; 0 means no score can be formed. */
  weightTotal: number
}

const tableOf = (o: Option) => o.key.split(':')[0]
const lineWeight = (code: string) => (BENEFIT_BY_CODE[code]?.headline ? 2 : 1)

export function scoreComparison(cmp: Comparison, settings: ScoreSettings, employees: number): ScoreResult {
  const { weights, filters, sort } = settings
  const options = cmp.options

  // ── 1. Line scores per option. ──
  const perOption = new Map<string, Record<DimensionKey, { sum: number; w: number; n: number }>>()
  const empty = () => ({ inpatient: { sum: 0, w: 0, n: 0 }, outpatient: { sum: 0, w: 0, n: 0 },
                         life: { sum: 0, w: 0, n: 0 }, cost_sharing: { sum: 0, w: 0, n: 0 } })
  for (const o of options) perOption.set(o.key, empty())
  const scoredLinesByDim: Record<DimensionKey, Set<string>> =
    { inpatient: new Set(), outpatient: new Set(), life: new Set(), cost_sharing: new Set() }

  for (const g of cmp.groups) for (const row of g.rows) {
    const dim = dimensionOf(row.benefit.code)
    if (!dim || row.benefit.compareAs === 'text') continue
    const scores = lineScores(row.cells.filter(c => !c.absent).map(c => ({ key: c.optionKey, c: c.comparable })), row.benefit.code)
    if (!scores.size) continue
    scoredLinesByDim[dim].add(row.benefit.code)
    const w = lineWeight(row.benefit.code)
    scores.forEach((s, key) => {
      const acc = perOption.get(key)?.[dim]
      if (acc) { acc.sum += s * w; acc.w += w; acc.n++ }
    })
  }

  // ── 2. Roll plan tiers up to the insurer, weighted by members on each tier. ──
  const tables = Array.from(new Set(options.map(tableOf)))
  const dimQuotedAnywhere = (d: DimensionKey) =>
    options.some(o => o.productCodes.some(p => DIMENSIONS.find(x => x.key === d)!.products.includes(p)))

  const insurers: InsurerScore[] = tables.map(tid => {
    const opts = options.filter(o => tableOf(o) === tid)
    const productCodes = Array.from(new Set(opts.flatMap(o => o.productCodes)))
    const dims = {} as Record<DimensionKey, DimensionScore>
    let linesScored = 0, linesAvailable = 0
    for (const d of DIMENSIONS) {
      const covering = opts.filter(o => o.productCodes.some(p => d.products.includes(p)))
      const quoted = covering.length > 0
      let num = 0, den = 0, n = 0
      for (const o of covering) {
        const acc = perOption.get(o.key)![d.key]
        if (!acc.w) continue
        const m = Math.max(o.memberCount ?? 1, 1)
        num += (acc.sum / acc.w) * m; den += m; n = Math.max(n, acc.n)
      }
      if (quoted) { linesScored += n; linesAvailable += scoredLinesByDim[d.key].size }
      dims[d.key] = {
        quoted,
        linesScored: n,
        score: den ? round1((num / den) * 100) : (!quoted && dimQuotedAnywhere(d.key) && scoredLinesByDim[d.key].size ? 0 : null),
      }
    }

    const first = opts[0]
    // S$0 with unpriced lines is "nothing could be priced", not a free quote.
    const total = first.annualTotal === 0 && (first.pricingGaps ?? 0) > 0 ? null : first.annualTotal
    const pepm = total != null && employees > 0 ? round2(total / 12 / employees) : null
    const wards = opts.map(o => wardRank(o)).filter((r): r is number => r != null)

    return {
      tableId: tid, insurerName: first.insurerName,
      // Product and plan code, not the stored plan name: AIA files its plan names as "GHS".
      planLabels: Array.from(new Set(opts.map(o =>
        `${o.productCodes.map(c => PRODUCT_BY_CODE[c]?.abbrev ?? c).join('+')} ${o.planCode}`))),
      verification: first.verification, productCodes,
      annualTotal: total, pricingGaps: first.pricingGaps ?? 0, pepm,
      dimensions: dims, coverage: null, valueIndex: null,
      linesScored, linesAvailable,
      worstWardRank: wards.length ? Math.max(...wards) : null,
      excluded: [], rank: null,
    }
  })

  // ── 3. Coverage from the broker's weights, over the dimensions every insurer can be scored on. ──
  const scored = DIMENSIONS.map(d => d.key).filter(k => insurers.some(i => i.dimensions[k].score != null))
  const droppedDimensions = scored
    .map(k => ({ key: k, insurers: insurers.filter(i => i.dimensions[k].score == null).map(i => i.insurerName) }))
    .filter(d => d.insurers.length > 0)
  const activeDimensions = scored.filter(k => !droppedDimensions.some(d => d.key === k))
  const weightTotal = activeDimensions.reduce((s, k) => s + Math.max(weights[k] ?? 0, 0), 0)
  for (const i of insurers) {
    let num = 0, den = 0
    for (const k of activeDimensions) {
      const w = Math.max(weights[k] ?? 0, 0), s = i.dimensions[k].score
      if (!w || s == null) continue
      num += w * s; den += w
    }
    i.coverage = den ? round1(num / den) : null
  }

  // ── 4. Filters. A premium with unpriced member lines is understated, so its value would be
  //    overstated: it is shown, never ranked. ──
  for (const i of insurers) {
    if (i.pricingGaps > 0) i.excluded.push(`${i.pricingGaps} member line${i.pricingGaps === 1 ? '' : 's'} unpriced`)
    if (filters.excludeTables.includes(i.tableId)) i.excluded.push('Struck out')
    if (filters.maxPepm != null && i.pepm != null && i.pepm > filters.maxPepm) i.excluded.push(`Over S$${fmt(filters.maxPepm)} PEPM`)
    if (filters.minWardRank != null) {
      if (i.worstWardRank == null) i.excluded.push('Ward class not on record')
      else if (i.worstWardRank > filters.minWardRank) i.excluded.push('Below ward floor')
    }
    for (const p of filters.requiredProducts) {
      if (!i.productCodes.includes(p)) i.excluded.push(`No ${PRODUCT_BY_CODE[p]?.abbrev ?? p}`)
    }
  }

  // ── 5. Value index and rank, among those still in. ──
  const ranked = insurers.filter(i => !i.excluded.length)
  const raw = (i: InsurerScore) => (i.coverage != null && i.pepm ? i.coverage / i.pepm : null)
  const bestRaw = Math.max(0, ...ranked.map(raw).filter((v): v is number => v != null))
  for (const i of insurers) {
    const v = raw(i)
    i.valueIndex = v != null && bestRaw > 0 ? round1((v / bestRaw) * 100) : null
  }
  const key = (i: InsurerScore): number | null =>
    sort === 'pepm' ? (i.pepm == null ? null : -i.pepm) : sort === 'coverage' ? i.coverage : i.valueIndex
  const order = ranked.filter(i => key(i) != null)
    .sort((a, b) => key(b)! - key(a)! || (a.pepm ?? Infinity) - (b.pepm ?? Infinity))
  order.forEach((i, n) => { i.rank = n + 1 })

  insurers.sort((a, b) =>
    (a.rank ?? Infinity) - (b.rank ?? Infinity) || (a.pepm ?? Infinity) - (b.pepm ?? Infinity))
  return { insurers, activeDimensions, droppedDimensions, employees, weightTotal }
}

function wardRank(o: Option): number | null {
  for (const code of ['GHS_ROOM_BOARD', 'GHSFW_ROOM_BOARD']) {
    const v = o.values[code]?.text
    if (!v) continue
    const r = roomTierRank(v)
    if (r != null) return r
  }
  return null
}

/** Parse stored settings, falling back field by field so an old or hand-edited row still loads. */
export function parseSettings(raw: unknown): ScoreSettings {
  let o: Partial<ScoreSettings> = {}
  if (typeof raw === 'string') { try { o = (JSON.parse(raw) as { score?: Partial<ScoreSettings> }).score ?? {} } catch { o = {} } }
  else if (raw && typeof raw === 'object') o = (raw as { score?: Partial<ScoreSettings> }).score ?? {}
  const w = (o.weights ?? {}) as Partial<Weights>
  const f = (o.filters ?? {}) as Partial<Filters>
  const num = (v: unknown, d: number) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : d)
  return {
    weights: {
      inpatient: num(w.inpatient, DEFAULT_WEIGHTS.inpatient), outpatient: num(w.outpatient, DEFAULT_WEIGHTS.outpatient),
      life: num(w.life, DEFAULT_WEIGHTS.life), cost_sharing: num(w.cost_sharing, DEFAULT_WEIGHTS.cost_sharing),
    },
    filters: {
      maxPepm: typeof f.maxPepm === 'number' && f.maxPepm > 0 ? f.maxPepm : null,
      minWardRank: typeof f.minWardRank === 'number' ? f.minWardRank : null,
      requiredProducts: Array.isArray(f.requiredProducts) ? f.requiredProducts.filter(x => typeof x === 'string') : [],
      excludeTables: Array.isArray(f.excludeTables) ? f.excludeTables.filter(x => typeof x === 'string') : [],
    },
    sort: o.sort === 'pepm' || o.sort === 'coverage' ? o.sort : 'value',
  }
}

const clamp01 = (n: number) => (isFinite(n) ? Math.min(1, Math.max(0, n)) : 0)
const round1 = (n: number) => Math.round(n * 10) / 10
const round2 = (n: number) => Math.round(n * 100) / 100
const fmt = (n: number) => n.toLocaleString('en-SG', { maximumFractionDigits: 2 })

export type CensusProfile = {
  members: number
  employees: number
  dependants: number
  /** Age last birthday on the effective date, from date of birth; stated age where no date. */
  averageAgeEmployees: number | null
  averageAgeAll: number | null
  bands: { label: string; count: number }[]
  agesMissing: number
}

const BANDS: { label: string; lo: number; hi: number }[] = [
  { label: 'Under 30', lo: 0, hi: 29 }, { label: '30–39', lo: 30, hi: 39 }, { label: '40–49', lo: 40, hi: 49 },
  { label: '50–59', lo: 50, hi: 59 }, { label: '60 and over', lo: 60, hi: 200 },
]

export function censusProfile(
  census: { dob?: string | null; age?: number | null; relationship?: string | null }[],
  effectiveDate: string | null,
): CensusProfile {
  const on = parseCalendarDate(effectiveDate) ?? todaySGT()
  const rows = census.map(m => {
    const dob = parseCalendarDate(m.dob ?? null)
    const age = dob ? ageLastBirthday(dob, on) : typeof m.age === 'number' ? m.age : null
    return { age, employee: /^(self|employee|staff|member)$/i.test(m.relationship ?? '') || !m.relationship }
  })
  const avg = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null)
    return v.length ? round1(v.reduce((a, b) => a + b, 0) / v.length) : null
  }
  const employees = rows.filter(r => r.employee)
  return {
    members: rows.length,
    employees: employees.length,
    dependants: rows.length - employees.length,
    averageAgeEmployees: avg(employees.map(r => r.age)),
    averageAgeAll: avg(rows.map(r => r.age)),
    bands: BANDS.map(b => ({ label: b.label, count: rows.filter(r => r.age != null && r.age >= b.lo && r.age <= b.hi).length })),
    agesMissing: rows.filter(r => r.age == null).length,
  }
}
