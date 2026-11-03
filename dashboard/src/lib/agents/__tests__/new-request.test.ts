import { describe, it, expect } from 'vitest'
import { reviewRequest } from '../new-request/main'
import { parseCategories } from '../new-request/wica'
import type { RequestLine } from '../new-request/types'

const ctx = (lines: RequestLine[], text = '') => ({ lines, text, inception: '2026-12-01' })
const wica = (categories: string, extra: Record<string, string> = {}): RequestLine => ({ product_line: 'wica', spec: { fields: { business: 'M&E contractor', categories, start_date: '2026-12-01', ...extra } } })

describe('WICA sub-agent', () => {
  it('reads categories with headcount and annual wages', () => {
    expect(parseCategories('Office: 16, S$1,321,520; Site: 18, S$539,322')).toEqual([
      { name: 'Office', heads: 16, wages: 1321520 }, { name: 'Site', heads: 18, wages: 539322 }])
    expect(parseCategories('Site workers - 12 pax, $30k')).toEqual([{ name: 'Site workers', heads: 12, wages: 30000 }])
  })
  it('holds wages that read as monthly or per person', () => {
    const r = reviewRequest(ctx([wica('Site: 18, S$2,400', { claims_history: 'nil' })]))
    expect(r.held).toEqual([0])
    expect(r.asks[0]).toMatch(/total annual wages of all 18/)
  })
  it('asks the job scope when categories are only "staff"', () => {
    const r = reviewRequest(ctx([wica('Staff: 20, S$900,000', { claims_history: 'nil' })]))
    expect(r.asks.some(a => /job scope/.test(a))).toBe(true)
    expect(r.held).toEqual([0])
  })
  it('notes high-earning office staff and asks claims including MOM reports', () => {
    const r = reviewRequest(ctx([wica('Office: 5, S$600,000; Site: 10, S$400,000')]))
    expect(r.held).toEqual([])
    expect(r.reviews[0].notes.join(' ')).toMatch(/outside compulsory WICA/)
    expect(r.asks.some(a => /reported to MOM/.test(a))).toBe(true)
  })
  it('suggests FWMI and bonds for work permit holders not yet asked', () => {
    const r = reviewRequest(ctx([wica('Site: 10, S$400,000', { claims_history: 'nil' })], 'We have 10 work permit holders on site'))
    expect(r.companions.map(c => c.product_line)).toEqual(['foreign_worker_medical', 'foreign_worker_bond'])
    const asked = reviewRequest(ctx([wica('Site: 10, S$400,000', { claims_history: 'nil' }), { product_line: 'foreign_worker_medical', spec: {} }], 'work permit holders, all Malaysians'))
    expect(asked.companions).toEqual([])
  })
})

describe('Liability sub-agent', () => {
  const pl = (fields: Record<string, string>, scope?: string): RequestLine => ({ product_line: 'general_liability', label: 'Public liability', spec: { scope, fields: { limit: 'S$5m', claims_history: 'nil', ...fields } } })
  it('a contract request without the clause is held', () => {
    expect(reviewRequest(ctx([pl({ purpose: 'project contract', business: 'builder' })])).held).toEqual([0])
  })
  it('PL with a CAR is contract cover: the clause is asked, not waited on, and no turnover is asked', () => {
    const r = reviewRequest(ctx([pl({ business: 'survey works' }), { product_line: 'construction_car', spec: {} }]))
    expect(r.held).toEqual([])
    expect(r.reviews[0].notes.join(' ')).toMatch(/Liability flow: contract.*CAR policy's third-party section/)
    expect(r.asks.some(a => /turnover/.test(a))).toBe(false)
  })
  it('a clause naming workmen\'s compensation and design liability suggests WICA and PI', () => {
    const r = reviewRequest(ctx([pl({ purpose: 'contract', business: 'builder', requirement: 'Contractor shall insure public liability S$5m, workmen\'s compensation and professional indemnity for design responsibility' })]))
    expect(r.companions.map(c => c.product_line)).toEqual(['wica', 'professional_indemnity'])
  })
  it('advice or design work suggests PI once', () => {
    const r = reviewRequest(ctx([pl({ purpose: 'annual business cover', business: 'interior design consultancy', turnover: 'S$2m' })]))
    expect(r.companions.map(c => c.product_line)).toEqual(['professional_indemnity'])
  })
  it('products into the USA are flagged for the specialists and asked by territory', () => {
    const r = reviewRequest(ctx([pl({ purpose: 'product liability', business: 'battery maker', products: 'batteries sold to USA and EU' })]))
    expect(r.reviews[0].notes.join(' ')).toMatch(/USA or Canada exposure/)
    expect(r.asks.some(a => /USA and Canada/.test(a))).toBe(true)
  })
  it('an event without dates or attendance is held', () => {
    const r = reviewRequest(ctx([pl({ purpose: 'event', business: 'roadshow' })], 'We need PL for our roadshow'))
    expect(r.held).toEqual([0])
  })
})

describe('EB sub-agent and the main merge', () => {
  it('asks the considerations that decide the plan, without holding', () => {
    const r = reviewRequest(ctx([{ product_line: 'employee_benefits', spec: { fields: { member_count: '40', census: 'attached', start_date: '2026-12-01' } } }], 'Please quote GHS, budget S$600 per head'))
    expect(r.held).toEqual([])
    expect(r.asks[0]).toMatch(/hospital ward/)
    expect(r.asks[0]).not.toMatch(/budget/)
  })
  it('personal accident filed as EB gets no medical questions', () => {
    const r = reviewRequest(ctx([{ product_line: 'employee_benefits', label: 'Group Personal Accident (GPA)', spec: {} }]))
    expect(r.asks).toEqual([])
  })
  it('labels asks by line when several lines are asked, and leaves other lines to their specs', () => {
    const r = reviewRequest(ctx([wica('Staff: 20, S$900,000'), { product_line: 'marine_cargo', label: 'Cargo', spec: {} }]))
    expect(r.asks[0]).toMatch(/^wica: /)
    expect(r.reviews[1]).toMatchObject({ desk: 'general', asks: [], hold: false })
  })
})
