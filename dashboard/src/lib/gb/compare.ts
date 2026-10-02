/**
 * Group Benefits — the side-by-side comparison.
 *
 * What this does not do: score, weight or name a winner. It lines the canonical benefit lines up,
 * states the premium difference in dollars, marks where the options differ, and says where an
 * insurer's schedule has no value on record. The value score is a separate layer (score.ts) built
 * on this output, with weights the broker sets and sees — so the facts here stay weight-free.
 *
 * It is also strict about which lines may be ordered at all. A dollar limit is arithmetic. A ward
 * class is an ordered scale. A geographical-scope or pre-existing-conditions clause is neither,
 * and is shown side by side without a better or worse.
 *
 * Pure. No I/O, no model.
 */
import {
  BENEFIT_BY_CODE, PRODUCT_BY_CODE, LOWER_IS_MORE_COVER, roomTierRank,
  type CanonBenefit, type CompareAs,
} from './canon'

/** One quoted option: an insurer's plan tier for one canonical product, with its premium. */
export type Option = {
  /** Stable identity for the column. */
  key: string
  insurerName: string
  planCode: string
  planLabel?: string | null
  /** Canonical products this option covers. A bundled premium covers more than one. */
  productCodes: string[]
  /** Annual premium for the whole census, inclusive of whatever the premium engine applied.
   *  Null when it could not be computed — shown as such, never treated as zero. */
  annualTotal: number | null
  /** Census lines the premium engine could not price. A total with gaps is not comparable to
   *  one without, and saying so is the honest answer. */
  pricingGaps?: number
  /** How far this insurer's premiums have been checked — see src/lib/gb/verification.ts. */
  verification?: 'calculator' | 'brochure' | 'unverified'
  /** Census members priced on this plan tier. Weights the tier when tiers roll up to an insurer. */
  memberCount?: number
  /** Benefit values on record for this option, keyed by canonical benefit code. */
  values: Record<string, { text: string | null; numeric: number | null }>
}

export type Comparable =
  | { kind: 'sgd'; n: number }
  | { kind: 'as_charged' }
  | { kind: 'number'; n: number }
  | { kind: 'percent'; n: number }
  | { kind: 'room'; rank: number; label: string }
  | { kind: 'boolean'; v: boolean }
  | { kind: 'text'; v: string }
  | { kind: 'absent' }

export type Cell = {
  optionKey: string
  text: string | null
  comparable: Comparable
  /** This option holds the most cover on this line. Only set where the line is orderable and
   *  the values actually differ — never on a text line, and never when every option matches. */
  best: boolean
  /** Nothing on record. Distinct from a value of zero, and from a benefit the insurer excludes:
   *  all this says is that no extracted row carries it. */
  absent: boolean
}

export type Row = {
  benefit: CanonBenefit
  productCode: string
  cells: Cell[]
  /** The options disagree on this line. The reason to show it. */
  differs: boolean
  /** Orderable at all — false for text and for lines where no two values parsed comparably. */
  orderable: boolean
  /** How many options have nothing on record here. */
  absentCount: number
}

export type PremiumRow = {
  optionKey: string
  annualTotal: number | null
  /** Difference against the cheapest option with a total. Zero on the cheapest itself. */
  deltaAbsolute: number | null
  deltaPercent: number | null
  pricingGaps: number
}

export type Comparison = {
  options: Option[]
  /** Employees in the census (dependants excluded) — the denominator of PEPM. Absent on
   *  comparisons stored before 2 Oct 2026. */
  employees?: number
  premium: PremiumRow[]
  /** Rows grouped by canonical product, in canon order. */
  groups: { productCode: string; productName: string; rows: Row[] }[]
  /** What the comparison itself cannot answer, stated rather than left for the broker to
   *  discover: lines with no value from anybody, options whose premium has gaps. */
  coverage: {
    linesCompared: number
    linesWithEveryOption: number
    linesWithNothing: number
    optionsWithPricingGaps: string[]
  }
}

const MONEY = /^\s*(?:s?\$|sgd)?\s*([\d,]+(?:\.\d+)?)\s*(k|m)?\s*$/i
/** A dollar amount followed only by words that restate the period or the basis — "$1,500/yr",
 *  "$800 per policy year", "$5,000 (31d)". Anything else after the amount ("per day up to 45
 *  days", "illness / $20k accident") changes what the number means and stays text. */
const MONEY_QUALIFIED = /^\s*(?:s?\$|sgd)\s*([\d,]+(?:\.\d+)?)\s*(k|m)?\s*(?:\/\s*(?:yr|year|annum)|per\s+(?:policy\s+)?(?:year|annum)|p\.?\s?a\.?|per\s+disab\w*|\([^)]*\))\s*$/i
/** "As charged up to $5,000" is a $5,000 cap, not unlimited cover. */
const AS_CHARGED_CAPPED = /as\s*(?:charged|incurred)\D{0,20}?(?:s?\$|sgd)\s*([\d,]+(?:\.\d+)?)\s*(k|m)?/i
const NOTHING = /^\s*(nil|none|not\s+covered|no\s+cover(age)?|excluded)\s*\.?\s*$/i

/** Parse a printed benefit value into something that can be set against another insurer's. */
export function toComparable(
  raw: { text: string | null; numeric: number | null } | undefined,
  compareAs: CompareAs,
): Comparable {
  const text = raw?.text?.trim() ?? null
  const numeric = raw?.numeric ?? null
  if (!text && numeric == null) return { kind: 'absent' }

  // "As charged" / "as incurred" beats any finite cap on the same line, so it is its own kind
  // rather than an unparseable string — unless a dollar cap follows it.
  const capped = text?.match(AS_CHARGED_CAPPED)
  if (capped && compareAs !== 'percent' && compareAs !== 'room_tier') return { kind: 'sgd', n: money(capped) }
  if (text && /as\s*(charged|incurred)|unlimited|no\s*limit|full\s*cover/i.test(text)) {
    return { kind: 'as_charged' }
  }

  switch (compareAs) {
    case 'room_tier': {
      const rank = roomTierRank(text)
      return rank == null ? (text ? { kind: 'text', v: text } : { kind: 'absent' })
                          : { kind: 'room', rank, label: text! }
    }
    case 'percent': {
      // A leading "Nil" is this line's value; a percentage after it belongs to something else
      // ("Nil (Major Medical add-on 20%)").
      if (text && /^\s*(nil|none)\b/i.test(text)) return { kind: 'percent', n: 0 }
      const m = text?.match(/(\d+(?:\.\d+)?)\s*%/)
      if (m) return { kind: 'percent', n: Number(m[1]) }
      if (numeric != null) return { kind: 'percent', n: numeric }
      // "S$0" and "S$5" are AIA's co-pay tiers: a flat dollar amount per visit, not a rate.
      const flat = text?.match(MONEY)
      if (flat) return { kind: 'sgd', n: money(flat) }
      return text ? { kind: 'text', v: text } : { kind: 'absent' }
    }
    case 'boolean': {
      if (text && /^(yes|y|true|required|included|covered)\b/i.test(text)) return { kind: 'boolean', v: true }
      if (text && /^(no|n|false|not\s*required|excluded|not\s*covered)\b/i.test(text)) return { kind: 'boolean', v: false }
      return text ? { kind: 'text', v: text } : { kind: 'absent' }
    }
    case 'days':
    case 'salary_multiple': {
      if (numeric != null) return { kind: 'number', n: numeric }
      const m = text?.match(/(\d+(?:\.\d+)?)/)
      return m ? { kind: 'number', n: Number(m[1]) } : text ? { kind: 'text', v: text } : { kind: 'absent' }
    }
    case 'text':
      return text ? { kind: 'text', v: text } : { kind: 'absent' }
    default: {
      // Every dollar-denominated line.
      const m = text?.match(MONEY) ?? text?.match(MONEY_QUALIFIED)
      if (m) return { kind: 'sgd', n: money(m) }
      if (numeric != null) return { kind: 'sgd', n: numeric }
      // Nothing paid is a value of zero, not a missing value.
      if (text && NOTHING.test(text)) return { kind: 'sgd', n: 0 }
      return text ? { kind: 'text', v: text } : { kind: 'absent' }
    }
  }
}

function money(m: RegExpMatchArray): number {
  const n = Number(m[1].replace(/,/g, ''))
  const suffix = (m[2] ?? '').toLowerCase()
  return suffix === 'm' ? n * 1_000_000 : suffix === 'k' ? n * 1_000 : n
}

/**
 * A single score for ordering one benefit line, where that line can be ordered.
 *
 * Higher means more cover, after the direction is corrected: a co-payment or an EMM deductible
 * counts the other way, which is the mistake worth guarding against because a deductible is
 * denominated in dollars exactly like a limit. Null means this value takes no part in the
 * ordering — text, or absent.
 */
export function coverScore(c: Comparable, benefitCode: string): number | null {
  const invert = LOWER_IS_MORE_COVER.has(benefitCode)
  switch (c.kind) {
    case 'as_charged': return Number.POSITIVE_INFINITY
    case 'sgd':
    case 'number':
    case 'percent': return invert ? -c.n : c.n
    case 'room':    return -c.rank              // rank 1 is the best ward
    case 'boolean': return (invert ? !c.v : c.v) ? 1 : 0
    default:        return null
  }
}

/** Two parsed values describe the same cover. */
export function sameValue(a: Comparable, b: Comparable): boolean {
  if (a.kind !== b.kind) return false
  switch (a.kind) {
    case 'sgd': case 'number': case 'percent': return a.n === (b as typeof a).n
    case 'room':    return a.rank === (b as typeof a).rank
    case 'boolean': return a.v === (b as typeof a).v
    case 'text':    return a.v.trim().toLowerCase() === (b as typeof a).v.trim().toLowerCase()
    default:        return true                 // absent === absent, as_charged === as_charged
  }
}

export type CompareOptions = {
  /** Only these canonical benefit codes, in canon order. Defaults to every line of every
   *  product the options cover. */
  benefitCodes?: string[]
  /** Drop lines where every option carries the same value. Off by default: a line everybody
   *  matches on is still a line the client asked about. */
  hideIdentical?: boolean
  /** Drop lines no option has a value for. On by default — a row of blanks tells the broker
   *  nothing the coverage summary does not already say. */
  hideEmpty?: boolean
}

export function compare(options: Option[], opts?: CompareOptions): Comparison {
  const hideIdentical = !!opts?.hideIdentical
  const hideEmpty = opts?.hideEmpty !== false

  // ── Premium. The cheapest option sets the baseline; options whose premium could not be
  //    computed have no delta rather than a delta of zero. ──
  const totals = options.map(o => o.annualTotal).filter((n): n is number => n != null && isFinite(n))
  const cheapest = totals.length ? Math.min(...totals) : null
  const premium: PremiumRow[] = options.map(o => ({
    optionKey: o.key,
    annualTotal: o.annualTotal,
    deltaAbsolute: o.annualTotal != null && cheapest != null ? round2(o.annualTotal - cheapest) : null,
    deltaPercent: o.annualTotal != null && cheapest != null && cheapest > 0
      ? round2(((o.annualTotal - cheapest) / cheapest) * 100) : null,
    pricingGaps: o.pricingGaps ?? 0,
  }))

  // ── Which lines to show. Every canonical line of every product any option covers, so a
  //    product only one insurer offers still appears — with the others plainly absent. ──
  const productCodes = Array.from(new Set(options.flatMap(o => o.productCodes)))
    .filter(c => PRODUCT_BY_CODE[c])
    .sort((a, b) => PRODUCT_BY_CODE[a].sortOrder - PRODUCT_BY_CODE[b].sortOrder)

  const wanted = opts?.benefitCodes ? new Set(opts.benefitCodes) : null

  let linesCompared = 0, linesWithEveryOption = 0, linesWithNothing = 0
  const groups: Comparison['groups'] = []

  for (const productCode of productCodes) {
    const lines = Object.values(BENEFIT_BY_CODE)
      .filter(b => b.productCode === productCode)
      .filter(b => !wanted || wanted.has(b.code))
      .sort((a, b) => a.sortOrder - b.sortOrder)

    const rows: Row[] = []
    for (const benefit of lines) {
      // An option that does not cover this product is not "missing" the line — it was never
      // asked to carry it. Only options covering the product form the row.
      const relevant = options.filter(o => o.productCodes.includes(productCode))
      if (!relevant.length) continue

      const cells: Cell[] = relevant.map(o => {
        const comparable = toComparable(o.values[benefit.code], benefit.compareAs)
        return {
          optionKey: o.key,
          text: o.values[benefit.code]?.text ?? null,
          comparable,
          best: false,
          absent: comparable.kind === 'absent',
        }
      })

      const absentCount = cells.filter(c => c.absent).length
      const present = cells.filter(c => !c.absent)
      if (hideEmpty && present.length === 0) { linesWithNothing++; continue }
      if (present.length === 0) linesWithNothing++

      const differs = present.length > 1 &&
        !present.every(c => sameValue(c.comparable, present[0].comparable))
      // Text lines are shown, never ranked. Nor is a line where only one option has a value:
      // there is nothing to be better than.
      const scores = present.map(c => ({ c, s: coverScore(c.comparable, benefit.code) }))
        .filter((x): x is { c: Cell; s: number } => x.s != null)
      const orderable = benefit.compareAs !== 'text' && scores.length > 1 && differs

      if (orderable) {
        const top = Math.max(...scores.map(x => x.s))
        for (const x of scores) if (x.s === top) x.c.best = true
      }

      if (hideIdentical && !differs) continue
      linesCompared++
      if (absentCount === 0) linesWithEveryOption++
      rows.push({ benefit, productCode, cells, differs, orderable, absentCount })
    }

    if (rows.length) {
      groups.push({ productCode, productName: PRODUCT_BY_CODE[productCode].name, rows })
    }
  }

  return {
    options,
    premium,
    groups,
    coverage: {
      linesCompared,
      linesWithEveryOption,
      linesWithNothing,
      optionsWithPricingGaps: options.filter(o => (o.pricingGaps ?? 0) > 0).map(o => o.key),
    },
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100
