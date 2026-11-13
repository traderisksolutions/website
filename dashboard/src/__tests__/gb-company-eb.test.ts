import { describe, expect, it } from 'vitest'
import { ebHref } from '@/lib/gb/company-eb'

const co = { id: 'c1', name: 'OUE Limited' }

describe('ebHref', () => {
  it('opens the newest quotation of the company at Compare cover', () => {
    const qs = [
      { id: 'old', company_name: 'OUE Ltd', created_at: '2026-10-01T00:00:00Z' },
      { id: 'new', company_name: 'OUE Limited', created_at: '2026-11-13T00:00:00Z' },
      { id: 'other', company_name: 'Empyrion DC', created_at: '2026-11-14T00:00:00Z' },
    ]
    expect(ebHref(co, qs)).toBe('/pricing-matrix/quote/new/compare')
  })
  it('opens New quotation for the company when it has no quotation', () => {
    expect(ebHref(co, [{ id: 'x', company_name: 'Empyrion DC', created_at: '2026-11-14T00:00:00Z' }]))
      .toBe('/pricing-matrix/new?company=OUE%20Limited&companyId=c1')
  })
})
