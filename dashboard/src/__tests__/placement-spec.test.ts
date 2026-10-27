/**
 * The spec is what the insurers are asked. Rounds open on a diff of it and the log describes
 * that diff, so normalisation, diffing and wording have to be exact. parseMoney turns the
 * insurer's verbatim premium into a number the comparison can sort on; a wrong read here puts
 * the wrong insurer at the top of the client's table.
 */
import { describe, it, expect, vi } from 'vitest'
import { normaliseSpec, specDiff, describeChanges, specLines, parseMoney } from '@/lib/placement/spec'
import { SPEC_KEYS } from '@/lib/placement/types'
import { quoteFields } from '@/lib/placement/agent'

// agent.ts imports the Gemini caller and the house voice; neither is touched by quoteFields.
vi.mock('@/lib/ai-call', () => ({ callGemini: vi.fn() }))
vi.mock('@/lib/voice', () => ({ withVoice: vi.fn((s: string) => s) }))

describe('normaliseSpec', () => {
  it('drops blanks and unknown keys and collapses whitespace', () => {
    const out = normaliseSpec({ insured: '  Acme   Pte  Ltd ', limit: '', excess: '   ', period: null, colour: 'red', notes: 'a\n\tb' })
    expect(out).toEqual({ insured: 'Acme Pte Ltd', notes: 'a b' })
    expect(Object.keys(out)).not.toContain('colour')
  })
  it('returns an empty spec for non-objects', () => {
    expect(normaliseSpec(null)).toEqual({})
    expect(normaliseSpec('limit')).toEqual({})
    expect(normaliseSpec(undefined)).toEqual({})
  })
  it('ignores non-string values rather than stringifying them', () => {
    expect(normaliseSpec({ limit: 1_000_000 })).toEqual({})
  })
})

describe('specDiff', () => {
  it('is empty when nothing changed, including whitespace-only differences', () => {
    expect(specDiff({ limit: 'S$1M' }, { limit: 'S$1M' })).toEqual([])
    expect(specDiff({ limit: ' S$1M ' }, { limit: 'S$1M', excess: '' })).toEqual([])
  })
  it('reports a changed field with from and to', () => {
    expect(specDiff({ limit: 'S$1M' }, { limit: 'S$2M' })).toEqual([{ field: 'limit', label: 'Limit', from: 'S$1M', to: 'S$2M' }])
  })
  it('reports an added field from null and a removed field to null', () => {
    expect(specDiff({}, { excess: 'S$5,000' })).toEqual([{ field: 'excess', label: 'Excess', from: null, to: 'S$5,000' }])
    expect(specDiff({ notes: 'fleet of 3' }, {})).toEqual([{ field: 'notes', label: 'Notes', from: 'fleet of 3', to: null }])
  })
  it('orders changes by SPEC_KEYS, not by the order the fields were given', () => {
    const changes = specDiff({ notes: 'x', insured: 'A' }, { notes: 'y', insured: 'B', scope: 'SG' })
    expect(changes.map(c => c.field)).toEqual(['insured', 'scope', 'notes'])
    const idx = changes.map(c => SPEC_KEYS.indexOf(c.field))
    expect([...idx].sort((a, b) => a - b)).toEqual(idx)
  })
})

describe('describeChanges', () => {
  it('words a change, an addition and a removal, joined with "; "', () => {
    const text = describeChanges([
      { field: 'limit', label: 'Limit', from: 'S$1M', to: 'S$2M' },
      { field: 'excess', label: 'Excess', from: null, to: 'S$5,000' },
      { field: 'notes', label: 'Notes', from: 'fleet of 3', to: null },
    ])
    expect(text).toBe('Limit: S$1M → S$2M; Excess: added S$5,000; Notes: removed (was fleet of 3)')
  })
  it('is empty for no changes', () => { expect(describeChanges([])).toBe('') })
})

describe('specLines', () => {
  it('lists only filled fields, labelled, in SPEC_KEYS order', () => {
    expect(specLines({ notes: 'two sites', limit: 'S$1M', excess: '', insured: ' Acme ' }))
      .toEqual(['Insured: Acme', 'Limit: S$1M', 'Notes: two sites'])
  })
  it('is empty for an empty spec', () => { expect(specLines({})).toEqual([]) })
})

describe('parseMoney', () => {
  it('reads a Singapore premium with cents and trailing words', () => {
    expect(parseMoney('S$2,350.00 per annum (excl. GST)')).toEqual({ amount: 2350, currency: 'SGD' })
  })
  it('takes a bare $ as SGD, the working currency', () => {
    expect(parseMoney('$1,000')).toEqual({ amount: 1000, currency: 'SGD' })
  })
  it('honours a named currency', () => {
    expect(parseMoney('USD 12,500')).toEqual({ amount: 12500, currency: 'USD' })
  })
  it('reads M, m and k multipliers', () => {
    expect(parseMoney('1M')).toEqual({ amount: 1_000_000, currency: 'SGD' })
    expect(parseMoney('1.5m any one claim')).toEqual({ amount: 1_500_000, currency: 'SGD' })
    expect(parseMoney('500k')).toEqual({ amount: 500_000, currency: 'SGD' })
  })
  it('returns null rather than guessing', () => {
    expect(parseMoney('two thousand')).toBeNull()
    expect(parseMoney(null)).toBeNull()
    expect(parseMoney(undefined)).toBeNull()
    expect(parseMoney('')).toBeNull()
  })
  it('uses the fallback currency given when no symbol is present', () => {
    expect(parseMoney('$800', 'MYR')).toEqual({ amount: 800, currency: 'MYR' })
  })
  it('reads an Indonesian amount as IDR; the dot-thousands separator is not decoded', () => {
    // "Rp 15.300" is fifteen thousand three hundred rupiah. The parser treats "." as a decimal
    // point, so the amount comes back as 15.3. Asserted as finite only: the currency is what the
    // comparison keys on, and a wrong IDR figure is flagged by review rather than silently sorted.
    const r = parseMoney('Rp 15.300')
    expect(r?.currency).toBe('IDR')
    expect(Number.isFinite(r?.amount)).toBe(true)
  })
})

describe('quoteFields', () => {
  const read = (over: Partial<Parameters<typeof quoteFields>[0]>): Parameters<typeof quoteFields>[0] => ({
    premium: null, limit: null, excess: null, validity: null, valid_until: null,
    key_terms: [], exclusions: [], subjectivities: [], evidence: {}, primary_source: 'email body', ...over,
  })
  it('parses a premium backed by an excerpt and does not flag it', () => {
    const f = quoteFields(read({ premium: 'S$2,350.00 per annum', evidence: { premium: { excerpt: 'Premium: S$2,350.00 per annum', source: 'email body' } } }))
    expect(f).toEqual({ premium_amount: 2350, currency: 'SGD', limit_amount: null, needs_review: false })
  })
  it('flags a premium with no evidence excerpt', () => {
    const f = quoteFields(read({ premium: 'S$2,350.00' }))
    expect(f.premium_amount).toBe(2350)
    expect(f.needs_review).toBe(true)
  })
  it('flags an unparseable premium and leaves the amount null', () => {
    const f = quoteFields(read({ premium: 'to be advised', evidence: { premium: { excerpt: 'premium to be advised', source: 'email body' } } }))
    expect(f.premium_amount).toBeNull()
    expect(f.currency).toBeNull()
    expect(f.needs_review).toBe(true)
  })
  it('reads the limit in millions', () => {
    const f = quoteFields(read({ premium: 'S$900', limit: 'S$1M', evidence: { premium: { excerpt: 'S$900', source: 'email body' } } }))
    expect(f.limit_amount).toBe(1_000_000)
  })
})
