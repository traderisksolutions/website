import { describe, it, expect } from 'vitest'
import { manualQuoteFrom, missingItems, requestBody, requestItems, requestSubject, specFromItems } from '@/lib/placement/request'

describe('requestItems', () => {
  it('lists the line\'s own fields after the insured, with what the spec holds', () => {
    const items = requestItems('wica', { fields: { business: 'Precision engineering', uen: '201900001A' } }, 'Example Client Pte Ltd')
    expect(items[0]).toMatchObject({ key: 'insured', value: 'Example Client Pte Ltd', included: true })
    expect(items.find(i => i.key === 'business')?.value).toBe('Precision engineering')
    expect(items.find(i => i.key === 'claims_history')?.value).toBe('')
    expect(items.at(-1)).toMatchObject({ key: 'notes', included: false })
  })
  it('falls back to the general facts for a line with no field list', () => {
    expect(requestItems('marine_cargo', {}, 'X').map(i => i.key)).toEqual(['insured', 'scope', 'limit', 'period', 'notes'])
  })
})

describe('specFromItems and missingItems', () => {
  it('writes general keys on the spec and the rest under fields; blanks are removed', () => {
    const items = requestItems('wica', { fields: { uen: 'old' } }, 'X').map(i => i.key === 'uen' ? { ...i, value: '' } : i.key === 'business' ? { ...i, value: 'Florist' } : i)
    const spec = specFromItems({ fields: { uen: 'old' } }, items)
    expect(spec.insured).toBe('X'); expect(spec.fields?.business).toBe('Florist'); expect(spec.fields?.uen).toBeUndefined()
    expect(missingItems(items).map(i => i.key)).toContain('claims_history')
  })
})

describe('requestBody and requestSubject', () => {
  const items = [
    { key: 'insured', label: 'Insured', hint: '', value: 'Example Client Pte Ltd', included: true },
    { key: 'claims_history', label: 'Claims history, last 3 years', hint: '', value: '', included: true },
    { key: 'incumbent', label: 'Expiring insurer and premium', hint: '', value: 'Liberty S$19,600', included: false },
  ]
  it('lists ticked items, marks the empty ones to follow, names attachments and the deadline', () => {
    const b = requestBody({ lineLabel: 'Work Injury Compensation', items, attachments: ['WIC breakdown.xlsx'], deadline: '1 Dec 2026', sender: 'Nathan' })
    expect(b).toContain('Insured: Example Client Pte Ltd')
    expect(b).toContain('Claims history, last 3 years: to follow')
    expect(b).not.toContain('Liberty S$19,600')
    expect(b).toContain('Attached: WIC breakdown.')
    expect(b).toContain('Claims history, last 3 years will follow.')
    expect(b).toContain('We would appreciate your terms by 1 Dec 2026.')
    expect(b.startsWith('Dear Underwriter,')).toBe(true)
  })
  it('names the client, the line and the kind of request', () => {
    expect(requestSubject('Example Client Pte Ltd', 'WICA', 'renewal', '2027-01-01')).toBe('(TRS) Example Client Pte Ltd | WICA renewal 2027')
    expect(requestSubject('X', 'Cyber', 'new', null)).toBe('(TRS) X | Cyber quotation')
  })
})

describe('manualQuoteFrom', () => {
  it('needs a positive premium and a real date', () => {
    expect(manualQuoteFrom({ premium: 'S$18,400', excess: 'S$500', valid_until: '2026-12-31' })).toEqual({ quote: { premium_text: 'S$18,400', premium_amount: 18400, excess_text: 'S$500', limit_text: null, valid_until: '2026-12-31', note: null } })
    expect(manualQuoteFrom({ premium: '' })).toEqual({ error: 'Enter the premium the insurer quoted' })
    expect(manualQuoteFrom({ premium: '18400', valid_until: '31/12/2026' })).toEqual({ error: 'Valid until must be a date' })
  })
})
