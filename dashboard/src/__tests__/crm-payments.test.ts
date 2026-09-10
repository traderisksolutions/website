import { describe, it, expect } from 'vitest'
import { derivePayment, summarizePayments, outstandingOf } from '@/lib/crm/payments'
import type { DebitNoteRow } from '@/lib/crm/types'

const base: DebitNoteRow = {
  id: 'dn1', company_id: 'c1', contact_id: null, policy_id: null, debit_note_no: 'DN260607',
  issue_date: '2026-06-08', payment_due_date: '2026-07-08', currency: 'SGD',
  gross_amount: 2507, net_amount: 2507, paid_amount: 0, paid_direct_amount: 0,
  status: 'unpaid', paid_direct_status: 'unpaid', pay_direct_to_insurer: false,
  insurer: 'Allianz', event_type: 'new_business', drive_folder_url: null, updated_at: '2026-08-27T07:13:47Z',
}

describe('derivePayment', () => {
  it('flags an unpaid note past its due date as overdue with the day count', () => {
    const d = derivePayment(base, '2026-09-10')
    expect(d.derived).toBe('overdue')
    expect(d.outstanding).toBe(2507)
    expect(d.daysOverdue).toBe(64)
    expect(d.daysToDue).toBe(-64)
  })

  it('keeps a note before its due date as unpaid', () => {
    const d = derivePayment(base, '2026-07-01')
    expect(d.derived).toBe('unpaid')
    expect(d.daysOverdue).toBe(0)
    expect(d.daysToDue).toBe(7)
  })

  it('treats a note due today as not yet overdue', () => {
    expect(derivePayment(base, '2026-07-08').derived).toBe('unpaid')
  })

  it('subtracts payments to TRS and direct to the insurer', () => {
    const d = derivePayment({ ...base, paid_amount: 1000, paid_direct_amount: 507 }, '2026-09-10')
    expect(d.outstanding).toBe(1000)
    expect(d.derived).toBe('overdue')
    expect(derivePayment({ ...base, paid_amount: 1000 }, '2026-07-01').derived).toBe('partial')
  })

  it('is paid when status says so, whatever the amounts say', () => {
    const d = derivePayment({ ...base, status: 'paid', paid_amount: 0 }, '2026-09-10')
    expect(d.derived).toBe('paid')
    expect(d.outstanding).toBe(0)
  })

  it('falls back to gross when net is missing and never goes negative', () => {
    expect(outstandingOf({ status: 'unpaid', gross_amount: 100, net_amount: null, paid_amount: 150, paid_direct_amount: 0 })).toBe(0)
    expect(outstandingOf({ status: 'unpaid', gross_amount: 100, net_amount: null, paid_amount: 40, paid_direct_amount: 0 })).toBe(60)
  })

  it('has no due maths when the due date is unknown', () => {
    const d = derivePayment({ ...base, payment_due_date: null }, '2026-09-10')
    expect(d.derived).toBe('unpaid')
    expect(d.daysToDue).toBeNull()
  })
})

describe('summarizePayments', () => {
  it('totals by currency, splits overdue and finds the next due date', () => {
    const rows = [
      derivePayment(base, '2026-09-10'),
      derivePayment({ ...base, id: 'dn2', debit_note_no: 'DN2', payment_due_date: '2026-10-01', net_amount: 1000, gross_amount: 1000 }, '2026-09-10'),
      derivePayment({ ...base, id: 'dn3', debit_note_no: 'DN3', currency: 'USD', payment_due_date: '2026-09-20', net_amount: 300, gross_amount: 300 }, '2026-09-10'),
      derivePayment({ ...base, id: 'dn4', debit_note_no: 'DN4', status: 'paid' }, '2026-09-10'),
    ]
    const s = summarizePayments(rows)
    expect(s.openCount).toBe(3)
    expect(s.overdueCount).toBe(1)
    expect(s.nextDue).toBe('2026-09-20')
    expect(s.byCurrency[0]).toEqual({ currency: 'SGD', outstanding: 3507, overdue: 2507 })
    expect(s.byCurrency[1]).toEqual({ currency: 'USD', outstanding: 300, overdue: 0 })
  })
})
