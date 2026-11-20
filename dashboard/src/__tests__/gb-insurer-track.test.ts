import { describe, expect, it } from 'vitest'
import { trackPatch, trackedInsurers } from '@/lib/gb/insurer-track'

const snap = (products: string[], n = 10, columnProducts?: Record<string, string>) => ({
  products, effectiveDate: '2027-01-01', columnProducts,
  members: Array.from({ length: n }, (_, i) => ({ name: `E${i}`, category: 'Staff', relationship: 'self', dob: '1985-01-01', occupation: null, age: null })),
})

describe('insurers on a kept quotation', () => {
  it('one row per insurer: copies fold into their product, a schedule is to quote', () => {
    const rows = trackedInsurers(snap(['Income FlexCare', 'Income FlexCare · copy', 'Great Eastern'], 10, { 'Income FlexCare · copy': 'Income FlexCare' }), [])
    expect(rows.map(r => [r.insurer, r.route, r.status])).toEqual([['Income FlexCare', 'brochure', 'not_asked'], ['Great Eastern', 'quote', 'not_asked']])
    expect(rows[1].reasons).toEqual(["The insurer's own schedule"])
  })

  it('the computed route stands unless overridden; what was kept is read back', () => {
    const rows = trackedInsurers(snap(['Steadfast MCare+'], 62), [{ insurer: 'Steadfast MCare+', route: 'brochure', route_override: true, override_reason: 'QBE agreed the card', status: 'quoted', quoted_at: '2026-11-21T00:00:00Z' }])
    expect(rows[0]).toMatchObject({ computed: 'quote', route: 'brochure', route_override: true, override_reason: 'QBE agreed the card', status: 'quoted' })
  })

  it('no census: headcount from the categories, and the reason says so', () => {
    const rows = trackedInsurers({ products: ['Steadfast MCare+'], effectiveDate: '2027-01-01', members: [], categories: [{ name: 'Staff', employees: 51 }] }, [])
    expect(rows[0].route).toBe('quote')
    expect(rows[0].reasons).toEqual(['51 employees, above the package limit of 50', 'No census on this quotation: headcount from its categories, ages not checked'])
  })

  it('a status stamps its date; an override needs a reason; back to the computed route clears it', () => {
    expect(trackPatch({ status: 'chased' }, 'quote', 'T')).toEqual({ patch: { status: 'chased', chased_at: 'T' } })
    expect(trackPatch({ status: 'not_asked' }, 'quote', 'T')).toEqual({ patch: { status: 'not_asked' } })
    expect(trackPatch({ route: 'brochure' }, 'quote', 'T')).toEqual({ error: 'Say why the route is changed.' })
    expect(trackPatch({ route: 'brochure', override_reason: ' agreed ' }, 'quote', 'T')).toEqual({ patch: { route: 'brochure', route_override: true, override_reason: 'agreed' } })
    expect(trackPatch({ route: 'quote' }, 'quote', 'T')).toEqual({ patch: { route: 'quote', route_override: false, override_reason: null } })
  })
})
