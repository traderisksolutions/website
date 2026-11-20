import { describe, expect, it } from 'vitest'
import {
  crossSell, ebQuoteTotal, isTaskDue, lowestPlacementQuote, nextTask, pipeBucketOf, pipelineMeta, quotedPremium, riskFlags, taskName,
} from '../pipeline'
import { checkChange, checkRenewedPolicy } from '../rules'

const T = '2026-11-20'
const P = '11111111-1111-4111-8111-111111111111', Q = '22222222-2222-4222-8222-222222222222'

describe('pipeBucketOf', () => {
  it('puts open records in day buckets, overdue in 0-30, closed ones in Lost or Renewed', () => {
    expect(pipeBucketOf({ outcome: null, days: -5 })).toBe('0-30')
    expect(pipeBucketOf({ outcome: null, days: 30 })).toBe('0-30')
    expect(pipeBucketOf({ outcome: null, days: 31 })).toBe('31-60')
    expect(pipeBucketOf({ outcome: null, days: 90 })).toBe('61-90')
    expect(pipeBucketOf({ outcome: null, days: 120 })).toBe('91-120')
    expect(pipeBucketOf({ outcome: null, days: 150 })).toBe('121+')
    expect(pipeBucketOf({ outcome: 'lost', days: 10 })).toBe('lost')
    expect(pipeBucketOf({ outcome: 'renewed', days: 200 })).toBe('renewed')
  })
})

describe('tasks', () => {
  const tasks = [
    { kind: '-30', due_on: '2026-12-01', done_at: null },
    { kind: '-90', due_on: '2026-10-02', done_at: '2026-10-03T00:00:00Z' },
    { kind: '-60', due_on: '2026-11-01', done_at: null },
    { kind: '-15', due_on: '2026-12-16', done_at: null },
  ]
  it('the next task is the earliest not done', () => expect(nextTask(tasks)?.kind).toBe('-60'))
  it('none when every task is done', () => expect(nextTask(tasks.map(t => ({ ...t, done_at: 'x' })))).toBeNull())
  it('a task is due on or before today and not done', () => {
    expect(isTaskDue(tasks[2], T)).toBe(true)
    expect(isTaskDue({ ...tasks[0], due_on: T }, T)).toBe(true)
    expect(isTaskDue(tasks[0], T)).toBe(false)
    expect(isTaskDue(tasks[1], T)).toBe(false)
  })
  it('names a task by its days', () => expect(taskName('-90')).toBe('90 days before expiry'))
})

describe('riskFlags', () => {
  const base = { outcome: null, stage: 'marketing', days: 20, lastContact: '2026-11-10T09:00:00Z', premium: 1000, quoted: null }
  it('no flag for a record in hand', () => expect(riskFlags(base, T)).toEqual([]))
  it('no contact: under 30 days to expiry and nothing on the client threads in 30 days', () => {
    expect(riskFlags({ ...base, lastContact: null }, T)).toEqual(['no_contact'])
    expect(riskFlags({ ...base, lastContact: '2026-10-20' }, T)).toEqual(['no_contact'])
    expect(riskFlags({ ...base, lastContact: '2026-10-21' }, T)).toEqual([])
    expect(riskFlags({ ...base, days: 31, lastContact: null }, T)).toEqual([])
  })
  it('price up: the lowest quote more than 10% above expiring', () => {
    expect(riskFlags({ ...base, quoted: 1100 }, T)).toEqual([])
    expect(riskFlags({ ...base, quoted: 1100.01 }, T)).toEqual(['price_up'])
    expect(riskFlags({ ...base, premium: null, quoted: 5000 }, T)).toEqual([])
    expect(riskFlags({ ...base, premium: 0, quoted: 5000 }, T)).toEqual([])
  })
  it('still Open under 30 days, overdue included', () => {
    expect(riskFlags({ ...base, stage: 'open', days: 29 }, T)).toEqual(['still_open'])
    expect(riskFlags({ ...base, stage: 'open', days: -3 }, T)).toEqual(['still_open'])
    expect(riskFlags({ ...base, stage: 'open', days: 30 }, T)).toEqual([])
  })
  it('every flag at once, and none on a closed record', () => {
    const all = { ...base, stage: 'open', days: 5, lastContact: null, quoted: 2000 }
    expect(riskFlags(all, T)).toEqual(['no_contact', 'price_up', 'still_open'])
    expect(riskFlags({ ...all, outcome: 'lost' }, T)).toEqual([])
  })
})

describe('quotes', () => {
  const r = { company_id: 'c1', line_code: 'fwm', opens_on: '2026-09-01' }
  const q = (o: Partial<{ company_id: string; product_line: string; premium_amount: number | string; created_at: string; status: string }>) =>
    ({ company_id: 'c1', product_line: 'foreign_worker_medical', premium_amount: 900, created_at: '2026-10-01T00:00:00Z', status: 'received', ...o })
  it('takes the lowest quote for the client and line since the record opened', () => {
    expect(lowestPlacementQuote([q({}), q({ premium_amount: '850.5' }), q({ premium_amount: 700, created_at: '2026-08-01T00:00:00Z' }),
      q({ premium_amount: 600, company_id: 'c2' }), q({ premium_amount: 500, product_line: 'wica' }), q({ premium_amount: 400, status: 'declined' }), q({ premium_amount: 0 })], r)).toBe(850.5)
  })
  it('none without a client or line', () => {
    expect(lowestPlacementQuote([q({})], { ...r, line_code: null })).toBeNull()
    expect(lowestPlacementQuote([q({})], { ...r, company_id: null })).toBeNull()
  })
  const cats = [
    { name: 'A', covers: { hs: { AIA: { premium: 1000 }, QBE: { premium: 900 } }, gp: { AIA: { premium: 200 }, QBE: { premium: 400 } } } },
    { name: 'B', covers: { hs: { AIA: { premium: 500 }, QBE: { premium: null } } } },
  ]
  it('an Employment Benefits quotation reads as its lowest product total', () => {
    expect(ebQuoteTotal(cats)).toBe(1300)
    expect(ebQuoteTotal([])).toBeNull()
    expect(ebQuoteTotal(null)).toBeNull()
    expect(ebQuoteTotal([{ covers: { hs: { AIA: { premium: null } } } }])).toBeNull()
  })
  it('Employment Benefits also reads the client quotations made this term', () => {
    const eb = { company_id: 'c1', line_code: 'eb', opens_on: '2026-06-01' }
    expect(quotedPremium(eb, [], [{ company_id: 'c1', created_at: '2026-07-01T00:00:00Z', categories: cats }, { company_id: 'c1', created_at: '2026-05-01T00:00:00Z', categories: [{ covers: { hs: { X: { premium: 10 } } } }] }])).toBe(1300)
    expect(quotedPremium(r, [q({})], [{ company_id: 'c1', created_at: '2026-10-01T00:00:00Z', categories: cats }])).toBe(900)
  })
})

describe('crossSell', () => {
  it('lists the lines held in the fixed order and every other line except Other', () => {
    const { held, missing } = crossSell(['wica', 'eb', 'eb', null, 'nonsense', 'other'])
    expect(held).toEqual(['eb', 'wica', 'other'])
    expect(missing).not.toContain('eb')
    expect(missing).not.toContain('other')
    expect(missing).toContain('pl')
    expect(held.length + missing.length).toBe(19)
  })
})

describe('pipelineMeta', () => {
  it('counts open records in the next 120 days and sums their premium', () => {
    expect(pipelineMeta([
      { outcome: null, days: 10, premium: 1000.5 }, { outcome: null, days: -3, premium: null }, { outcome: null, days: 121, premium: 50 },
      { outcome: 'renewed', days: 20, premium: 70 },
    ])).toEqual({ open: 2, gross: 1000.5 })
  })
})

describe('closing a renewal', () => {
  const open = { policy_id: P, stage: 'quotes_in', outcome: null }
  it('Renewed needs the new policy, of the same client, not the expiring one', () => {
    expect(checkChange(open, { outcome: 'renewed' })).toEqual({ error: 'Link the new policy to close as Renewed.' })
    expect(checkChange(open, { outcome: 'renewed', renewed_policy_id: P })).toEqual({ error: 'Link the new term, not the expiring policy.' })
    expect(checkChange(open, { outcome: 'renewed', renewed_policy_id: Q })).toEqual({ patch: { outcome: 'renewed', stage: 'renewed', renewed_policy_id: Q } })
    const r = { policy_id: P, company_id: 'c1' }
    expect(checkRenewedPolicy(r, null)).toBe('The new policy is not on the register.')
    expect(checkRenewedPolicy(r, { id: P, company_id: 'c1' })).toBe('Link the new term, not the expiring policy.')
    expect(checkRenewedPolicy(r, { id: Q, company_id: 'c2' })).toBe('Link a policy of the same client.')
    expect(checkRenewedPolicy(r, { id: Q, company_id: 'c1' })).toBeNull()
  })
  it('Lost needs a reason; Other needs a note', () => {
    expect(checkChange(open, { outcome: 'lost' })).toEqual({ error: 'Choose why the renewal was lost.' })
    expect(checkChange(open, { outcome: 'lost', loss_reason: 'other', loss_note: '  ' })).toEqual({ error: 'Add a note for Other.' })
    expect(checkChange(open, { outcome: 'lost', loss_reason: 'price' })).toEqual({ patch: { outcome: 'lost', stage: 'lost', loss_reason: 'price', loss_note: null } })
  })
  it('a closed renewal does not change', () => {
    expect(checkChange({ ...open, outcome: 'lost' }, { stage: 'open' })).toEqual({ error: 'This renewal is closed.' })
  })
})
