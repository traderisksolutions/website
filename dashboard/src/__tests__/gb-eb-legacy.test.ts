import { describe, expect, it } from 'vitest'
import type { Member } from '@/lib/gb-quote'
import { legacyInput, legacyMembers, pickedPlans, scheduleTiers, threadOf, type LegacyRow } from '@/lib/gb/eb-legacy'
import { DEFAULT_DESIGN, categoryName, censusCategories, type Priced } from '@/lib/gb/eb-quote'
import { snapshotFrom } from '@/lib/gb/eb-proposal'
import type { Schedule } from '@/lib/gb/current'

const person = (o: Partial<Member> = {}): Member => ({ name: 'A', category: 'Default', relationship: 'self', dob: '1985-01-01', ...o })
const row = (o: Partial<LegacyRow> = {}): LegacyRow => ({ id: 'x', company_name: 'Zzq Test Pte Ltd', effective_date: '2027-01-01', basis: 'renewal', census: [person()], requirement: null, notes: null, ...o })

describe('legacyMembers', () => {
  it('keeps people, bounds fields and drops junk', () => {
    const ms = legacyMembers([person({ age: 41.7, plans: { GHS: '1', GD: '' } }), null, 'x', { name: 'B', relationship: 'SPOUSE', category: 'Staff' }])
    expect(ms).toHaveLength(2)
    expect(ms[0].age).toBe(41)
    expect(ms[0].plans).toEqual({ GHS: '1' })
    expect(ms[1]).toMatchObject({ name: 'B', relationship: 'spouse', dob: null, plans: null })
  })
  it('reads nothing from a non-array', () => { expect(legacyMembers(null)).toEqual([]); expect(legacyMembers({})).toEqual([]) })
})

describe('threadOf', () => {
  it('reads the thread tag from the notes', () => {
    expect(threadOf('Drafted from an email. [message:none] [thread:D8C8E9A0-1111-4222-8333-444455556666]')).toBe('d8c8e9a0-1111-4222-8333-444455556666')
    expect(threadOf('no tag')).toBeNull()
    expect(threadOf(null)).toBeNull()
  })
})

describe('categoryName', () => {
  it('names a blank or Default category "All employees"', () => {
    expect(categoryName({ category: 'Default' })).toBe('All employees')
    expect(categoryName({ category: ' ' })).toBe('All employees')
    expect(categoryName({ category: ' Staff ' })).toBe('Staff')
  })
})

describe('scheduleTiers', () => {
  const s: Partial<Schedule> = {
    GHS: { '1': { hospital: 'private', beds: 1, limitKind: 'per_disability', limit: 25_000, coins: 0 }, '2': { hospital: 'private', beds: 4, limitKind: 'per_disability', limit: 15_000, coins: 0 } },
    EMM: { '1': 60_000, '2': null }, GOPC: { '1': 0 }, GOSC: { '1': 1_000 }, GD: { '1': 500 },
  }
  it('reads the plan most employees hold, cover by cover', () => {
    const ms = [person({ plans: { GHS: '1', EMM: '1', GOPC: '1', GOSC: '1', GD: '1' } }), person({ plans: { GHS: '1', EMM: '1', GOPC: '1', GOSC: '1', GD: '1' } }), person({ plans: { GHS: '2', EMM: '2' } })]
    expect(scheduleTiers(s, ms)).toEqual({ hs: 4, mm: 3, gp: 2, sp: 2, gd: 2 })
  })
  it('a cover scheduled as not held is None', () => {
    expect(scheduleTiers(s, [person({ plans: { GHS: '2', EMM: '2' } })])).toMatchObject({ hs: 2, mm: 0 })
  })
  it('a census with no plan columns reads the one plan', () => {
    const one: Partial<Schedule> = { GHS: { '*': { hospital: 'government', beds: 4, limitKind: 'per_disability', limit: 15_000, coins: 0 } }, GD: { '*': 300 } }
    expect(scheduleTiers(one, [person()])).toMatchObject({ hs: 0, gd: 1 })
  })
})

describe('legacyInput', () => {
  it('cannot price a quotation without a census or a date', () => {
    expect(legacyInput(row({ census: [] })).problems).toContain('no census on the quotation')
    expect(legacyInput(row({ effective_date: null })).input).toBeNull()
  })
  it('takes today from the schedule over the census plan; the design is today on the default', () => {
    const { input } = legacyInput(row({ census: [person({ plans: { GHS: 'Plan 1 (PTE 2-bed)' } })], requirement: { current_insurer: 'AIA', current_schedule: { GHS: { 'Plan 1 (PTE 2-bed)': { hospital: 'private', beds: 1, limitKind: 'per_disability', limit: 25_000, coins: 0 } } } } }))
    expect(input!.categories[0]).toMatchObject({ name: 'All employees', source: 'schedule', today: { hs: 4 } })
    expect(input!.categories[0].design).toEqual({ ...DEFAULT_DESIGN, hs: 4 })
    expect(input!.currentInsurer).toBe('AIA')
  })
  it('falls back to the census plan, then the default', () => {
    expect(legacyInput(row({ census: [person({ plans: { GHS: 'GRH 4-bed' } })] })).input!.categories[0]).toMatchObject({ source: 'census plan', today: { hs: 0 } })
    expect(legacyInput(row()).input!.categories[0]).toMatchObject({ source: 'default', design: DEFAULT_DESIGN })
  })
  it('names lives without an age', () => {
    expect(legacyInput(row({ census: [person({ dob: null, age: null })] })).problems).toEqual(['1 of 1 lives have no date of birth or age'])
  })
})

describe('snapshot of a census without categories', () => {
  it('keeps every life under "All employees"', () => {
    const members = [person(), person({ relationship: 'spouse' })]
    const cats = censusCategories(members)
    const priced: Priced = { products: ['P'], notes: [], rules: [], workbook: { name: 'w', driveFileId: null, modifiedAt: null, readAt: '' },
      categories: [{ name: cats[0].name, employees: 1, lives: 2, today: { words: {} as never, premium: {} as never, product: null }, products: { P: { hs: { options: [{ plan: 'Plan 1', words: 'x', premium: 100 }], pick: 'Plan 1', locked: false } } as never } }] }
    const picks = pickedPlans(priced)
    expect(picks['All employees'].P.hs).toBe('Plan 1')
    const s = snapshotFrom({ priced, picks, products: ['P'], company: 'C', effectiveDate: '2027-01-01', basis: 'renewal', members, categories: ['All employees'] })
    expect(s.members).toHaveLength(2)
    expect(s.members[0].category).toBe('All employees')
    expect(s.categories[0].covers.hs.P.premium).toBe(100)
  })
})
