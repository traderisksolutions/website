import { describe, it, expect } from 'vitest'
import { buildReminderDraft } from '@/lib/crm/reminder'
import { derivePayment } from '@/lib/crm/payments'
import { parseJsonLoose } from '@/lib/crm/ai'
import { normalizeCompany, emailDomain, bareEmail, displayNameFromAddress, isAutomated } from '@/lib/crm/db'
import { fmtMoney, daysBetween, addDays, fmtRelative } from '@/lib/crm/format'
import type { Company, DebitNoteRow } from '@/lib/crm/types'

const company: Company = normalizeCompany({ id: 'c1', company_name: 'Propelo Aviation Pte Ltd', created_at: '2026-07-30' })
const note: DebitNoteRow = {
  id: 'dn1', company_id: 'c1', contact_id: null, policy_id: null, debit_note_no: 'DN260607',
  issue_date: '2026-06-08', payment_due_date: '2026-07-08', currency: 'SGD',
  gross_amount: 2507, net_amount: 2507, paid_amount: 0, paid_direct_amount: 0,
  status: 'unpaid', paid_direct_status: 'unpaid', pay_direct_to_insurer: false,
  insurer: 'Allianz', event_type: 'new_business', drive_folder_url: null, updated_at: '2026-08-27T07:13:47Z',
}

describe('buildReminderDraft', () => {
  it('writes a firm reminder for an overdue note, addressed by first name', () => {
    const d = buildReminderDraft(company, [derivePayment({ ...note, policyNumber: 'PI-1', classOfInsurance: 'Professional Indemnity' } as DebitNoteRow & { policyNumber: string; classOfInsurance: string }, '2026-09-10')], { email: 'jane@propelo.com', name: 'Jane Tan' })
    expect(d.toEmail).toBe('jane@propelo.com')
    expect(d.subject).toBe('Payment reminder: Debit Note DN260607')
    expect(d.body).toContain('Dear Jane,')
    expect(d.body).toContain('past the payment due date')
    expect(d.body).toContain('DN260607 — SGD 2,507.00 — due 8 Jul 2026 (overdue by 64 days) — Professional Indemnity, policy PI-1')
    expect(d.body).toContain('Total outstanding: SGD 2,507.00')
    expect(d.companyId).toBe('c1')
  })

  it('is a friendly reminder when nothing is overdue yet and counts several notes', () => {
    const rows = [
      derivePayment(note, '2026-07-01'),
      derivePayment({ ...note, id: 'dn2', debit_note_no: 'DN2', net_amount: 1000, gross_amount: 1000 }, '2026-07-01'),
    ]
    const d = buildReminderDraft(company, rows, { email: 'ap@propelo.com', name: null })
    expect(d.subject).toBe('Payment reminder: 2 debit notes outstanding')
    expect(d.body).toContain('Dear Sir or Madam,')
    expect(d.body).toContain('friendly reminder')
    expect(d.body).toContain('Total outstanding: SGD 3,507.00')
  })

  it('skips notes that are already paid', () => {
    const d = buildReminderDraft(company, [derivePayment({ ...note, status: 'paid' }, '2026-09-10'), derivePayment({ ...note, id: 'x', debit_note_no: 'DNX' }, '2026-09-10')], { email: 'a@b.com', name: null })
    expect(d.body).not.toContain('DN260607')
    expect(d.body).toContain('DNX')
  })
})

describe('parseJsonLoose', () => {
  it('strips code fences and leading prose', () => {
    expect(parseJsonLoose<{ a: number }>('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(parseJsonLoose<number[]>('Here you go: [1,2,3] thanks')).toEqual([1, 2, 3])
  })
  it('returns null for garbage', () => {
    expect(parseJsonLoose('no json here')).toBeNull()
    expect(parseJsonLoose('{"a":')).toBeNull()
  })
})

describe('normalizeCompany', () => {
  it('maps company_name to name and defaults the CRM fields before the migration', () => {
    const c = normalizeCompany({ id: 'x', company_name: 'Acme', domain: 'Acme.com', created_at: '2026-01-01' })
    expect(c.name).toBe('Acme')
    expect(c.kind).toBe('client')
    expect(c.stage).toBe('client')
    expect(c.domains).toEqual(['acme.com'])
    expect(c.ai_brief).toBeNull()
  })
  it('prefers the domains array once present and rejects unknown stages', () => {
    const c = normalizeCompany({ id: 'x', company_name: 'Acme', domain: 'old.com', domains: ['new.com'], stage: 'bogus', kind: 'insurer' })
    expect(c.domains).toEqual(['new.com'])
    expect(c.stage).toBe('client')
    expect(c.kind).toBe('insurer')
  })
})

describe('email helpers', () => {
  it('extracts domains, bare addresses and display names', () => {
    expect(emailDomain('Jane <Jane.Tan@Propelo.COM>')).toBe('propelo.com')
    expect(bareEmail('"Tan, Jane" <jane@propelo.com>')).toBe('jane@propelo.com')
    expect(displayNameFromAddress('"Tan, Jane" <jane@propelo.com>')).toBe('Tan, Jane')
    expect(displayNameFromAddress('jane@propelo.com')).toBeNull()
    expect(isAutomated('no-reply@qbe.com')).toBe(true)
    expect(isAutomated('jane@propelo.com')).toBe(false)
  })
})

describe('format helpers', () => {
  it('formats money, compacts large amounts, and does date arithmetic on calendar dates', () => {
    expect(fmtMoney(2507, 'SGD')).toBe('SGD 2,507.00')
    expect(fmtMoney(125000, 'SGD', { compact: true })).toBe('SGD 125k')
    expect(daysBetween('2026-09-10', '2026-09-20')).toBe(10)
    expect(addDays('2026-09-28', 5)).toBe('2026-10-03')
    expect(fmtRelative('2026-09-12T00:00:00Z', new Date('2026-09-10T00:00:00Z'))).toBe('in 2 days')
    expect(fmtRelative('2026-09-09T00:00:00Z', new Date('2026-09-10T00:00:00Z'))).toBe('yesterday')
  })
})
