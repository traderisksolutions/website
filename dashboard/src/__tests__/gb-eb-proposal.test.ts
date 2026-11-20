import { describe, expect, it } from 'vitest'
import { proposalChecks, proposalEmail, proposalFilename, proposalModel, readSnapshot, type Snapshot } from '@/lib/gb/eb-proposal'

const cell = (plan: string, premium: number | null, locked = false) => ({ plan, words: plan, premium, locked })
const none = { plan: '', words: '', premium: null, locked: false }
const P = ['RCC Enhanced III', 'Singlife MyBenefits Plus']

function snap(): Snapshot {
  return {
    company: 'Example Client A Pte Ltd', effectiveDate: '2027-02-14', basis: 'renewal', products: P, workbook: 'TRS EB Package Calculator V1.5',
    categories: [
      { name: 'Management', employees: 4, lives: 4, covers: {
        hs: { [P[0]]: cell('Plan 1', 4000), [P[1]]: cell('Plan 6', 3500) }, mm: { [P[0]]: none, [P[1]]: none },
        gp: { [P[0]]: cell('Plan 1', 1300), [P[1]]: cell('Plan 2', 0) }, sp: { [P[0]]: none, [P[1]]: none },
        gd: { [P[0]]: none, [P[1]]: none }, pa: { [P[0]]: cell('Plan 3', null), [P[1]]: cell('Plan 3', null) },
      } },
      { name: 'Other staff', employees: 2, lives: 6, covers: {
        hs: { [P[0]]: cell('Plan 2A', 3900), [P[1]]: cell('Plan 5', 4000) }, mm: { [P[0]]: cell('Plan 2A', 227), [P[1]]: cell('Plan 5', 0, true) },
        gp: { [P[0]]: cell('Plan 1', 1900), [P[1]]: none }, sp: { [P[0]]: none, [P[1]]: none },
        gd: { [P[0]]: none, [P[1]]: none }, pa: { [P[0]]: cell('Plan 3', 111), [P[1]]: cell('Plan 3', 135) },
      } },
    ],
    members: [
      { name: 'A', category: 'Management', relationship: 'Employee', dob: '1987-07-16', occupation: null, age: null },
      { name: 'B', category: 'Other staff', relationship: 'Child', dob: null, occupation: null, age: null },
    ],
  }
}

describe('proposalModel', () => {
  it('sums each cover over the categories, totals per insurer and marks the lowest', () => {
    const m = proposalModel(snap())
    expect(m.period).toBe('14 Feb 2027 to 13 Feb 2028')
    expect(m.lives).toBe(10)
    expect(m.dependants).toBe(4)
    expect(m.byCover.find(r => r.key === 'hs')!.values).toEqual([7900, 7500])
    expect(m.byCover.find(r => r.key === 'pa')!.values).toEqual([111, 135])
    expect(m.byCover.some(r => r.key === 'sp')).toBe(false)
    expect(m.totals).toEqual([7900 + 227 + 3200 + 111, 7500 + 0 + 135])
    expect(m.lowest).toBe(1)
    expect(m.byCover.find(r => r.key === 'mm')!.included).toEqual([false, true])
  })
  it('lists each category’s plans with — where a cover is not chosen', () => {
    const m = proposalModel(snap())
    expect(m.categories[1].plans.find(p => p.cover === 'Outpatient GP')!.words).toEqual(['Plan 1', '—'])
    expect(m.categories[1].plans.find(p => p.cover === 'Major Medical')!.words[1]).toContain('in hospital plan')
  })
})

describe('proposalChecks', () => {
  it('flags covers chosen but not priced, and lives without an age', () => {
    const c = proposalChecks(snap())
    const pa = c.find(x => x.label === 'Personal Accident')!
    expect(pa.kind).toBe('warn')
    expect(pa.text).toContain('Management (every insurer)')
    expect(c.find(x => x.label === 'Outpatient GP')!.text).toContain('Management (Singlife MyBenefits Plus)')
    expect(c.find(x => x.label === 'Major Medical')).toBeUndefined()
    expect(c.find(x => x.label === 'Census')!.text).toBe('1 of 2 lives have no date of birth or age.')
  })
})

describe('proposalEmail', () => {
  it('writes the premium table cheapest first and escapes names', () => {
    const e = proposalEmail(proposalModel({ ...snap(), company: 'A & B <Pte>' }), 'Jamie', 'Example Staff')
    expect(e.subject).toBe('Employee Benefits proposal for A & B <Pte>')
    expect(e.html).toContain('A &amp; B &lt;Pte&gt;')
    expect(e.html.indexOf('Singlife MyBenefits Plus')).toBeLessThan(e.html.indexOf('RCC Enhanced III'))
    expect(e.html).toContain('S$7,635')
    expect(e.html).toContain('Dear Jamie,')
    expect(e.html).not.toMatch(/A life|Per person/)
    expect(e.html).toContain('Example Staff<br>Trade Risk Solutions')
  })
})

describe('readSnapshot', () => {
  it('reads a snapshot back and refuses one without products or a date', () => {
    expect(readSnapshot(JSON.parse(JSON.stringify(snap())))!.categories[0].covers.hs[P[0]].premium).toBe(4000)
    expect(readSnapshot({ ...snap(), products: [] })).toBeNull()
    expect(readSnapshot({ ...snap(), effectiveDate: '14/02/2027' })).toBeNull()
    expect(readSnapshot('x')).toBeNull()
  })
})

it('names the file after the client and the version', () => {
  expect(proposalFilename('Example Client A Pte. Ltd.', 2)).toBe('Example Client A Pte. Ltd. - Employee Benefits Proposal V2.pdf')
})
