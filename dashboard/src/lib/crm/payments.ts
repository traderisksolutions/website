/**
 * Payment maths for debit notes. The stored `status` is set by hand in the debit-note drawer;
 * this module derives what staff actually need to know: how much is still outstanding, whether
 * it is overdue, and by how many days. Pure functions, safe on the client.
 */
import type { DebitNoteRow, PaymentDerived, PaymentSummary, MoneyByCurrency } from './types'
import { daysBetween, todaySGT } from './format'

export function outstandingOf(row: Pick<DebitNoteRow, 'status' | 'gross_amount' | 'net_amount' | 'paid_amount' | 'paid_direct_amount'>): number {
  if (row.status === 'paid') return 0
  const total = Number(row.net_amount ?? row.gross_amount ?? 0)
  const paid  = Number(row.paid_amount ?? 0) + Number(row.paid_direct_amount ?? 0)
  return Math.max(0, Math.round((total - paid) * 100) / 100)
}

export function derivePayment(row: DebitNoteRow & { policyNumber?: string | null; classOfInsurance?: string | null }, today = todaySGT()): PaymentDerived {
  const outstanding = outstandingOf(row)
  const due = row.payment_due_date
  const daysToDue = due ? daysBetween(today, due) : null
  const overdue = outstanding > 0 && daysToDue !== null && daysToDue < 0
  const derived = outstanding === 0
    ? 'paid'
    : overdue ? 'overdue'
    : (Number(row.paid_amount ?? 0) + Number(row.paid_direct_amount ?? 0)) > 0 ? 'partial' : 'unpaid'
  return {
    ...row,
    outstanding,
    derived,
    daysOverdue: overdue && daysToDue !== null ? -daysToDue : 0,
    daysToDue,
    policyNumber: row.policyNumber ?? null,
    classOfInsurance: row.classOfInsurance ?? null,
  }
}

export function summarizePayments(rows: PaymentDerived[]): PaymentSummary {
  const by = new Map<string, MoneyByCurrency>()
  let overdueCount = 0, openCount = 0
  let nextDue: string | null = null
  for (const r of rows) {
    if (r.outstanding <= 0) continue
    openCount++
    const cur = by.get(r.currency) ?? { currency: r.currency, outstanding: 0, overdue: 0 }
    cur.outstanding = Math.round((cur.outstanding + r.outstanding) * 100) / 100
    if (r.derived === 'overdue') { overdueCount++; cur.overdue = Math.round((cur.overdue + r.outstanding) * 100) / 100 }
    else if (r.payment_due_date && (!nextDue || r.payment_due_date < nextDue)) nextDue = r.payment_due_date
    by.set(r.currency, cur)
  }
  const byCurrency = Array.from(by.values()).sort((a, b) => (a.currency === 'SGD' ? -1 : b.currency === 'SGD' ? 1 : a.currency.localeCompare(b.currency)))
  return { byCurrency, overdueCount, openCount, nextDue }
}

export const PAYMENT_LABEL: Record<PaymentDerived['derived'], string> = {
  paid: 'Paid', partial: 'Partly paid', unpaid: 'Unpaid', overdue: 'Overdue',
}
