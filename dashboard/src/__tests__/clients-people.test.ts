import { describe, it, expect } from 'vitest'
import { buildPeople } from '@/lib/clients/people'

const c = (id: string, extra: Record<string, unknown> = {}) => ({ id, first_name: 'A', last_name: id, email: `${id}@client.sg`, phone: null, title: null, company: null, company_id: null, is_employee: false, ...extra })

describe('People from contacts', () => {
  it('files each contact under its company (direct or junction), counts its threads and names the latest', () => {
    const rows = buildPeople(
      [c('p1', { company_id: 'co1' }), c('p2'), c('p3', { company: 'Loose Pte Ltd' })],
      new Map([['co1', 'Acme'], ['co2', 'Beta']]),
      new Map([['p2', 'co2']]),
      [{ id: 't1', contact_id: 'p1', last_message_at: '2026-11-01' }, { id: 't2', contact_id: 'p1', last_message_at: '2026-11-10' }],
    )
    const p1 = rows.find(r => r.id === 'p1')!
    expect(p1.company).toEqual({ id: 'co1', name: 'Acme' })
    expect(p1.threads).toBe(2)
    expect(p1.latestThreadId).toBe('t2')
    expect(rows.find(r => r.id === 'p2')!.company?.name).toBe('Beta')
    expect(rows.find(r => r.id === 'p3')!.companyText).toBe('Loose Pte Ltd')
    expect(rows[0].id).toBe('p1')
  })
  it('leaves out TRS staff', () => {
    expect(buildPeople([c('s', { email: 'nathan@trade-risksol.com' }), c('e', { is_employee: true })], new Map(), new Map(), [])).toEqual([])
  })
})
