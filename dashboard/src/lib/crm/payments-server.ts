/** Server-side loader for a company's debit notes, already run through the payment maths. */
import { sbTry, enc } from './db'
import { derivePayment, summarizePayments } from './payments'
import type { DebitNoteRow, PaymentDerived, PaymentSummary } from './types'

type Row = DebitNoteRow & { policies: { policy_number: string | null; class_of_insurance: string | null } | null }

const SELECT = 'id,company_id,contact_id,policy_id,debit_note_no,issue_date,payment_due_date,currency,gross_amount,net_amount,paid_amount,paid_direct_amount,status,paid_direct_status,pay_direct_to_insurer,insurer,event_type,drive_folder_url,updated_at,policies(policy_number,class_of_insurance)'

export async function loadCompanyPayments(companyId: string): Promise<{ notes: PaymentDerived[]; summary: PaymentSummary }> {
  const rows = await sbTry<Row[]>(`debit_notes?company_id=eq.${enc(companyId)}&select=${SELECT}&order=issue_date.desc&limit=200`, [])
  const notes = rows.map(r => derivePayment({ ...r, policyNumber: r.policies?.policy_number ?? null, classOfInsurance: r.policies?.class_of_insurance ?? null }))
  return { notes, summary: summarizePayments(notes) }
}

export async function loadDebitNotesByIds(ids: string[]): Promise<PaymentDerived[]> {
  if (ids.length === 0) return []
  const rows = await sbTry<Row[]>(`debit_notes?id=in.(${ids.map(enc).join(',')})&select=${SELECT}`, [])
  return rows.map(r => derivePayment({ ...r, policyNumber: r.policies?.policy_number ?? null, classOfInsurance: r.policies?.class_of_insurance ?? null }))
}
