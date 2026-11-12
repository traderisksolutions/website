import { describe, it, expect } from 'vitest'
import { normaliseLastYear, scheduleFromLastYear, planKey, amount } from '@/lib/gb/last-year'
import { ALL } from '@/lib/gb/current'

const read = {
  insurer: 'QBE Insurance (Singapore)', product: 'Steadfast MCare+', policyNumber: 'GHS-2026-11873',
  periodFrom: '2026-01-01', periodTo: '2026-12-31', lives: 120,
  categories: [
    { name: 'Management', lives: 22, plans: { GHS: 'Plan 2 · Private 1-bed · 0%', GOSC: 'Plan 1 · 0%' }, facts: { hospital: 'private', beds: 1, limitKind: 'annual', limit: 150000, coins: 0, gpCopay: 0, spLimit: 2500, dentalLimit: 1000, pa: 200000 } },
    { name: 'Staff', lives: 98, plans: { GHS: 'Plan 3 · Private 1-bed · 0%', GOSC: 'Plan 2 · 0%' }, facts: { hospital: 'private', beds: 1, limitKind: 'annual', limit: 80000, coins: 0, gpCopay: 10, spLimit: 1000, dentalLimit: 500, life: { kind: 'multiple', n: 24 } } },
  ],
  premiumByCover: { GHS: 71300, GOPC: '21,100', GOSC: 11900, GD: 8900, GPA: 5200 },
  total: 'S$118,400.00',
  changes: [{ file: 'Endorsement 2.pdf', date: '2026-07-01', what: 'Staff dental Plan 3 to Plan 2' }],
  conflicts: ['Dental: schedule Plan 3, Endorsement 2 Plan 2; newest used'],
}

describe('normaliseLastYear', () => {
  it('parses amounts, checks the sum and keeps plan names', () => {
    const ly = normaliseLastYear(read)
    expect(ly.total).toBe(118400)
    expect(ly.premiumByCover.GOPC).toBe(21100)
    expect(ly.sumMatches).toBe(true)
    expect(ly.categories[1].plans.GHS).toBe('Plan 3 · Private 1-bed · 0%')
    expect(ly.categories[1].facts.life).toEqual({ kind: 'multiple', n: 24 })
    expect(ly.changes).toHaveLength(1)
  })
  it('flags a total the covers do not add up to', () => {
    expect(normaliseLastYear({ ...read, total: 120000 }).sumMatches).toBe(false)
  })
  it('drops what is out of range or not stated', () => {
    const ly = normaliseLastYear({ periodFrom: '1 Jan 2026', categories: [{ facts: { beds: 3, coins: 15, limitKind: 'weekly', limit: -5 } }], premiumByCover: { GHS: 'n/a' } })
    expect(ly.periodFrom).toBeNull()
    expect(ly.categories[0]).toMatchObject({ name: 'All employees', facts: { beds: null, coins: null, limitKind: null, limit: null } })
    expect(ly.premiumByCover).toEqual({})
    expect(ly.sumMatches).toBeNull()
  })
  it('never invents: an empty read stays empty', () => {
    const ly = normaliseLastYear(null)
    expect(ly).toMatchObject({ insurer: null, total: null, categories: [], premiumByCover: {} })
  })
})

describe('scheduleFromLastYear', () => {
  const ly = normaliseLastYear(read)
  it('matches census plan numbers to the policy plans', () => {
    const s = scheduleFromLastYear(ly, { GHS: [{ value: '2' }, { value: 'Plan 3' }], EMM: [], GOPC: [{ value: '3' }], GOSC: [{ value: '1' }, { value: '2' }], GD: [], GTL: [{ value: '3' }] })
    expect(s.GHS?.['2']).toMatchObject({ limit: 150000, limitKind: 'annual', beds: 1 })
    expect(s.GHS?.['Plan 3']).toMatchObject({ limit: 80000 })
    expect(s.GOSC?.['1']).toBe(2500)
    expect(s.GOSC?.['2']).toBe(1000)
    expect(s.GOPC?.['3']).toBe(10)
    expect(s.GTL?.['3']).toEqual({ kind: 'multiple', n: 24 })
  })
  it('uses the only category for a census with no plan columns, and none when there are several', () => {
    const one = normaliseLastYear({ ...read, categories: [read.categories[1]] })
    expect(scheduleFromLastYear(one, { GHS: [{ value: ALL }], EMM: [], GOPC: [], GOSC: [], GD: [], GTL: [] }).GHS?.[ALL]).toMatchObject({ limit: 80000 })
    expect(scheduleFromLastYear(ly, { GHS: [{ value: ALL }], EMM: [], GOPC: [], GOSC: [], GD: [], GTL: [] }).GHS).toBeUndefined()
  })
  it('leaves an unmatched plan for the broker', () => {
    expect(scheduleFromLastYear(ly, { GHS: [{ value: '7' }], EMM: [], GOPC: [], GOSC: [], GD: [], GTL: [] }).GHS).toBeUndefined()
  })
})

describe('helpers', () => {
  it('reads plan keys and amounts', () => {
    expect(planKey('Plan 3 · Private 1-bed · 0%')).toBe('3')
    expect(planKey('Plan 2A (PTE 1-bed)')).toBe('2a')
    expect(planKey('GHS 4')).toBe('4')
    expect(amount('S$1,234.50')).toBe(1234.5)
    expect(amount('nil')).toBeNull()
  })
})
