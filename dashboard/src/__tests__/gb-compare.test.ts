/**
 * The comparison engine. Values are taken from the live rate tables as at 2 Oct 2026 — QBE's
 * "$300,000" against Income's "200,000" is the first pair of cells in this system that could
 * ever be set against each other, so it is the case worth pinning.
 *
 * The behaviour under test is as much about what the engine refuses to say as what it says: no
 * score, no winner, and no ordering of a line that cannot be ordered.
 */
import { describe, it, expect } from 'vitest'
import { compare, toComparable, coverScore, sameValue, type Option } from '@/lib/gb/compare'

const opt = (key: string, insurer: string, plan: string, total: number | null,
             values: Record<string, string | number | null>, productCodes = ['GHS']): Option => ({
  key, insurerName: insurer, planCode: plan, productCodes, annualTotal: total,
  values: Object.fromEntries(Object.entries(values).map(([k, v]) => [k,
    typeof v === 'number' ? { text: null, numeric: v } : { text: v, numeric: null }])),
})

describe('toComparable', () => {
  it('parses the dollar formats the three insurers actually print', () => {
    expect(toComparable({ text: '$300,000', numeric: null }, 'sgd_limit')).toEqual({ kind: 'sgd', n: 300000 })
    expect(toComparable({ text: '200,000', numeric: null },  'sgd_limit')).toEqual({ kind: 'sgd', n: 200000 })
    expect(toComparable({ text: 'S$5,000', numeric: null },  'sgd_limit')).toEqual({ kind: 'sgd', n: 5000 })
    expect(toComparable({ text: 'SGD 1.5m', numeric: null }, 'sgd_limit')).toEqual({ kind: 'sgd', n: 1500000 })
    expect(toComparable({ text: null, numeric: 25000 },      'sgd_limit')).toEqual({ kind: 'sgd', n: 25000 })
  })

  it('treats "as charged" as its own kind, not as an unparseable string', () => {
    // It beats every finite cap on the same line, so it cannot be left as text.
    for (const t of ['As charged', 'as charged up to Annual Limit', 'Unlimited', 'No limit']) {
      expect(toComparable({ text: t, numeric: null }, 'sgd_limit').kind).toBe('as_charged')
    }
  })

  it('ranks ward classes and keeps unknown wording as text', () => {
    expect(toComparable({ text: '1 Bed', numeric: null }, 'room_tier')).toMatchObject({ kind: 'room' })
    expect(toComparable({ text: '1-Bedded', numeric: null }, 'room_tier')).toMatchObject({ kind: 'room' })
    expect(toComparable({ text: 'As per schedule', numeric: null }, 'room_tier').kind).toBe('text')
  })

  it("reads AIA's flat-dollar co-pay tiers as dollars, not as a rate", () => {
    expect(toComparable({ text: 'S$5', numeric: null }, 'percent')).toEqual({ kind: 'sgd', n: 5 })
    expect(toComparable({ text: '10%', numeric: null }, 'percent')).toEqual({ kind: 'percent', n: 10 })
  })

  it('distinguishes nothing-on-record from a value of zero', () => {
    expect(toComparable(undefined, 'sgd_limit').kind).toBe('absent')
    expect(toComparable({ text: null, numeric: null }, 'sgd_limit').kind).toBe('absent')
    expect(toComparable({ text: null, numeric: 0 }, 'sgd_limit')).toEqual({ kind: 'sgd', n: 0 })
  })
})

describe('coverScore — direction', () => {
  it('more dollars is more cover on a limit', () => {
    expect(coverScore({ kind: 'sgd', n: 300000 }, 'GHS_ANNUAL_LIMIT')!)
      .toBeGreaterThan(coverScore({ kind: 'sgd', n: 200000 }, 'GHS_ANNUAL_LIMIT')!)
  })
  it('fewer dollars is more cover on an EMM deductible', () => {
    // Denominated in dollars exactly like a limit, and works the opposite way. The trap.
    expect(coverScore({ kind: 'sgd', n: 1000 }, 'EMM_DEDUCTIBLE')!)
      .toBeGreaterThan(coverScore({ kind: 'sgd', n: 5000 }, 'EMM_DEDUCTIBLE')!)
  })
  it('a lower co-payment is more cover', () => {
    expect(coverScore({ kind: 'percent', n: 0 }, 'GHS_CO_PAYMENT')!)
      .toBeGreaterThan(coverScore({ kind: 'percent', n: 10 }, 'GHS_CO_PAYMENT')!)
  })
  it('a better ward outranks a worse one', () => {
    expect(coverScore({ kind: 'room', rank: 2, label: '1 bed' }, 'GHS_ROOM_BOARD')!)
      .toBeGreaterThan(coverScore({ kind: 'room', rank: 4, label: '4 bed' }, 'GHS_ROOM_BOARD')!)
  })
  it('as charged beats any cap', () => {
    expect(coverScore({ kind: 'as_charged' }, 'GHS_ICU')!)
      .toBeGreaterThan(coverScore({ kind: 'sgd', n: 9_000_000 }, 'GHS_ICU')!)
  })
  it('takes no part in ordering a text value or an absent one', () => {
    expect(coverScore({ kind: 'text', v: 'Worldwide' }, 'GHS_GEO_SCOPE')).toBeNull()
    expect(coverScore({ kind: 'absent' }, 'GHS_ICU')).toBeNull()
  })
})

describe('compare — premium', () => {
  const options = [
    opt('qbe-1',    'QBE',    'Plan 1', 48000, { GHS_ANNUAL_LIMIT: '$300,000' }),
    opt('income-1', 'Income', 'Plan 1', 42000, { GHS_ANNUAL_LIMIT: '200,000' }),
    opt('aia-1',    'AIA',    'PLAN 1', 51500, { GHS_ANNUAL_LIMIT: 'As charged' }),
  ]
  it('states the difference against the cheapest, in dollars and per cent', () => {
    const { premium } = compare(options)
    const by = Object.fromEntries(premium.map(p => [p.optionKey, p]))
    expect(by['income-1'].deltaAbsolute).toBe(0)
    expect(by['qbe-1'].deltaAbsolute).toBe(6000)
    expect(by['qbe-1'].deltaPercent).toBeCloseTo(14.29, 1)
    expect(by['aia-1'].deltaAbsolute).toBe(9500)
  })
  it('gives no delta at all to an option whose premium could not be computed', () => {
    const { premium } = compare([...options, opt('x', 'X', 'Plan 1', null, {})])
    expect(premium.find(p => p.optionKey === 'x')!.deltaAbsolute).toBeNull()
  })
  it('never ranks, scores or picks — only the options given, in the order given', () => {
    const c = compare(options)
    expect(c.premium.map(p => p.optionKey)).toEqual(['qbe-1', 'income-1', 'aia-1'])
    expect(Object.keys(c)).toEqual(['options', 'premium', 'groups', 'coverage'])
    expect(JSON.stringify(c)).not.toMatch(/winner|score|recommend|verdict/i)
  })
})

describe('compare — benefit lines', () => {
  it('marks the option with the most cover where the line can be ordered', () => {
    const c = compare([
      opt('qbe', 'QBE', 'Plan 1', 48000, { GHS_ANNUAL_LIMIT: '$300,000' }),
      opt('inc', 'Income', 'Plan 1', 42000, { GHS_ANNUAL_LIMIT: '200,000' }),
    ])
    const row = c.groups[0].rows.find(r => r.benefit.code === 'GHS_ANNUAL_LIMIT')!
    expect(row.differs).toBe(true)
    expect(row.orderable).toBe(true)
    expect(row.cells.find(x => x.optionKey === 'qbe')!.best).toBe(true)
    expect(row.cells.find(x => x.optionKey === 'inc')!.best).toBe(false)
  })

  it('shows a text line side by side and marks nothing as better', () => {
    const c = compare([
      opt('a', 'A', 'P1', 1, { GHS_GEO_SCOPE: 'Worldwide' }),
      opt('b', 'B', 'P1', 2, { GHS_GEO_SCOPE: 'Singapore and Malaysia' }),
    ])
    const row = c.groups[0].rows.find(r => r.benefit.code === 'GHS_GEO_SCOPE')!
    expect(row.differs).toBe(true)
    expect(row.orderable).toBe(false)
    expect(row.cells.every(x => !x.best)).toBe(true)
  })

  it('marks nothing as better when only one option has a value', () => {
    const c = compare([
      opt('a', 'A', 'P1', 1, { GHS_ICU: '$25,000' }),
      opt('b', 'B', 'P1', 2, {}),
    ])
    const row = c.groups[0].rows.find(r => r.benefit.code === 'GHS_ICU')!
    expect(row.absentCount).toBe(1)
    expect(row.orderable).toBe(false)
    expect(row.cells.every(x => !x.best)).toBe(true)
  })

  it('marks nothing as better when the options agree', () => {
    const c = compare([
      opt('a', 'A', 'P1', 1, { GHS_ANNUAL_LIMIT: '$300,000' }),
      opt('b', 'B', 'P1', 2, { GHS_ANNUAL_LIMIT: '300,000' }),
    ])
    const row = c.groups[0].rows.find(r => r.benefit.code === 'GHS_ANNUAL_LIMIT')!
    expect(row.differs).toBe(false)
    expect(row.cells.every(x => !x.best)).toBe(true)
  })

  it('leaves a line out of an option that does not cover the product at all', () => {
    // A bundled GHS+EMM premium carries EMM lines; a plain GHS option is not missing them.
    const c = compare([
      opt('aia', 'AIA', 'PLAN 1', 51500, { GHS_ANNUAL_LIMIT: 'As charged', EMM_ANNUAL_LIMIT: '$1,000,000' }, ['GHS', 'EMM']),
      opt('qbe', 'QBE', 'Plan 1', 48000, { GHS_ANNUAL_LIMIT: '$300,000' }, ['GHS']),
    ])
    const emm = c.groups.find(g => g.productCode === 'EMM')!
    expect(emm.rows[0].cells.map(x => x.optionKey)).toEqual(['aia'])
    const ghs = c.groups.find(g => g.productCode === 'GHS')!
    expect(ghs.rows[0].cells).toHaveLength(2)
  })

  it('hides a line nobody has a value for, and says how many it hid', () => {
    const c = compare([opt('a', 'A', 'P1', 1, { GHS_ANNUAL_LIMIT: '$300,000' })])
    expect(c.groups[0].rows.map(r => r.benefit.code)).toEqual(['GHS_ANNUAL_LIMIT'])
    expect(c.coverage.linesWithNothing).toBeGreaterThan(20)
    expect(c.coverage.linesCompared).toBe(1)
  })

  it('keeps empty lines when asked, for a gap report rather than a comparison', () => {
    const c = compare([opt('a', 'A', 'P1', 1, { GHS_ANNUAL_LIMIT: '$300,000' })], { hideEmpty: false })
    expect(c.groups[0].rows.length).toBeGreaterThan(20)
  })

  it('can drop the lines every option matches on', () => {
    const base = { GHS_ANNUAL_LIMIT: '$300,000', GHS_ICU: '$25,000' }
    const c = compare([
      opt('a', 'A', 'P1', 1, { ...base, GHS_ROOM_BOARD: '1 Bed' }),
      opt('b', 'B', 'P1', 2, { ...base, GHS_ROOM_BOARD: '4 Bed' }),
    ], { hideIdentical: true })
    expect(c.groups[0].rows.map(r => r.benefit.code)).toEqual(['GHS_ROOM_BOARD'])
  })

  it('reports which options have a premium with unpriced census lines', () => {
    const o = opt('a', 'A', 'P1', 1000, { GHS_ANNUAL_LIMIT: '$1' })
    const c = compare([{ ...o, pricingGaps: 3 }])
    expect(c.coverage.optionsWithPricingGaps).toEqual(['a'])
    expect(c.premium[0].pricingGaps).toBe(3)
  })
})

describe('sameValue', () => {
  it('reads the same cover printed two ways as the same cover', () => {
    expect(sameValue({ kind: 'sgd', n: 300000 }, { kind: 'sgd', n: 300000 })).toBe(true)
    expect(sameValue({ kind: 'text', v: 'Worldwide' }, { kind: 'text', v: ' worldwide ' })).toBe(true)
  })
  it('does not equate a parsed number with an unparsed string', () => {
    expect(sameValue({ kind: 'sgd', n: 300000 }, { kind: 'text', v: '$300,000' })).toBe(false)
  })
})

describe('a tier value overrides a schedule-wide one', () => {
  it('keeps the plan tier\'s own value when both exist', () => {
    // AIA carries a pre-scan room & board row with no plan code alongside the per-tier rows the
    // canonical scan produced. Which one wins must not depend on the order rows come back in.
    const o: Option = {
      key: 'aia', insurerName: 'AIA', planCode: 'PLAN 3', productCodes: ['GHS'], annualTotal: 1,
      values: { GHS_ROOM_BOARD: { text: 'PRIVATE 1 Bed', numeric: null } },
    }
    const c = compare([o])
    const row = c.groups[0].rows.find(r => r.benefit.code === 'GHS_ROOM_BOARD')!
    expect(row.cells[0].text).toBe('PRIVATE 1 Bed')
    expect(row.cells[0].comparable.kind).toBe('room')
  })
})

describe('toComparable — the forms the five insurers print (2 Oct 2026)', () => {
  const sgd = (t: string) => toComparable({ text: t, numeric: null }, 'sgd_limit')
  it('reads an amount with a period or note after it', () => {
    expect(sgd('$1,500/yr')).toEqual({ kind: 'sgd', n: 1500 })
    expect(sgd('$800 per policy year')).toEqual({ kind: 'sgd', n: 800 })
    expect(sgd('$5,000 (31d)')).toEqual({ kind: 'sgd', n: 5000 })
  })
  it('reads "as charged up to $X" as a cap of X, and "up to the annual limit" as uncapped', () => {
    expect(sgd('as charged up to $5,000')).toEqual({ kind: 'sgd', n: 5000 })
    expect(sgd('As charged to $200k')).toEqual({ kind: 'sgd', n: 200000 })
    expect(sgd('As charged up to Annual Limit')).toEqual({ kind: 'as_charged' })
  })
  it('reads nothing paid as zero', () => {
    expect(sgd('Not covered')).toEqual({ kind: 'sgd', n: 0 })
    expect(toComparable({ text: 'Nil', numeric: null }, 'percent')).toEqual({ kind: 'percent', n: 0 })
    expect(toComparable({ text: 'Nil (Major Medical add-on 20%)', numeric: null }, 'percent')).toEqual({ kind: 'percent', n: 0 })
  })
  it('leaves amounts whose meaning changes after the number as text', () => {
    expect(sgd('$150 per day up to 45 days').kind).toBe('text')
    expect(sgd('$10k illness / $20k accident').kind).toBe('text')
  })
})

