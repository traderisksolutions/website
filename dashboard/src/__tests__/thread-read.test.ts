import { describe, expect, it } from 'vitest'
import { pickRoute, shapePlan, type ReadRoute } from '@/lib/chief/read'

const routes: ReadRoute[] = [
  { insurer: 'QBE Insurance (Singapore) Pte Ltd', productLine: 'employee_benefits', email: 'sinhui.lee@qbe.example', name: 'Sin Hui Lee', contactId: 'c1', isDefault: true },
  { insurer: 'QBE Insurance (Singapore) Pte Ltd', productLine: 'employee_benefits', email: 'other@qbe.example', name: 'Other', contactId: 'c2', isDefault: false },
  { insurer: 'QBE Insurance (Singapore) Pte Ltd', productLine: 'general_liability', email: 'pl@qbe.example', name: 'PL Desk', contactId: 'c3', isDefault: true },
  { insurer: 'Income Insurance Limited', productLine: 'employee_benefits', email: 'eb@income.example', name: null, contactId: 'c4', isDefault: false },
]
const client = { email: 'pearlin@client.example', name: 'Pearlin Chan', contactId: null }
const now = new Date('2026-11-10T10:00:00Z')

describe('pickRoute', () => {
  it('prefers the default contact for the product line, then the insurer’s other lines', () => {
    expect(pickRoute(routes, 'QBE', 'employee_benefits')?.email).toBe('sinhui.lee@qbe.example')
    expect(pickRoute(routes, 'QBE Insurance', 'general_liability')?.email).toBe('pl@qbe.example')
    expect(pickRoute(routes, 'QBE', 'marine_cargo')?.email).toBe('sinhui.lee@qbe.example')
    expect(pickRoute(routes, 'Income', null)?.email).toBe('eb@income.example')
    expect(pickRoute(routes, 'Chubb', 'employee_benefits')).toBeNull()
    expect(pickRoute(routes, null, null)).toBeNull()
  })
})

describe('shapePlan', () => {
  it('one email per insurer with its person; the client email goes to the thread’s contact; actions stay actions', () => {
    const p = shapePlan({ summary: 'Renewal terms wanted.', situation: 'Census in.', steps: [
      { kind: 'email', party: 'insurer', insurer: 'QBE', product_line: 'employee_benefits', title: 'Ask QBE for renewal terms', detail: 'Send the census.' },
      { kind: 'email', party: 'insurer', insurer: 'Income', product_line: 'employee_benefits', title: 'Ask Income for terms', detail: 'Same basis.' },
      { kind: 'email', party: 'client', title: 'Tell Pearlin the market is being approached', detail: 'Timeline mid-November.' },
      { kind: 'action', party: 'internal', title: 'Check the two members over 65', detail: 'AIA renewal-only above 70.' },
    ] }, routes, client, 'cheng@trs.example', 'm', now)
    expect(p.steps.map(s => [s.id, s.kind, s.party, s.to?.email ?? null])).toEqual([
      ['s1', 'email', 'insurer', 'sinhui.lee@qbe.example'], ['s2', 'email', 'insurer', 'eb@income.example'], ['s3', 'email', 'client', 'pearlin@client.example'], ['s4', 'action', 'internal', null],
    ])
    expect(p.steps.every(s => s.status === 'proposed')).toBe(true)
    expect(p.summary).toBe('Renewal terms wanted.')
  })
  it('an insurer with nobody on file becomes an action to find the person; a client email with no contact too', () => {
    const p = shapePlan({ steps: [
      { kind: 'email', party: 'insurer', insurer: 'Chubb', product_line: 'employee_benefits', title: 'Ask Chubb for terms', detail: 'x' },
      { kind: 'email', party: 'client', title: 'Update the client', detail: 'y' },
    ] }, routes, null, 'a', 'm', now)
    expect(p.steps[0].kind).toBe('action')
    expect(p.steps[0].detail).toContain('no contact on file at Chubb')
    expect(p.steps[1].kind).toBe('action')
  })
  it('drops duplicate titles and caps at eight', () => {
    const steps = Array.from({ length: 12 }, (_, i) => ({ kind: 'action', party: 'internal', title: `Step ${i % 10}`, detail: '' }))
    expect(shapePlan({ steps }, routes, client, 'a', 'm', now).steps).toHaveLength(8)
  })
})
