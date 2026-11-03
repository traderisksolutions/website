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
  it('routes by employee count: packages to 50, Income and Singlife to 100, custom above', () => {
    const eb = (n: string): RequestLine => ({ product_line: 'employee_benefits', spec: { fields: { member_count: n, census: 'attached', start_date: '2026-12-01' } } })
    expect(reviewRequest(ctx([eb('40 staff')])).reviews[0].notes[0]).toMatch(/package cards priced in-house/)
    expect(reviewRequest(ctx([eb('80')])).reviews[0].notes[0]).toMatch(/QBE MCare\+ takes up to 50/)
    const big = reviewRequest(ctx([eb('300 employees')], 'renewal of our existing plan'))
    expect(big.reviews[0].notes[0]).toMatch(/custom rates/)
    expect(big.asks.some(a => /GIFF/.test(a))).toBe(true)
    expect(big.asks.some(a => /renewal notice and the detailed claims/.test(a))).toBe(true)
  })
  it('asks about serious conditions unless the client already said', () => {
    const eb: RequestLine = { product_line: 'employee_benefits', spec: { fields: { member_count: '20' } } }
    expect(reviewRequest(ctx([eb])).asks.some(a => /pre-existing condition/.test(a))).toBe(true)
    expect(reviewRequest(ctx([eb], 'one staff is on chemo')).asks.some(a => /pre-existing condition/.test(a))).toBe(false)
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

describe('Phase 3 sub-agents', () => {
  const car = (fields: Record<string, string>, scope = ''): RequestLine => ({ product_line: 'construction_car', label: 'CAR', spec: { scope, fields: { project: 'X', period_months: '24', ...fields } } })
  it('CAR: tender, capacity, EAR, ground works, existing property, PEL', () => {
    const r = reviewRequest(ctx([car({ contract_value: 'S$420,000,000' }, 'piling and 2 basements, M&E installation')], 'Tender for A&A works to the existing building; please give an indicative price'))
    const notes = r.reviews[0].notes.join(' | ')
    expect(notes).toMatch(/Tender: indicative/)
    expect(notes).toMatch(/S\$420m: plan capacity/)
    expect(notes).toMatch(/consider EAR/)
    expect(r.asks.some(a => /soil investigation report/.test(a))).toBe(true)
    expect(r.asks.some(a => /existing building or property/.test(a))).toBe(true)
    expect(r.companions.map(c => c.product_line)).toEqual(['wica'])
  })
  it('CAR with WICA already asked suggests nothing; an awarded job is not a tender', () => {
    const r = reviewRequest(ctx([car({ contract_value: 'S$5m' }), { product_line: 'wica', spec: { fields: { categories: 'Site: 10, S$400,000', claims_history: 'nil' } } }], 'Letter of award attached; tender won'))
    expect(r.companions).toEqual([])
    expect(r.reviews[0].notes.join(' ')).not.toMatch(/Tender/)
  })
  it('financial lines: territory, circumstances, retro date, IPO', () => {
    const r = reviewRequest(ctx([{ product_line: 'do', spec: { fields: { business: 'medtech', limit: 'S$5m', revenue: 'S$20m' } } }], 'We are preparing for a NASDAQ IPO; our current insurer renews in March'))
    expect(r.asks.some(a => /by country/.test(a))).toBe(true)
    expect(r.asks.some(a => /retroactive date/.test(a))).toBe(true)
    expect(r.reviews[0].notes.join(' ')).toMatch(/D&O terms change at the IPO/)
    const pi = reviewRequest(ctx([{ product_line: 'professional_indemnity', spec: { fields: { business: 'consultancy' } } }], 'Most of our clients are in the USA'))
    expect(pi.reviews[0].notes.join(' ')).toMatch(/packaged PI excludes it/)
    expect(pi.asks.some(a => /incident or complaint/.test(a))).toBe(true)
  })
  it('property: occupation and sums insured always; tenancy, lender and BI when they apply', () => {
    const r = reviewRequest(ctx([{ product_line: 'iar_fire', spec: {} }], 'We rent a shop unit and the bank requires fire cover'))
    expect(r.asks.some(a => /used for, exactly/.test(a))).toBe(true)
    expect(r.asks.some(a => /tenancy agreement/.test(a))).toBe(true)
    expect(r.asks.some(a => /lender's insurance clause/.test(a))).toBe(true)
    expect(r.asks.some(a => /business interruption/.test(a))).toBe(true)
    expect(r.reviews[0].notes.join(' ')).toMatch(/package plans/)
  })
  it('motor: drivers and NCD always; a fleet aligns expiries', () => {
    const r = reviewRequest(ctx([{ product_line: 'commercial_vehicle', spec: {} }], 'Please quote our 12 lorries'))
    expect(r.asks.some(a => /licence pass date/.test(a))).toBe(true)
    expect(r.asks.some(a => /aligned to one date/.test(a))).toBe(true)
    expect(r.reviews[0].notes[0]).toMatch(/Fleet/)
  })
  it('no EAR or soil report from "Contractors\' Plant" or "soil investigation"; equipment and stock get their own questions', () => {
    const r = reviewRequest(ctx([car({ contract_value: 'S$2m' }, "Contractors' Plant, Machinery & Equipment; soil investigation works")]))
    expect(r.reviews[0].notes.join(' ')).not.toMatch(/EAR/)
    expect(r.asks.some(a => /soil investigation report/.test(a))).toBe(false)
    expect(reviewRequest(ctx([{ product_line: 'machinery_breakdown', spec: {} }])).asks).toEqual([expect.stringMatching(/equipment list/)])
    expect(reviewRequest(ctx([{ product_line: 'stock_throughput', spec: {} }])).asks[0]).toMatch(/Stock values by location/)
  })
  it('a question two lines ask is asked once', () => {
    const r = reviewRequest(ctx([{ product_line: 'professional_indemnity', label: 'PI', spec: {} }, { product_line: 'cyber', label: 'Cyber', spec: {} }]))
    expect(r.asks.filter(a => /by country/.test(a))).toEqual(['Revenue for the last year by country, including any from the USA or Canada'])
  })
  it('backdated cover on any line asks the nil-claims letter once', () => {
    const r = reviewRequest({ ...ctx([car({ contract_value: 'S$5m', start_date: '2026-10-01' }), { product_line: 'iar_fire', spec: {} }]), today: '2026-11-04' })
    expect(r.asks.filter(a => /nil-claims letter of undertaking/.test(a))).toHaveLength(1)
    expect(reviewRequest({ ...ctx([car({ contract_value: 'S$5m', start_date: '2026-12-01' })]), today: '2026-11-04' }).asks.some(a => /nil-claims/.test(a))).toBe(false)
  })
})
