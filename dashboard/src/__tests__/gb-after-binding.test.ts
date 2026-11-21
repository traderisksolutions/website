import { describe, expect, it } from 'vitest'
import { billCheck, followMovements, lossRatio } from '@/lib/gb/after-binding'

describe('after binding', () => {
  it('bill against the quotation, else the policy: match within 2%, the same with GST, or different', () => {
    expect(billCheck(10_150, 10_000, null)).toMatchObject({ status: 'match', source: 'quotation' })
    expect(billCheck(10_900, 10_000, null).status).toBe('gst')
    expect(billCheck(12_000, 10_000, null)).toMatchObject({ status: 'differs', diff: 2000, pct: 0.2 })
    expect(billCheck(9_000, null, 9_000)).toMatchObject({ status: 'match', source: 'policy' })
    expect(billCheck(9_000, null, null).status).toBe('no_quote')
    expect(billCheck(null, 10_000, null).status).toBe('no_bill')
  })

  it('a movement is followed by the first endorsement note within 60 days', () => {
    const f = followMovements(
      [{ id: 'm1', date: '2026-03-01', filename: 'joiners.xlsx' }, { id: 'm2', date: '2026-06-01', filename: 'leavers.xlsx' }],
      [{ date: '2026-02-01', kind: 'endorsement', amount: 10 }, { date: '2026-04-15', kind: 'endorsement', amount: 120 }, { date: '2026-05-01', kind: 'new_business', amount: 9000 }],
    )
    expect(f.map(x => [x.id, x.note?.date ?? null])).toEqual([['m1', '2026-04-15'], ['m2', null]])
  })

  it('loss ratio', () => {
    expect(lossRatio(4_500, 10_000)).toBe(0.45)
    expect(lossRatio(100, 0)).toBeNull()
  })
})
