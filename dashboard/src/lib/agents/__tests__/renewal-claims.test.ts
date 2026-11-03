import { describe, it, expect } from 'vitest'
import { reviewRenewal } from '../renewal/review'
import { reviewClaim } from '../claims/review'

describe('renewal sub-agents', () => {
  it('project cover gets an extension check, not a renewal', () => {
    const r = reviewRenewal({ line: 'construction_car', flow: 'no_data', endDate: '2026-12-31' })
    expect(r.extension).toBe(true)
    expect(r.asks[0]).toMatch(/complete by 31 December 2026/)
  })
  it('EB asks the member list and notes the load when the price check says increase', () => {
    const r = reviewRenewal({ line: 'employee_benefits', flow: 'increase', endDate: '2027-01-31', employees: 40 })
    expect(r.asks[0]).toMatch(/updated member list/)
    expect(r.notes.join(' ')).toMatch(/expect a load.*compare the package cards/)
  })
  it('WICA asks wages by category; a loading means a call first', () => {
    expect(reviewRenewal({ line: 'wica', flow: 'increase', endDate: '2027-01-31' }).notes[0]).toMatch(/by phone/)
    expect(reviewRenewal({ line: 'wica', flow: 'hold', endDate: '2027-01-31' }).notes).toEqual([])
  })
  it('financial lines ask the signed declaration; general lines fall back to the line documents', () => {
    expect(reviewRenewal({ line: 'professional_indemnity', flow: 'hold', endDate: '2027-01-31' }).asks[0]).toMatch(/signed and dated within 30 days/)
    expect(reviewRenewal({ line: 'marine_cargo', flow: 'hold', endDate: '2027-01-31' }).asks).toEqual([])
  })
})

describe('claim sub-agents', () => {
  const base = { text: '', lossDate: '2026-11-01', today: '2026-11-04' }
  it('WICA: the MOM iReport and its 10-day deadline, unless already reported', () => {
    const r = reviewClaim({ ...base, cls: 'wica', text: 'worker fell, 5 days MC' })
    expect(r.asks[0].item).toMatch(/iReport/)
    expect(r.deadline).toEqual({ what: 'MOM iReport', by: '2026-11-11' })
    expect(reviewClaim({ ...base, cls: 'wica', text: 'iReport submitted, acknowledgement attached' }).deadline).toBeNull()
  })
  it('motor: report within a day, no repair before survey', () => {
    const r = reviewClaim({ ...base, cls: 'motor' })
    expect(r.deadline?.by).toBe('2026-11-02')
    expect(r.notes[0]).toMatch(/no repair before/)
  })
  it('property theft asks the police report; trade credit is read from the words', () => {
    expect(reviewClaim({ ...base, cls: 'property', text: 'Burglary at the warehouse' }).asks[0].item).toMatch(/police report/)
    const c = reviewClaim({ ...base, cls: 'other', text: 'Coface: buyer overdue on 3 invoices' })
    expect(c.kind).toBe('trade_credit')
    expect(c.asks.map(a => a.item)[0]).toMatch(/unpaid invoices/)
  })
  it('reads the backfill vocabulary too', () => {
    expect(reviewClaim({ ...base, cls: 'WICA' }).kind).toBe('wica')
    expect(reviewClaim({ ...base, cls: 'PI' }).kind).toBe('financial')
    expect(reviewClaim({ ...base, cls: 'trade_credit' }).kind).toBe('trade_credit')
    expect(reviewClaim({ ...base, cls: 'EB' }).asks).toEqual([])
  })
})
