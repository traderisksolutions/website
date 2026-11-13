import { describe, it, expect } from 'vitest'
import { buildAskContext, checkAnswer } from '@/lib/admin/k/ask'

const ctx = buildAskContext({
  business: 'Acme Pte Ltd', today: '2026-11-13',
  facts: [{ key: 'contact.jane@acme.example.role', value: 'claims', quote: 'Jane handles all claims', source_kind: 'email', source_date: '2026-10-01' }, { key: 'terms.WC0001234.premium', value: 'S$12,400', quote: 'premium S$12,400', source_kind: 'email' }],
  policies: [{ id: 'p1', policy_number: 'WC0001234', insurer: 'QBE', class_of_insurance: 'WICA', start_date: '2026-01-01', end_date: '2026-12-31', lifecycle: 'live' }],
  debitNotes: [{ id: 'd1', debit_note_no: 'DN260101', issue_date: '2026-01-05', insurer: 'QBE', event_type: 'renewal', gross_amount: 13516, commission: 1859.4 }, { id: 'd2', debit_note_no: 'DN250101', issue_date: '2025-01-05', insurer: 'QBE', event_type: 'renewal', gross_amount: 12000, commission: 1650 }],
  claims: [{ id: 'c1', class: 'WICA', insurer_name: 'QBE', claimant: 'Tan', loss_date: '2026-03-02', stage: 'settled', amount_claimed: 4000, amount_settled: 3200 }],
  requests: [], quotations: [], ledger: [{ occurred_at: '2026-10-01T02:00:00Z', kind: 'email_in', party: 'client', title: 'Claims contact', summary: 'Jane handles all claims', thread_id: 't1' }],
})

describe('ask about this client', () => {
  it('labels every record and works out totals by year so the model never adds', () => {
    expect(ctx.text).toContain('[T2026] 2026: premium billed S$13,516.00 on 1 debit notes; commission S$1,859.40; 1 claims, S$3,200.00 paid')
    expect(ctx.text).toContain('[F1] Handles (contact.jane@acme.example.role) = claims')
    expect(ctx.sources.get('D1')?.href).toBe('/debit-notes?open=d1')
    expect(ctx.sources.get('L1')?.href).toBe('/engagement?lead=t1')
  })
  it('keeps an answer whose figures are on file and whose sources exist', () => {
    const a = checkAnswer({ answer: 'Premium billed in 2026 was S$13,516.00 [T2026], against S$12,000.00 in 2025 [T2025].', sources: ['T2026', 'X9'], on_file: true }, ctx)
    expect(a.refused).toBeNull()
    expect(a.answer).toBe('Premium billed in 2026 was S$13,516.00, against S$12,000.00 in 2025.')
    expect(a.sources.map(s => s.id)).toEqual(['T2026', 'T2025'])
  })
  it('refuses a figure that is not on file, and an answer that cites nothing', () => {
    expect(checkAnswer({ answer: 'They paid S$25,516.00 over two years [T2026].', sources: ['T2026'] }, ctx).refused).toMatch(/25516\.00/)
    expect(checkAnswer({ answer: 'Jane handles claims.', sources: [] }, ctx).refused).toMatch(/cited nothing/)
  })
  it('lets "not on file" through without sources', () => {
    const a = checkAnswer({ answer: 'No fleet size is on file.', sources: [], on_file: false }, ctx)
    expect(a).toMatchObject({ refused: null, answer: 'No fleet size is on file.' })
  })
})
