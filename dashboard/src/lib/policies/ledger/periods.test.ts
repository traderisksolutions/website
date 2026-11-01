import { describe, it, expect } from 'vitest'
import { linesInPeriod, inceptionLines, type LedgerLine } from './index'

const line = (date: string, kind: LedgerLine['kind'], trs: number | null = 100): LedgerLine => ({
  date, kind, label: `${kind} ${date}`, insurer_amount: null, trs_amount: trs, gst: null, claim_claimed: null, claim_paid: null, pax: null,
  running_net: 0, needs_review: false, links: [], source: { table: 'debit_notes', id: date + kind },
})

describe('linesInPeriod', () => {
  const lines = [
    line('2025-08-07', 'premium'), line('2025-09-25', 'premium'), line('2026-01-05', 'premium'),
    line('2026-07-27', 'credit', -50), line('2026-08-20', 'premium'), line('2026-10-01', 'credit', -20),
  ]
  it('keeps a month of lead, drops premium notes after the end, keeps credits two months after', () => {
    const got = linesInPeriod(lines, '2025-09-01', '2026-08-31').map(l => l.date)
    expect(got).toEqual(['2025-08-07', '2025-09-25', '2026-01-05', '2026-07-27', '2026-08-20', '2026-10-01'])
    const prior = linesInPeriod(lines, '2024-09-01', '2025-08-31').map(l => l.date)
    expect(prior).toEqual(['2025-08-07'])
    const next = linesInPeriod(lines, '2026-09-01', '2027-08-31').map(l => l.date)
    expect(next).toEqual(['2026-08-20', '2026-10-01'])
  })
  it('keeps everything when the policy has no dates', () => {
    expect(linesInPeriod(lines, null, null)).toHaveLength(6)
  })
})

describe('inceptionLines', () => {
  it('takes the premium notes within 45 days of the start; later ones are endorsements', () => {
    const lines = [line('2025-09-25', 'premium'), line('2025-09-26', 'premium'), line('2026-01-05', 'premium'), line('2026-07-27', 'credit', -50)]
    expect(inceptionLines(lines, '2025-09-01').map(l => l.date)).toEqual(['2025-09-25', '2025-09-26'])
  })
  it('falls back to the first premium note when none is early', () => {
    const lines = [line('2026-03-01', 'premium'), line('2026-05-01', 'premium')]
    expect(inceptionLines(lines, '2025-09-01').map(l => l.date)).toEqual(['2026-03-01'])
    expect(inceptionLines(lines, null)).toHaveLength(2)
  })
})
