import { describe, expect, it } from 'vitest'
import { CHANGES, groupsFor, lifeOf, memberSpec, planValues, sumStep, unscheduled, type Schedule } from '@/lib/gb/current'
import type { Member } from '@/lib/gb-quote'

const m = (name: string, plans: Record<string, string>, salary = 10_000, relationship: Member['relationship'] = 'self'): Member => ({ name, category: 'x', relationship, dob: '1985-01-01', plans, salary })
const P = (beds: 1 | 2 | 4, limit: number) => ({ hospital: 'private' as const, beds, limitKind: 'per_disability' as const, limit, coins: 0 as const })
const schedule: Schedule = {
  GHS: { '4': P(2, 20000), '5': P(4, 15000), FWMI: { hospital: 'government', beds: 4, limitKind: 'per_disability', limit: 15000, coins: 0, foreignWorker: true } },
  EMM: { '4': 80000 }, GOPC: { '1': 0, '2': 10 }, GOSC: { '1': 2000 }, GD: { '2': 500 },
  GTL: { '12': { kind: 'multiple', n: 12 }, '36': { kind: 'multiple', n: 36 } },
}
const people = [
  m('A', { GHS: '4', EMM: '4', GOPC: '1', GOSC: '1', GD: '2', GTL: '12' }),
  m('B', { GHS: '4', EMM: '4', GOPC: '1', GOSC: '1', GD: '2', GTL: '12' }),
  m('C', { GHS: '5', EMM: 'N.A.', GOPC: '2', GTL: '36' }, 8_000),
  m('D', { GHS: 'FWMI', GOPC: '2' }),
  m('E', { GHS: '9' }),
]

describe('current cover from the census plan columns', () => {
  it('lists each plan value with its headcount', () => {
    const v = planValues(people)
    expect(v.GHS).toEqual([{ value: '4', people: 2 }, { value: '5', people: 1 }, { value: '9', people: 1 }, { value: 'FWMI', people: 1 }])
    expect(v.EMM).toEqual([{ value: '4', people: 2 }])
  })
  it('turns a person into numbers: life as a salary multiple, rounded to a sum a card sells', () => {
    expect(lifeOf('12')).toEqual({ kind: 'multiple', n: 12 }); expect(lifeOf('100000')).toEqual({ kind: 'sum', n: 100000 })
    expect(sumStep(120_000)).toBe(100_000); expect(sumStep(2_000_000)).toBe(500_000)
    expect(memberSpec(people[0], schedule)).toMatchObject({ beds: 2, limit: 20000, gmm: 80000, gpCopay: 0, spLimit: 2000, gdLimit: 500, gtl: 100_000, foreignWorker: false })
    expect(memberSpec(people[2], schedule)).toMatchObject({ beds: 4, gmm: null, gpCopay: 10, spLimit: null, gtl: 300_000 })
    expect(memberSpec(people[3], schedule)).toMatchObject({ foreignWorker: true })
    expect(unscheduled(people, schedule).map(p => p.name)).toEqual(['E'])
  })
  it('groups people with identical numbers; a change moves every group but foreign workers', () => {
    expect(groupsFor(people, schedule, CHANGES[0])!.map(g => g.members.length)).toEqual([2, 1, 1])
    const fewer = groupsFor(people, schedule, CHANGES.find(c => c.key === 'beds_fewer')!)!
    expect(fewer.map(g => g.foreignWorker ? 'fw' : g.spec.beds)).toEqual([1, 2, 'fw'])
    expect(groupsFor(people, schedule, CHANGES.find(c => c.key === 'coins')!)!.filter(g => !g.foreignWorker).every(g => g.spec.coins === 20)).toBe(true)
  })
  it('a census with no plan columns is one plan for everyone', () => {
    const flat = [m('X', {}), m('Y', {})].map(p => ({ ...p, plans: null }))
    const s: Schedule = { GHS: { '*': P(4, 15000) }, EMM: {}, GOPC: { '*': 0 }, GOSC: {}, GD: {}, GTL: { '*': { kind: 'sum', n: 100000 } } }
    expect(planValues(flat).GHS).toEqual([{ value: '*', people: 2 }])
    expect(memberSpec(flat[0], s)).toMatchObject({ beds: 4, gpCopay: 0, gtl: 100000 })
  })
})
