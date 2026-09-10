/**
 * Payment reminder drafting. Pure text assembly — the draft opens in the Engagement composer,
 * where staff edit and send it. Nothing is sent from here.
 */
import { fmtMoney, fmtDate } from './format'
import type { Company, PaymentDerived } from './types'

export interface ReminderDraft {
  toEmail: string
  toName?: string
  subject: string
  body: string
  companyId: string
}

export function buildReminderDraft(company: Company, notes: PaymentDerived[], to: { email: string; name: string | null }, senderName = 'Trade Risk Solutions'): ReminderDraft {
  const open = notes.filter(n => n.outstanding > 0)
  const lines = open.map(n => {
    const overdue = n.derived === 'overdue' ? ` (overdue by ${n.daysOverdue} day${n.daysOverdue === 1 ? '' : 's'})` : ''
    const cover = [n.classOfInsurance, n.policyNumber ? `policy ${n.policyNumber}` : null].filter(Boolean).join(', ')
    return `• Debit note ${n.debit_note_no} — ${fmtMoney(n.outstanding, n.currency)} — due ${fmtDate(n.payment_due_date)}${overdue}${cover ? ` — ${cover}` : ''}`
  })
  const totals = new Map<string, number>()
  for (const n of open) totals.set(n.currency, (totals.get(n.currency) ?? 0) + n.outstanding)
  const totalLine = Array.from(totals.entries()).map(([c, v]) => fmtMoney(v, c)).join(' and ')

  const greeting = to.name ? `Dear ${to.name.split(' ')[0]},` : 'Dear Sir or Madam,'
  const anyOverdue = open.some(n => n.derived === 'overdue')
  const subject = open.length === 1
    ? `Payment reminder: Debit Note ${open[0].debit_note_no}`
    : `Payment reminder: ${open.length} debit notes outstanding`

  const body = [
    greeting,
    '',
    anyOverdue
      ? `We hope you are well. Our records show that the following debit note${open.length === 1 ? ' is' : 's are'} past the payment due date:`
      : `We hope you are well. This is a friendly reminder that the following debit note${open.length === 1 ? ' is' : 's are'} due for payment:`,
    '',
    ...lines,
    '',
    `Total outstanding: ${totalLine}`,
    '',
    'Payment details are on the debit note. If you have already made payment, please disregard this message and let us know so we can update our records.',
    '',
    'Please reach out if you have any questions.',
    '',
    'Best regards,',
    senderName,
  ].join('\n')

  return { toEmail: to.email, toName: to.name ?? undefined, subject, body, companyId: company.id }
}
