import { describe, it, expect } from 'vitest'
import { statusFor, totalOf } from '@/lib/crm/receipts'
import { outstandingOf, derivePayment } from '@/lib/crm/payments'
import type { DebitNoteRow } from '@/lib/crm/types'

const base = {
  id: 'n1', company_id: 'c1', contact_id: null, policy_id: null, debit_note_no: 'DN260101',
  issue_date: '2026-01-01', payment_due_date: '2026-01-31', currency: 'SGD',
  gross_amount: 1000, net_amount: 1000, paid_amount: 0, paid_direct_amount: 0,
  status: 'unpaid', paid_direct_status: 'unpaid', pay_direct_to_insurer: false,
  insurer: null, event_type: null, drive_folder_url: null, updated_at: null,
} as unknown as DebitNoteRow

describe('statusFor', () => {
  it('moves unpaid → partially_paid → paid as money is recorded', () => {
    expect(statusFor(0, 1000)).toBe('unpaid')
    expect(statusFor(400, 1000)).toBe('partially_paid')
    expect(statusFor(1000, 1000)).toBe('paid')
    expect(statusFor(1200, 1000)).toBe('paid')
  })

  it('tolerates half-cent rounding rather than leaving a note one cent short', () => {
    expect(statusFor(999.999, 1000)).toBe('paid')
  })
})

describe('totalOf', () => {
  it('prefers the net amount, which is what the client actually owes', () => {
    expect(totalOf({ net_amount: 900, gross_amount: 1000 } as DebitNoteRow)).toBe(900)
    expect(totalOf({ net_amount: null, gross_amount: 1000 } as unknown as DebitNoteRow)).toBe(1000)
  })
})

describe('outstandingOf — amounts decide, not the stored status', () => {
  it('clears the balance once the recorded payments cover the bill', () => {
    expect(outstandingOf({ ...base, paid_amount: 1000 })).toBe(0)
    expect(outstandingOf({ ...base, paid_direct_amount: 1000 })).toBe(0)
    expect(outstandingOf({ ...base, paid_amount: 400, paid_direct_amount: 600 })).toBe(0)
  })

  it('settling direct with the insurer counts, which it did not before', () => {
    expect(outstandingOf({ ...base, paid_direct_amount: 250 })).toBe(750)
  })

  it('a status of paid with money recorded against it no longer hides the balance', () => {
    // The old behaviour returned 0 here and zeroed the client's balance dashboard-wide.
    expect(outstandingOf({ ...base, status: 'paid', paid_amount: 100 })).toBe(900)
  })

  it('still honours a legacy note marked paid before any amount was entered', () => {
    expect(outstandingOf({ ...base, status: 'paid' })).toBe(0)
  })
})

describe('derivePayment', () => {
  it('calls a note past due only while money is still outstanding', () => {
    expect(derivePayment(base, '2026-03-01').derived).toBe('overdue')
    expect(derivePayment({ ...base, paid_amount: 1000 }, '2026-03-01').derived).toBe('paid')
  })

  it('reports part payment before the due date', () => {
    expect(derivePayment({ ...base, paid_amount: 300 }, '2026-01-10').derived).toBe('partial')
  })
})
