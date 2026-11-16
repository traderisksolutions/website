import { describe, expect, it } from 'vitest'
import { CURRENT, OPTIONS_MAX, PREMIUM, PREMIUM_LABEL, ROWS_MAX, amountOf, byNeed, changeText, cleanComparison, keepFiles, newComparison, offered, premiumLines, summaryModel, wishCounts, type Comparison } from '../compare'

const W1 = '11111111-1111-4111-8111-111111111111'
const W2 = '22222222-2222-4222-8222-222222222222'
const W3 = '33333333-3333-4333-8333-333333333333'
const MSG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

describe('newComparison', () => {
  it('opens with the current policy alone, the terms of the line and the premium last', () => {
    const c = newComparison('general', ' Insurer A ')
    expect(c.options).toEqual([{ id: CURRENT, name: 'Current policy', insurer: 'Insurer A', file: null }])
    expect(c.rows[0].label).toBe('Scope of cover')
    expect(c.rows.at(-1)).toEqual({ id: PREMIUM, label: PREMIUM_LABEL, cells: {} })
    expect(offered(c)).toBe(0)
  })
  it('lists the soft factors of an Employment Benefits policy', () => {
    const labels = newComparison('employment_benefits').rows.map(r => r.label)
    expect(labels).toContain('Hospital ward')
    expect(labels).toContain('Pre-existing conditions')
  })
  it('survives its own bounds unchanged', () => {
    const c = newComparison('general', 'Insurer A')
    expect(cleanComparison(c)).toEqual(c)
  })
})

describe('cleanComparison', () => {
  it('puts the current policy first and names an unnamed option', () => {
    const c = cleanComparison({ options: [{ id: 'a1', name: '' }, { id: 'current', name: 'Something else', insurer: 'Insurer A' }] })
    expect(c.options.map(o => [o.id, o.name])).toEqual([[CURRENT, 'Current policy'], ['a1', 'Option 1']])
    expect(c.options[0].insurer).toBe('Insurer A')
  })
  it('adds the current policy when it is missing and keeps four options on offer', () => {
    const c = cleanComparison({ options: ['a', 'b', 'c', 'd', 'e', 'f'].map(id => ({ id, name: id })) })
    expect(c.options).toHaveLength(OPTIONS_MAX)
    expect(c.options.map(o => o.id)).toEqual([CURRENT, 'a', 'b', 'c', 'd'])
  })
  it('drops an option with a bad or repeated id', () => {
    const c = cleanComparison({ options: [{ id: 'a' }, { id: 'a' }, { id: 'B!' }, { id: 7 }, null] })
    expect(c.options.map(o => o.id)).toEqual([CURRENT, 'a'])
  })
  it('keeps a file only with the email it is on', () => {
    const c = cleanComparison({ options: [{ id: 'a', file: { message_id: MSG, filename: ' Quotation.pdf ' } }, { id: 'b', file: { message_id: 'nope', filename: 'x.pdf' } }, { id: 'c', file: { message_id: MSG } }] })
    expect(c.options.map(o => o.file)).toEqual([null, { message_id: MSG, filename: 'Quotation.pdf' }, null, null])
  })
  it('drops a cell for an option not on the list and keeps line breaks in a cell', () => {
    const c = cleanComparison({ options: [{ id: 'a' }], rows: [{ id: 't1', label: ' Excess ', cells: { current: 'S$500\n\n\n\nS$1,000 water damage', a: '  ', gone: 'x' } }] })
    expect(c.rows[0]).toEqual({ id: 't1', label: 'Excess', cells: { current: 'S$500\n\nS$1,000 water damage' } })
  })
  it('always ends with one premium row, whatever was sent', () => {
    const c = cleanComparison({ rows: [{ id: PREMIUM, label: 'Renamed', cells: { current: '1,000' } }, { id: 't1', label: 'Excess' }, { id: PREMIUM, cells: { current: '2,000' } }] })
    expect(c.rows.map(r => r.id)).toEqual(['t1', PREMIUM])
    expect(c.rows[1]).toEqual({ id: PREMIUM, label: PREMIUM_LABEL, cells: { current: '2,000' } })
  })
  it('drops an empty row and bounds the count', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ id: `t${i}`, label: `Term ${i}` }))
    const c = cleanComparison({ rows: [{ id: 'x', label: ' ', cells: {} }, ...many] })
    expect(c.rows).toHaveLength(ROWS_MAX)
    expect(c.rows.at(-1)?.id).toBe(PREMIUM)
    expect(c.rows.some(r => r.id === 'x')).toBe(false)
  })
  it('keeps a mark only on a wish of the case, for an option on the list, with a known value', () => {
    const c = cleanComparison({ options: [{ id: 'a' }], wishes: { [W1]: { a: 'met', current: 'maybe', gone: 'met' }, [W2]: { a: 'not_met' }, 'not-a-note': { a: 'met' } } }, new Set([W1]))
    expect(c.wishes).toEqual({ [W1]: { a: 'met' } })
  })
  it('keeps a recommendation only for an option on the list', () => {
    expect(cleanComparison({ options: [{ id: 'a' }], recommended: 'a', note: '  Lower excess,\n same cover. ' })).toMatchObject({ recommended: 'a', note: 'Lower excess, same cover.' })
    expect(cleanComparison({ options: [{ id: 'a' }], recommended: 'b' }).recommended).toBeNull()
    expect(cleanComparison({ recommended: CURRENT }).recommended).toBe(CURRENT)
  })
  it('answers an empty comparison for anything that is not one', () => {
    for (const raw of [null, 'x', 4, []]) expect(cleanComparison(raw)).toEqual({ options: [{ id: CURRENT, name: 'Current policy', insurer: null, file: null }], rows: [{ id: PREMIUM, label: PREMIUM_LABEL, cells: {} }], wishes: {}, recommended: null, note: null })
  })
})

describe('amountOf', () => {
  it('reads one figure, with or without the currency and the commas', () => {
    expect(amountOf('S$12,345.60')).toBe(12345.6)
    expect(amountOf('sgd 12345')).toBe(12345)
    expect(amountOf(' $980.5 ')).toBe(980.5)
    expect(amountOf('0')).toBe(0)
  })
  it('answers null for anything that is not one figure', () => {
    for (const t of ['', null, undefined, 'TBA', '12,000 + 500 fee', '1,23', '12k', '-500', 'S$']) expect(amountOf(t)).toBeNull()
  })
})

const filled = (): Comparison => cleanComparison({
  options: [{ id: 'a', name: 'Insurer A' }, { id: 'b', name: 'Insurer B' }, { id: 'c', name: 'Insurer C' }],
  rows: [{ id: PREMIUM, cells: { current: 'S$10,000.00', a: '9,250', b: '11,000.50', c: 'To be advised' } }],
  wishes: { [W1]: { current: 'met', a: 'met', b: 'partly' }, [W2]: { current: 'met', a: 'not_met', b: 'met' }, [W3]: { a: 'met' } },
})

describe('premiumLines', () => {
  it('subtracts the current premium from each option', () => {
    expect(premiumLines(filled())).toEqual([
      { option: CURRENT, amount: 10000, change: null, pct: null },
      { option: 'a', amount: 9250, change: -750, pct: -7.5 },
      { option: 'b', amount: 11000.5, change: 1000.5, pct: 10 },
      { option: 'c', amount: null, change: null, pct: null },
    ])
  })
  it('gives no change without a current premium', () => {
    const c = cleanComparison({ options: [{ id: 'a' }], rows: [{ id: PREMIUM, cells: { a: '9,250' } }] })
    expect(premiumLines(c)[1]).toEqual({ option: 'a', amount: 9250, change: null, pct: null })
  })
  it('gives a change and no share when the current premium is nil', () => {
    const c = cleanComparison({ options: [{ id: 'a' }], rows: [{ id: PREMIUM, cells: { current: '0', a: '500' } }] })
    expect(premiumLines(c)[1]).toEqual({ option: 'a', amount: 500, change: 500, pct: null })
  })
})

describe('wishCounts', () => {
  const wishes = [{ id: W1, text: 'Keep the 1-bedded ward', need: 'must' as const }, { id: W2, text: 'Cover pre-existing conditions', need: 'must' as const }, { id: W3, text: 'Dental', need: null }]
  it('counts the wishes an option meets in full, by kind', () => {
    const [current, a, b, c] = wishCounts(wishes, filled())
    expect(current).toEqual({ option: CURRENT, must: { met: 2, of: 2 }, nice: { met: 0, of: 1 }, unmarked: 1 })
    expect(a).toEqual({ option: 'a', must: { met: 1, of: 2 }, nice: { met: 1, of: 1 }, unmarked: 0 })
    expect(b).toEqual({ option: 'b', must: { met: 1, of: 2 }, nice: { met: 0, of: 1 }, unmarked: 1 })
    expect(c).toEqual({ option: 'c', must: { met: 0, of: 2 }, nice: { met: 0, of: 1 }, unmarked: 3 })
  })
  it('lists must-have wishes first', () => {
    expect(byNeed([{ need: null, id: 1 }, { need: 'must' as const, id: 2 }, { need: 'nice' as const, id: 3 }, { need: 'must' as const, id: 4 }]).map(w => w.id)).toEqual([2, 4, 1, 3])
  })
})

describe('changeText', () => {
  it('writes the change in money with its share of the current premium', () => {
    const [, a, b, c] = premiumLines(filled())
    expect(changeText(a)).toBe('−S$750.00 (−7.5%)')
    expect(changeText(b)).toBe('+S$1,000.50 (+10.0%)')
    expect(changeText(c)).toBeNull()
  })
  it('writes no sign on no change and no share without one', () => {
    expect(changeText({ change: 0, pct: 0 })).toBe('S$0.00 (0.0%)')
    expect(changeText({ change: 500, pct: null })).toBe('+S$500.00')
  })
})

describe('keepFiles', () => {
  const MSG2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const files = [{ message_id: MSG, filename: 'Quotation A.pdf' }]
  const stored = cleanComparison({ options: [{ id: 'a', file: { message_id: MSG2, filename: 'Private terms.pdf' } }] })
  const kept = (raw: unknown, before: Comparison | null = stored) => keepFiles(cleanComparison(raw), raw, before, files).options.map(o => o.file)

  it('keeps a document picked from the case’s files', () => {
    expect(kept({ options: [{ id: 'a', file: { message_id: MSG, filename: 'Quotation A.pdf' } }] }, null)).toEqual([null, { message_id: MSG, filename: 'Quotation A.pdf' }])
  })
  it('drops a document that is not on the case’s files', () => {
    expect(kept({ options: [{ id: 'a', file: { message_id: MSG, filename: 'Another file.pdf' } }] }, null)).toEqual([null, null])
    expect(kept({ options: [{ id: 'a', file: { message_id: MSG2, filename: 'Guessed.pdf' } }] })).toEqual([null, null])
  })
  it('keeps the document on record when the save names its email and no file name', () => {
    expect(kept({ options: [{ id: 'a', file: { message_id: MSG2, filename: '' } }] })).toEqual([null, { message_id: MSG2, filename: 'Private terms.pdf' }])
  })
  it('lets a person take the document off or pick another', () => {
    expect(kept({ options: [{ id: 'a', file: null }] })).toEqual([null, null])
    expect(kept({ options: [{ id: 'a', file: { message_id: MSG, filename: 'Quotation A.pdf' } }] })).toEqual([null, { message_id: MSG, filename: 'Quotation A.pdf' }])
  })
})

describe('summaryModel', () => {
  const wishes = [{ id: W3, text: 'Dental', need: null }, { id: W1, text: 'Keep the 1-bedded ward', need: 'must' as const }, { id: W2, text: 'Cover pre-existing conditions', need: 'must' as const }]
  const model = (c: Comparison, list = wishes) => summaryModel({ client: 'Example Logistics', title: 'Workers cover', policy: null, as_of: '16 Nov 2026', comparison: c, wishes: list })

  it('lays the options out as columns, the current policy first', () => {
    const c = cleanComparison({ ...filled(), rows: [{ id: 't1', label: 'Excess', cells: { current: '$1,000', a: '$2,500' } }, { id: 't2', label: 'Exclusions', cells: {} }, ...filled().rows], recommended: 'a', note: 'Lower premium for the same limit.' })
    const m = model({ ...c, options: c.options.map(o => (o.id === 'a' ? { ...o, insurer: 'Harbour Insurance', file: { message_id: MSG, filename: 'Quotation A.pdf' } } : o)) })
    expect(m.options.map(o => [o.name, o.document, o.recommended])).toEqual([['Current policy', null, false], ['Insurer A', 'Quotation A.pdf', true], ['Insurer B', null, false], ['Insurer C', null, false]])
    // Exclusions has no cell filled in, so the client does not see it.
    expect(m.terms).toEqual([{ label: 'Excess', cells: ['$1,000', '$2,500', '—', '—'] }])
    expect(m.premium).toEqual({ cells: ['S$10,000.00', 'S$9,250.00', 'S$11,000.50', 'To be advised'], changes: ['—', '−S$750.00 (−7.5%)', '+S$1,000.50 (+10.0%)', '—'] })
    expect(m.recommended).toEqual({ name: 'Insurer A · Harbour Insurance', reason: 'Lower premium for the same limit.' })
  })
  it('lists must-have wishes first with each option’s mark and the count met', () => {
    const m = model(filled())
    expect(m.wishes).toEqual([
      { text: 'Keep the 1-bedded ward', need: 'Must have', marks: ['Met', 'Met', 'Partly met', '—'] },
      { text: 'Cover pre-existing conditions', need: 'Must have', marks: ['Met', 'Not met', 'Met', '—'] },
      { text: 'Dental', need: 'Not graded', marks: ['—', 'Met', '—', '—'] },
    ])
    expect(m.must).toEqual(['2 of 2', '1 of 2', '1 of 2', '0 of 2'])
  })
  it('gives no count without a must-have wish and no recommendation without a choice', () => {
    const m = model(filled(), [{ id: W3, text: 'Dental', need: null }])
    expect(m.must).toBeNull()
    expect(m.recommended).toBeNull()
  })
})
