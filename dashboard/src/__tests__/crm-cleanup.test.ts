import { describe, it, expect } from 'vitest'
import { orderPlan, scopeOf, kindOf, actionKey, contactFields, type CleanupAction } from '@/lib/crm/cleanup'

const act = (a: Partial<CleanupAction> & Pick<CleanupAction, 'action' | 'id'>): CleanupAction =>
  ({ record_type: 'company', tier: 'A', ...a } as CleanupAction)

describe('orderPlan', () => {
  it('runs contact merges, then identity edits, then company merges, then links', () => {
    const plan = orderPlan([
      act({ action: 'handles', id: 'ct1', record_type: 'contact', target_id: 'keep' }),
      act({ action: 'merge', id: 'dup', target_id: 'keep' }),
      act({ action: 'rename', id: 'keep', value: 'KEEP PTE LTD' }),
      act({ action: 'merge', id: 'c2', record_type: 'contact', target_id: 'c1' }),
      act({ action: 'create_entity', id: 'new:Sub Pte Ltd', target_id: 'keep' }),
      act({ action: 'delete_record', id: 'junk' }),
    ], 'A')
    expect(plan.map(a => a.action)).toEqual(['merge', 'rename', 'merge', 'create_entity', 'handles', 'delete_record'])
    expect(plan[0].record_type).toBe('contact')
    expect(plan[2].record_type).toBe('company')
  })

  it('points every link at the survivor of a merge, following chains', () => {
    const plan = orderPlan([
      act({ action: 'merge', id: 'a', target_id: 'b' }),
      act({ action: 'merge', id: 'b', target_id: 'c' }),
      act({ action: 'relink_thread', id: 't1', record_type: 'thread', target_id: 'a' }),
      act({ action: 'set_parent', id: 'sub', target_id: 'b' }),
      act({ action: 'insures', id: 'p1', record_type: 'policy', target_id: 'a' }),
    ], 'A')
    expect(plan.find(x => x.action === 'merge' && x.id === 'a')!.target_id).toBe('c')
    expect(plan.find(x => x.action === 'relink_thread')!.target_id).toBe('c')
    expect(plan.find(x => x.action === 'set_parent')!.target_id).toBe('c')
    expect(plan.find(x => x.action === 'insures')!.target_id).toBe('c')
  })

  it('drops edits on a record that merges away, but moves its aliases and domains to the survivor', () => {
    const plan = orderPlan([
      act({ action: 'merge', id: 'dup', target_id: 'keep' }),
      act({ action: 'rename', id: 'dup', value: 'X' }),
      act({ action: 'set_kind', id: 'dup', value: 'partner' }),
      act({ action: 'add_alias', id: 'dup', value: 'China Harbour' }),
      act({ action: 'add_domain', id: 'dup', value: 'checsg.com.sg' }),
    ], 'A')
    expect(plan.filter(a => a.id === 'dup').map(a => a.action)).toEqual(['merge'])
    expect(plan.filter(a => a.id === 'keep').map(a => a.action).sort()).toEqual(['add_alias', 'add_domain'])
  })

  it('never makes a record its own parent or merges it into itself', () => {
    const plan = orderPlan([
      act({ action: 'merge', id: 'a', target_id: 'b' }),
      act({ action: 'merge', id: 'b', target_id: 'a' }),
      act({ action: 'set_parent', id: 'b', target_id: 'a' }),
    ], 'A')
    expect(plan.some(a => a.action === 'merge' && a.id === a.target_id)).toBe(false)
    expect(plan.some(a => a.action === 'set_parent' && a.id === a.target_id)).toBe(false)
  })

  it('keeps tiers apart and leaves record splits to a person', () => {
    const plan = orderPlan([
      act({ action: 'rename', id: 'x', value: 'X', tier: 'B' }),
      act({ action: 'split_record', id: 'chec', tier: 'A' }),
      act({ action: 'rename', id: 'y', value: 'Y' }),
    ], 'A')
    expect(plan.map(a => a.id)).toEqual(['y'])
  })

  it('leaves new-entity targets for the script to resolve', () => {
    const plan = orderPlan([act({ action: 'handles', id: 'ct', record_type: 'contact', target_id: 'new:Deluge Supply Pte. Ltd.' })], 'A')
    expect(plan[0].target_id).toBe('new:Deluge Supply Pte. Ltd.')
  })
})

describe('scopeOf', () => {
  it('reads product lines from what a contact handles', () => {
    expect(scopeOf('EB renewal and GHS claims')).toEqual(['claims', 'employee_benefits'])
    expect(scopeOf('fleet motor policy, debit note payments')).toEqual(['accounts', 'motor'])
    expect(scopeOf('Stevens Road CAR award and visitor PA')).toEqual(['car'])
    expect(scopeOf('1 Sophia Road PBU off-site IAR')).toEqual(['property'])
    expect(scopeOf(null)).toEqual([])
  })
})

describe('kindOf', () => {
  it('folds finer words into the four kinds the table allows', () => {
    expect(kindOf('reinsurer')).toBe('insurer')
    expect(kindOf('broker')).toBe('partner')
    expect(kindOf('tpa')).toBe('partner')
    expect(kindOf('vendor')).toBe('other')
    expect(kindOf('regulator')).toBe('other')
    expect(kindOf('individual')).toBe('client')
    expect(kindOf('client')).toBe('client')
  })
})

describe('actionKey', () => {
  it('is stable and distinguishes targets', () => {
    const a = act({ action: 'relink_thread', id: 't', record_type: 'thread', target_id: 'x' })
    expect(actionKey(a)).toBe(actionKey({ ...a }))
    expect(actionKey(a)).not.toBe(actionKey({ ...a, target_id: 'y' }))
  })
})

describe('contactFields', () => {
  it('reads name and title from a signature line', () => {
    expect(contactFields('name: Joe Kam Chee Yong')).toEqual({ first_name: 'Joe', last_name: 'Kam Chee Yong' })
    expect(contactFields('name: Leila; title: HR Department')).toEqual({ first_name: 'Leila', title: 'HR Department' })
    expect(contactFields('title: CEO, HelloRide Singapore; MD, HelloRide Asia (ex-China)')).toEqual({ title: 'CEO, HelloRide Singapore; MD, HelloRide Asia (ex-China)' })
    expect(contactFields('nonsense')).toEqual({})
  })
})
