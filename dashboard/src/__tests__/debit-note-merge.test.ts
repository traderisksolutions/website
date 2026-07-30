import { describe, it, expect } from 'vitest'
import { mergeBundleExtractions, type ExtractedDebitNote, type DocType } from '@/lib/debit-note-extract'

const EMPTY: ExtractedDebitNote = {
  doc_type: 'other', client_name: null, client_address: null, debit_note_no: null,
  cover_note_no: null, policy_number: null, class_of_insurance: null, insurer: null,
  description: null, period_start: null, period_end: null, currency: 'SGD',
  gross_premium: null, gst_amount: null, commission_rate: null, commission_amount: null,
  issue_date: null, payment_due_date: null,
}

function file(docType: DocType, data: Partial<ExtractedDebitNote>) {
  return { docType, data: { ...EMPTY, doc_type: docType, ...data } }
}

describe('mergeBundleExtractions', () => {
  it('merges premium/GST/policy fields from the client invoice with commission from the commission statement', () => {
    const { merged, warning } = mergeBundleExtractions([
      file('client_invoice', {
        client_name: 'ZOOMOOV PTE LTD', policy_number: 'DWMAHQ26-001346', insurer: 'EQ Insurance',
        class_of_insurance: 'Work Injury Compensation', period_start: '2026-06-18', period_end: '2027-06-17',
        gross_premium: 776, gst_amount: 69.84,
      }),
      file('commission_statement', {
        policy_number: 'DWMAHQ26-001346', insurer: 'EQ Insurance',
        commission_rate: 10, commission_amount: 77.6,
      }),
    ])

    expect(warning).toBeNull()
    expect(merged.client_name).toBe('ZOOMOOV PTE LTD')
    expect(merged.gross_premium).toBe(776)
    expect(merged.gst_amount).toBe(69.84)
    expect(merged.commission_rate).toBe(10)
    expect(merged.commission_amount).toBe(77.6)
  })

  it('flags a policy-number mismatch across files instead of silently picking one', () => {
    const { warning } = mergeBundleExtractions([
      file('client_invoice', { policy_number: 'DWMAHQ26-001346' }),
      file('trs_debit_note', { policy_number: 'DWMAHQ26-003146' }),
    ])
    expect(warning).toMatch(/DWMAHQ26-001346/)
    expect(warning).toMatch(/DWMAHQ26-003146/)
  })

  it('only pulls commission fields from the commission statement, never the client invoice', () => {
    const { merged } = mergeBundleExtractions([
      file('client_invoice', { gross_premium: 776, commission_rate: 999 }), // shouldn't happen, but must not leak through
      file('commission_statement', { commission_rate: 10, commission_amount: 77.6 }),
    ])
    expect(merged.commission_rate).toBe(10)
  })

  it('falls back to whatever single file is present when only one document was uploaded', () => {
    const { merged, warning } = mergeBundleExtractions([
      file('client_invoice', { client_name: 'Solo Client Pte Ltd', gross_premium: 500 }),
    ])
    expect(merged.client_name).toBe('Solo Client Pte Ltd')
    expect(merged.gross_premium).toBe(500)
    expect(warning).toBeNull()
  })

  it('returns the empty shape for an empty bundle', () => {
    const { merged, warning } = mergeBundleExtractions([])
    expect(merged.client_name).toBeNull()
    expect(warning).toBeNull()
  })
})
