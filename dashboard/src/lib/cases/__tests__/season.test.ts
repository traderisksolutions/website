import { describe, it, expect } from 'vitest'
import {
  NO_DATE, OVERDUE, bucketOf, isRenewed, keepsOwnRow, lineGroupOf, pairCases, pickGroupOf, policyLine, renewalTitle, seasonMonths, seasonRows, seasonWindow,
  type SeasonCase, type SeasonPolicy,
} from '../season'

const TODAY = '2026-11-16'
const policy = (o: Partial<SeasonPolicy> & { id: string }): SeasonPolicy => ({
  company_id: 'c1', policy_number: null, insurer: 'Insurer A', class_of_insurance: 'Work Injury Compensation', label: null, product_line: null, start_date: '2026-01-01', end_date: '2026-12-31', is_eb: false, ...o,
})
const kase = (o: Partial<SeasonCase> & { id: string }): SeasonCase => ({
  company_id: 'c1', client_name: 'Example Logistics', title: 'Renewal', policy_id: null, policy_number: null, deadline: null, stage: 'request', placement_id: null, owner_email: null, ...o,
})

describe('the season window', () => {
  it('runs from 30 days back to the end of the third month ahead', () => {
    expect(seasonWindow(TODAY)).toEqual({ from: '2026-10-17', to: '2027-02-28' })
    expect(seasonWindow('2027-11-30')).toEqual({ from: '2027-10-31', to: '2028-02-29' })
    expect(seasonWindow('2026-01-31').to).toBe('2026-04-30')
  })
  it('offers this month and the three after it', () => {
    expect(seasonMonths(TODAY)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
  })
  it('puts a row in its month, in Overdue once the date has passed, or in No date', () => {
    expect(bucketOf('2026-11-15', TODAY)).toBe(OVERDUE)
    expect(bucketOf('2026-11-16', TODAY)).toBe('2026-11')
    expect(bucketOf('2027-01-24', TODAY)).toBe('2027-01')
    expect(bucketOf(null, TODAY)).toBe(NO_DATE)
  })
})

describe('the line of a row', () => {
  it('reads the policy line from the class of insurance', () => {
    expect(policyLine({ product_line: null, class_of_insurance: 'Work Injury Compensation' })).toBe('wica')
    expect(policyLine({ product_line: null, class_of_insurance: 'Excess Protector' })).toBeNull()
  })
  it('groups by the line when one is known', () => {
    expect(lineGroupOf({ line: 'group_health', text: '' })).toBe('employment_benefits')
    expect(lineGroupOf({ line: 'foreign_worker_medical', text: 'FOREIGN WORKER MEDICAL' })).toBe('general')
    expect(lineGroupOf({ line: 'wica', is_eb: true, text: '' })).toBe('general')
  })
  it('falls back to the register flag and the wording', () => {
    expect(lineGroupOf({ line: null, is_eb: true, text: '' })).toBe('employment_benefits')
    expect(lineGroupOf({ line: null, text: 'Staff dental plan' })).toBe('employment_benefits')
    expect(lineGroupOf({ line: null, text: 'Excess Protector' })).toBe('general')
  })
})

describe('a renewed policy', () => {
  const p = policy({ id: 'p1', end_date: '2026-12-31' })
  it('is one whose next term is on the register', () => {
    expect(isRenewed(p, [p, policy({ id: 'p2', start_date: '2027-01-01', end_date: '2027-12-31' })])).toBe(true)
  })
  it('is not one beside another class, another client, or a term that starts far from its end', () => {
    expect(isRenewed(p, [p, policy({ id: 'p2', class_of_insurance: 'Cyber', start_date: '2027-01-01', end_date: '2027-12-31' })])).toBe(false)
    expect(isRenewed(p, [p, policy({ id: 'p2', company_id: 'c2', start_date: '2027-01-01', end_date: '2027-12-31' })])).toBe(false)
    expect(isRenewed(p, [p, policy({ id: 'p2', start_date: '2027-06-01', end_date: '2028-05-31' })])).toBe(false)
    expect(isRenewed(p, [p])).toBe(false)
  })
})

describe('pairing a case with a policy', () => {
  it('takes the policy on the case first', () => {
    const pairs = pairCases([policy({ id: 'p1' })], [kase({ id: 'k1', title: 'WICA renewal' }), kase({ id: 'k2', policy_id: 'p1' })])
    expect(pairs.get('p1')).toEqual({ case_id: 'k2', by: 'link' })
  })
  it('then the policy number, on the case or in its title, without the endorsement suffix', () => {
    const p = policy({ id: 'p1', policy_number: 'WC-2025/00123-E01' })
    expect(pairCases([p], [kase({ id: 'k1', policy_number: 'wc 2025/00123' })]).get('p1')).toEqual({ case_id: 'k1', by: 'number' })
    expect(pairCases([p], [kase({ id: 'k1', title: 'Renewal (policy WC-2025/00123)' })]).get('p1')).toEqual({ case_id: 'k1', by: 'number' })
  })
  it('does not pair on a short number', () => {
    expect(pairCases([policy({ id: 'p1', policy_number: '123', class_of_insurance: 'Excess Protector' })], [kase({ id: 'k1', title: 'Motor renewal 123' })]).size).toBe(0)
  })
  it('then the line the title names, the nearest date first', () => {
    const p = policy({ id: 'p1', end_date: '2026-12-31' })
    const pairs = pairCases([p], [kase({ id: 'k1', title: 'Work injury compensation renewal', deadline: '2026-06-30' }), kase({ id: 'k2', title: 'WICA renewal', deadline: '2026-12-31' }), kase({ id: 'k3', title: 'Cyber renewal' })])
    expect(pairs.get('p1')).toEqual({ case_id: 'k2', by: 'line' })
  })
  it('then the only case left for the only policy left, when its title names no line', () => {
    const p = policy({ id: 'p1', class_of_insurance: 'Excess Protector' })
    expect(pairCases([p], [kase({ id: 'k1', title: 'Renewal 2027' })]).get('p1')).toEqual({ case_id: 'k1', by: 'only' })
    expect(pairCases([p], [kase({ id: 'k1', title: 'Cyber renewal' })]).size).toBe(0)
    expect(pairCases([p], [kase({ id: 'k1', title: 'Renewal 2027' }), kase({ id: 'k2', title: 'Renewal' })]).size).toBe(0)
    expect(pairCases([p, policy({ id: 'p2', class_of_insurance: 'Key person cover' })], [kase({ id: 'k1', title: 'Renewal 2027' })]).size).toBe(0)
  })
  it('never pairs across clients and uses a case once', () => {
    const pairs = pairCases([policy({ id: 'p1' }), policy({ id: 'p2', end_date: '2027-01-31' }), policy({ id: 'p3', company_id: 'c2' })], [kase({ id: 'k1', title: 'WICA renewal' })])
    expect([...pairs.keys()]).toEqual(['p1'])
  })
  it('lets a case linked to a policy off the list pair by number, and keeps one linked to a listed policy with it', () => {
    const p1 = policy({ id: 'p1', policy_number: '52300001' }), p2 = policy({ id: 'p2', policy_number: '52300002', end_date: '2027-01-31' })
    expect(pairCases([p1], [kase({ id: 'k1', policy_id: 'draft', policy_number: '52300001' })]).get('p1')).toEqual({ case_id: 'k1', by: 'number' })
    const pairs = pairCases([p1, p2], [kase({ id: 'k1', policy_id: 'p2', title: 'Renewal 52300001' })])
    expect(pairs.get('p2')).toEqual({ case_id: 'k1', by: 'link' })
    expect(pairs.has('p1')).toBe(false)
  })
})

describe('the rows', () => {
  const w = seasonWindow(TODAY)
  it('keeps a row for an unpaired case that is dated in the window or undated, short of the policy stage', () => {
    expect(keepsOwnRow(kase({ id: 'k' }), w)).toBe(true)
    expect(keepsOwnRow(kase({ id: 'k', deadline: '2026-12-01T00:00:00Z' }), w)).toBe(true)
    expect(keepsOwnRow(kase({ id: 'k', deadline: '2026-09-01' }), w)).toBe(false)
    expect(keepsOwnRow(kase({ id: 'k', deadline: '2027-03-01' }), w)).toBe(false)
    expect(keepsOwnRow(kase({ id: 'k', stage: 'policy_and_dn' }), w)).toBe(false)
    expect(keepsOwnRow(kase({ id: 'k', stage: 'paid' }), w)).toBe(false)
  })
  it('lists a policy with its case, a policy without one and a case without a policy, the earliest end first', () => {
    const rows = seasonRows({
      policies: [policy({ id: 'p1', end_date: '2027-01-24', class_of_insurance: 'Employee Benefit Insurance', is_eb: true }), policy({ id: 'p2', end_date: '2026-11-01', label: 'Workers cover' })],
      cases: [kase({ id: 'k1', policy_id: 'p1', stage: 'terms_received' }), kase({ id: 'k2', company_id: 'c2', title: 'Cyber renewal' }), kase({ id: 'k3', company_id: 'c3', deadline: '2026-08-01' })],
      names: new Map([['c1', 'Example Logistics'], ['c2', 'Demo Foods']]),
      states: new Map([['k1', { threads: 3, wishes: 1, documents: { ticked: 2, required: 5 }, options: 2 }]]),
      compare: r => (r.group === 'employment_benefits' ? { kind: 'new_quotation', href: '/pricing-matrix/new' } : r.case ? { kind: 'comparison', href: `/today/${r.case.id}?section=comparison` } : null),
    }, TODAY)
    expect(rows.map(r => r.key)).toEqual(['p2', 'p1', 'case:k2'])
    expect(rows[0]).toMatchObject({ company: 'Example Logistics', policy: { name: 'Workers cover' }, days: -15, bucket: OVERDUE, line: 'wica', group: 'general', case: null, compare: null })
    expect(rows[1]).toMatchObject({ days: 69, bucket: '2027-01', group: 'employment_benefits', case: { id: 'k1', stage: 'terms_received', threads: 3, wishes: 1, documents: { ticked: 2, required: 5 }, options: 2, paired_by: 'link' }, compare: { kind: 'new_quotation' } })
    expect(rows[2]).toMatchObject({ company: 'Demo Foods', policy: null, end_date: null, days: null, bucket: NO_DATE, line: 'cyber', case: { id: 'k2', threads: 0, documents: null, options: 0, paired_by: null }, compare: { kind: 'comparison', href: '/today/k2?section=comparison' } })
  })
})

describe('what a started case and the picker read', () => {
  it('titles a renewal as the sweep does', () => {
    expect(renewalTitle({ class_of_insurance: 'Cyber Liability', product_line: null, policy_number: 'CY-1' })).toBe('Renewal: Cyber Liability CY-1')
    expect(renewalTitle({ class_of_insurance: null, product_line: null, policy_number: null })).toBe('Renewal: policy')
  })
  it('groups a thread by its label and its age, whether or not a case holds it', () => {
    expect(pickGroupOf({ last_message_at: '2026-11-01T02:00:00Z', label: 'renewal' }, TODAY)).toBe('active')
    expect(pickGroupOf({ last_message_at: '2026-06-01T02:00:00Z', label: 'renewal' }, TODAY)).toBe('back_burner')
    expect(pickGroupOf({ last_message_at: '2026-11-01T02:00:00Z', label: 'member_movement' }, TODAY)).toBe('member_movements')
  })
})
