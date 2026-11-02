/**
 * Phase 4 of the agents learning the broker's method: the issued policy against the slip, the
 * claims kinds, the house explanations, and the claims-report ask.
 */
import { describe, it, expect } from 'vitest'
import { issuedDifferences, differenceLines } from '@/lib/policies/issued-check'
import { explain } from '@/lib/admin/a/explanations'
import { buildDraft, partyOf } from '@/lib/admin/b/drafts'

describe('issued policy against the slip', () => {
  const bound = { premium_amount: 11500, premium_text: 'S$11,500', limit_text: 'S$12,500,000', insurer_name: 'Example Insurer Pte Ltd', period_from: '2026-12-01', period_to: '2028-02-29', policy_number: 'EX123', source: 'the selected quote' }
  it('passes a document that agrees, with GST on the premium', () => {
    expect(issuedDifferences({ doc_type: 'policy_schedule', policy_number: 'EX-123', insurer_name: 'Example Insurer', period_from: '2026-12-01', period_to: '2028-02-29', premium_text: 'S$12,535.00 (incl. GST)' }, bound)).toEqual([])
  })
  it('names a different premium, a moved start date and a sum insured typed wrong', () => {
    const d = issuedDifferences({ doc_type: 'policy_schedule', policy_number: 'EX123', insurer_name: 'Example Insurer', period_from: '2026-12-08', period_to: '2028-02-29', premium_text: 'S$12,000', sum_insured_text: 'S$20,000,000' }, bound)
    expect(d.map(x => x.field)).toEqual(['premium', 'period', 'sum_insured'])
    expect(differenceLines(d)[0]).toBe('Premium: issued S$12,000, bound S$11,500')
    expect(differenceLines(d)[1]).toBe('Period: issued 2026-12-08, bound 2026-12-01')
  })
  it('flags a cover note dated a decade off', () => {
    const d = issuedDifferences({ doc_type: 'cover_note', policy_number: null, insurer_name: null, period_from: '2016-12-01', period_to: '2017-11-30', premium_text: null }, { premium_amount: null, source: 'the policy record' })
    expect(d.some(x => x.field === 'period' && x.basis.includes('2016-12-01'))).toBe(true)
  })
})

describe('house explanations', () => {
  it('answers the questions the broker answers the same way every time', () => {
    expect(explain('Can you explain how the headcount basis works? Some of the leavers were counted.')?.topic).toBe('headcount_basis')
    expect(explain('Could you issue a tax invoice instead of the debit note for our e-invoicing system?')?.topic).toBe('debit_note_not_tax_invoice')
    expect(explain('Can we backdate the cover to 1 October?')?.topic).toBe('backdating_lou')
    expect(explain('Can I add my spouse as a dependant now, pro-rated?')?.topic).toBe('mid_year_dependants')
  })
  it('stays silent on a question it does not hold', () => {
    expect(explain('What is the claim reference for the hospitalisation on 9 May?')).toBeNull()
  })
})

describe('claims kinds', () => {
  const f = { greetingName: 'Angie', clientName: 'Example Client Pte Ltd', title: 'Water damage claim', policyNumber: 'EX123', insurerName: 'Example Insurer', insurerRef: 'CL-1', claimant: null, lossDate: '2026-10-20', threadSubject: 'Re: Water damage' }
  it('the acknowledgement is the broker\'s fixed line', () => {
    expect(buildDraft('client_ack', f).body).toContain('We have received the notification and have informed Example Insurer as required. Do kindly help to provide any documents, reports and photographs, when available.')
  })
  it('the adjuster email asks for the site contact and keeps the damage in place', () => {
    const b = buildDraft('adjuster_access', f).body
    expect(b).toContain("1. The site contact's name and mobile number for the adjuster")
    expect(b).toContain('keep the damaged items as they are until the adjuster has inspected them')
  })
  it('the settlement pack lists the three documents and says who is paid', () => {
    const b = buildDraft('settlement_pack', f).body
    expect(b).toContain('1. The settlement agreement or discharge voucher, signed and stamped')
    expect(b).toContain('3. The company\'s bank account details, with a contact we can call to verify them')
    expect(b).toContain('The insurer pays the policyholder as the insured')
  })
  it('the claims-report ask goes to the insurer with the expiry', () => {
    expect(partyOf('request_claims_report')).toBe('insurer')
    const b = buildDraft('request_claims_report', { ...f, expiry: '2027-01-01', threadSubject: null })
    expect(b.subject).toBe('Example Client Pte Ltd EX123: claims experience for renewal')
    expect(b.body).toContain('Ahead of the renewal of Water damage claim (Policy No. EX123, claim ref. CL-1, loss on 20 Oct 2026) on 1 Jan 2027')
  })
})

describe('the delivery pack', () => {
  it('carries the billing line only when the TRS debit note is among the files', async () => {
    const { composeRelay } = await import('@/lib/admin/b/relay/compose')
    const base = { greetingName: 'Serene', clientName: 'Example Client Pte Ltd', insurerName: 'Example Insurer', lineLabel: null, policyNumber: 'EX123', className: 'Public liability', threadSubject: 'Re: PL renewal', title: 'PL renewal' }
    const withNote = composeRelay('relay_documents', { ...base, files: ['Policy EX123.pdf', 'TRS DN260901.pdf'], billing: true })
    expect(withNote.subject).toBe('Re: PL renewal')
    expect(withNote.body).toContain('settlement can be made via Trade Risk Solutions as per the attached TRS debit note')
    expect(withNote.body).toContain('This is not a tax invoice')
    const without = composeRelay('relay_documents', { ...base, files: ['Policy EX123.pdf'] })
    expect(without.body).not.toContain('debit note')
  })
})
