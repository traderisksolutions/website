/**
 * The router's suggestions: up to five insurers ticked per line, one product per insurer, each
 * with its reasons; a product that says it will not take the client is listed last, never ticked.
 */
import { describe, it, expect } from 'vitest'
import { computeStats, industryMatches, rankProducts, NO_STATS, type InsurerProduct, type ProductStats } from '@/lib/placement/rank'

const person = (email: string, is_default = false) => ({ contact_id: `c-${email}`, email, name: null, is_default, role_title: null })
const product = (id: string, insurer: string, over: Partial<InsurerProduct> = {}): InsurerProduct => ({
  id, insurer_company_id: `i-${insurer}`, insurer_name: insurer, product_line: 'wica', name: `${insurer} WICA`,
  accepts: [], declines: [], min_premium: null, max_lives: null, notes: null, status: 'active', contacts: [person(`${id}@${insurer}.com`)], ...over,
})
const stats = (over: Partial<ProductStats>): ProductStats => ({ ...NO_STATS, ...over })

describe('industryMatches', () => {
  it('matches across "&" and longer descriptions', () => {
    expect(industryMatches('F&B', 'F and B restaurants')).toBe(true)
    expect(industryMatches('Construction', 'construction and civil works')).toBe(true)
    expect(industryMatches('Marine', 'Precision engineering')).toBe(false)
    expect(industryMatches('Marine', null)).toBe(false)
  })
})

describe('rankProducts', () => {
  it('ticks five at most, one product per insurer, skipping products with nobody to ask', () => {
    const ps = [
      ...['A', 'B', 'C', 'D', 'E', 'F'].map(n => product(n.toLowerCase(), n)),
      product('a2', 'A', { name: 'A WICA Plus' }),
      product('g', 'G', { contacts: [] }),
    ]
    const r = rankProducts(ps, new Map(), { industry: null })
    const picked = r.filter(s => s.picked)
    expect(picked).toHaveLength(5)
    expect(new Set(picked.map(s => s.product.insurer_company_id)).size).toBe(5)
    expect(r.find(s => s.product.id === 'g')).toMatchObject({ picked: false, contact: null })
    expect(r.find(s => s.product.id === 'g')!.reasons).toContain('No contact on file')
  })
  it("lists a product that won't take the client last and never ticks it", () => {
    const r = rankProducts([product('x', 'X', { declines: ['Construction'] }), product('y', 'Y')], new Map(), { industry: 'Construction' })
    expect(r.map(s => s.product.id)).toEqual(['y', 'x'])
    expect(r[1]).toMatchObject({ excluded: true, picked: false })
    expect(r[1].reasons).toContain("Won't take Construction")
  })
  it('ranks appetite and track record above silence, and says why', () => {
    const m = new Map([
      ['good', stats({ asked: 4, quoted: 3, won: 2, avg_days: 1.5 })],
      ['shy', stats({ asked: 4, quoted: 1, declined: 3, declined_industries: [{ industry: 'Precision engineering', month: '2026-08' }] })],
    ])
    const r = rankProducts([product('shy', 'S'), product('new', 'N'), product('good', 'G', { accepts: ['Engineering'] })], m, { industry: 'Precision engineering' })
    expect(r[0].product.id).toBe('good')
    expect(r[0].reasons).toEqual(['Takes Engineering', 'Quoted 3 of last 4', 'Won 2', 'Replies in 1.5 days'])
    expect(r[r.length - 1].product.id).toBe('shy')
    expect(r[r.length - 1].reasons).toContain('Declined Precision engineering in Aug')
    expect(r.find(s => s.product.id === 'new')!.reasons).toContain('Not asked in the last 12 months')
  })
  it('leaves out paused products and prefers the starred person', () => {
    const r = rankProducts([product('p', 'P', { status: 'paused' }), product('q', 'Q', { contacts: [person('a@q.com'), person('b@q.com', true)] })], new Map(), { industry: null })
    expect(r.map(s => s.product.id)).toEqual(['q'])
    expect(r[0].contact?.email).toBe('b@q.com')
  })
  it('excludes a product too small for the headcount', () => {
    const r = rankProducts([product('s', 'S', { max_lives: 20 })], new Map(), { industry: null, lives: 46 })
    expect(r[0]).toMatchObject({ excluded: true, picked: false })
  })
})

describe('computeStats', () => {
  it('rolls requests up per product, falling back to insurer and line for older requests', () => {
    const products = [{ id: 'p1', insurer_company_id: 'i1', product_line: 'wica' }]
    const s = computeStats(products, [
      { id: 'd1', insurer_product_id: 'p1', insurer_company_id: 'i1', product_line: 'wica', status: 'quoted', sent_at: '2026-10-01T00:00:00Z', client_industry: null },
      { id: 'd2', insurer_product_id: null, insurer_company_id: 'i1', product_line: 'wica', status: 'declined', sent_at: '2026-08-10T00:00:00Z', client_industry: 'Marine' },
      { id: 'd3', insurer_product_id: null, insurer_company_id: 'i1', product_line: 'wica', status: 'drafted', sent_at: null, client_industry: null },
      { id: 'd4', insurer_product_id: null, insurer_company_id: 'i1', product_line: 'cyber', status: 'quoted', sent_at: '2026-10-01T00:00:00Z', client_industry: null },
    ], [
      { dispatch_id: 'd1', status: 'selected', created_at: '2026-10-03T00:00:00Z' },
      { dispatch_id: 'd1', status: 'superseded', created_at: '2026-10-02T00:00:00Z' },
    ]).get('p1')!
    expect(s).toMatchObject({ asked: 2, quoted: 1, declined: 1, won: 1, last_asked: '2026-10-01T00:00:00Z' })
    expect(s.avg_days).toBeCloseTo(1)
    expect(s.declined_industries).toEqual([{ industry: 'Marine', month: '2026-08' }])
  })
})
