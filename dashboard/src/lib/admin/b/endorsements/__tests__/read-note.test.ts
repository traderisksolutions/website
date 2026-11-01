import { describe, it, expect } from 'vitest'
import { readNoteText } from '../read-note'

const GE_CN = `**Great Eastern** An OCBC Company **TAX INVOICE / CREDIT NOTE** **FOREIGN WORKER MEDICAL** **ORIGINAL** --- ### PAGE 1 #### POLICY INFORMATION * **Policy No.:** 2025-A5000001-HFW-E002 * **Date of Issue:** 01/09/2026 * **Previous Policy:** - * **Effective Date:** 18/12/2025 * **Transaction No:** 3 * **Intermediary:** B0000001 * **Name:** ACME WILDLIFE PTE LTD * **Address:** 1 EXAMPLE ROAD --- #### DETAILS OF COVER * **Insured:** ACME WILDLIFE PTE LTD * **Period of Insurance:** From 28/07/2025 to 27/07/2026 (both dates inclusive) --- #### PREMIUM | Premium Item | (%) | SGD | | :--- | :---: | :---: | | **Standard Rated Premium** | | | | Gross Premium | : | 115.56 | | Discount | : | - | | Sub-Total | : | 115.56 | | GST | : 9.00 | 10.40 | | **Total Refund** | : | **125.96** | --- With effect from 18/12/2025, the following Insured Person is removed from the policy:- **Name** : Lim Boon Hock **FIN No.** : G0000000X **Date of Birth** : 23/04/1988`

const GE_DN = `Great Eastern (An OCBC Company) TAX INVOICE / DEBIT NOTE FOREIGN WORKER MEDICAL ORIGINAL === PAGE 1 === POLICY INFORMATION Policy No. : 2026-A5000002-HFW Date of Issue : 31/08/2026 Previous Policy : A5000001 Effective Date : 17/08/2026 Name : ACME WILDLIFE PTE LTD Transaction No : 1 Address : 1 EXAMPLE ROAD Intermediary : B0000001 DETAILS OF COVER Insured : ACME WILDLIFE PTE LTD Period of Insurance : From 17/08/2026 to 16/08/2027 (both dates inclusive) PREMIUM Standard Rated Premium | Item | (%) | SGD | | :--- | :--- | :--- | | Gross Premium | | 190.00 | | Discount | | - | | Sub-Total | | 190.00 | | GST | 9.00 | 17.10 | | Total Amount Due | | 207.10 |`

const QBE_INV = `**QBE Insurance (Singapore) Pte Ltd** **Date:** 13/09/2026 --- ### TAX INVOICE **Renewal** **To:** ACME WILDLIFE PTE LTD | Policy Details | | | :--- | :--- | | **Policy Number** | N0000001 | | **Period of Insurance** | 01/09/2026 to 31/08/2027 (Both Dates Inclusive) | | **Tax Invoice Number** | GMB-N0000001-T00010 -00000001 | --- ### Premium Information | Description | SGD | | :--- | ---: | | GHSM Group Hospital & Surgical Plan | 5,492.00 | | GSP0 Group Specialist Plan | 4,131.00 | | **GST @ 9.00% Standard-Rated** | **866.07** | | **Total Due** | **10,489.07** |`

describe('readNoteText', () => {
  it('reads a Great Eastern credit note for a leaver', () => {
    const r = readNoteText(GE_CN, 'attachment: cn.pdf', ['Lim Boon Hock', 'Rahim Uddin'])!
    expect(r.kind).toBe('credit')
    expect(r.event).toBe('endorsement')
    expect(r.amount).toBe(125.96)
    expect(r.gst).toBe(10.4)
    expect(r.note_no).toBe('2025-A5000001-HFW-E002/T3')
    expect(r.issued_on).toBe('2026-09-01')
    expect(r.effective_on).toBe('2025-12-18')
    expect(r.period_start).toBe('2025-07-28')
    expect(r.period_end).toBe('2026-07-27')
    expect(r.member_names).toEqual(['Lim Boon Hock'])
    expect(r.pax).toBe(1)
    expect(r.needs_review).toBe(false)
    expect(r.evidence.amount.excerpt).toMatch(/Total Refund/)
  })

  it('reads a Great Eastern debit note for a renewal', () => {
    const r = readNoteText(GE_DN, 'attachment: dn.pdf', ['Rahim Uddin'])!
    expect(r.kind).toBe('debit')
    expect(r.amount).toBe(207.1)
    expect(r.event).toBe('new_business')
    expect(r.note_no).toBe('2026-A5000002-HFW/T1')
    expect(r.period_start).toBe('2026-08-17')
  })

  it('reads a QBE tax invoice with its invoice number and plan lines', () => {
    const r = readNoteText(QBE_INV, 'attachment: inv.pdf')!
    expect(r.kind).toBe('debit')
    expect(r.event).toBe('renewal')
    expect(r.amount).toBe(10489.07)
    expect(r.gst).toBe(866.07)
    expect(r.note_no).toBe('GMB-N0000001-T00010-00000001')
    expect(r.issued_on).toBe('2026-09-13')
    expect(r.description).toContain('Group Hospital & Surgical')
  })

  it('returns null for text that is not a note and flags a missing total', () => {
    expect(readNoteText('Dear broker, please find the policy wording attached.', 'email body')).toBeNull()
    expect(readNoteText('PROFESSIONAL INDEMNITY POLICY WORDING ... the premium shall be paid ... Period of Insurance 01/01/2026 to 31/12/2026', 'attachment: wording.pdf')).toBeNull()
    expect(readNoteText('QUOTATION Premium 1,200.00 GST 108.00 Total 1,308.00 commission statement intermediary commission 20%', 'attachment: q.pdf')).toBeNull()
    const r = readNoteText('TAX INVOICE Policy No. : X123 Gross Premium 100.00', 'email body')!
    expect(r.needs_review).toBe(true)
    expect(r.amount).toBeNull()
  })
})
