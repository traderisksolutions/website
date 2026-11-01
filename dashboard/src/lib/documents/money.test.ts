import { describe, it, expect } from 'vitest'
import { parseAmount, parseDate, findPeriod, findPolicyNoInText, readInsurerNote, readScheduleTerms, readClaimSettlement, policyTokens, samePolicyNumber } from './money'

// Fixtures follow the real insurers' layouts with made-up names, numbers and amounts.

const GE_TAX_INVOICE = `TAX INVOICE / DEBIT NOTE
FOREIGN WORKER MEDICAL ORIGINAL
POLICY INFORMATION
Policy No. : 2026-A9900001-HFW-R001
Previous Policy : -
Name : ACME FABRICATION PTE LTD
Date of Issue : 06/07/2026
Effective Date : 01/09/2026
Transaction No : 2
Intermediary : B0000136
DETAILS OF COVER
Insured : ACME FABRICATION PTE LTD
Period of Insurance : From 01/09/2026 to 31/08/2027 (both dates inclusive)
PREMIUM
(%) SGD
Standard Rated Premium
Gross Premium : 2,800.00
Discount : -
Sub-Total : 2,800.00
GST : 9.00 252.00
Total Amount Due : 3,052.00
Please ignore this tax invoice if payment has been made.
GST Regn No. M90366503P
Great Eastern General Insurance Limited | 1 Pickering Street`

const QBE_CREDIT = `**QBE Insurance (Singapore) Pte Ltd**
GST Registration No.: M200644018
Date: 30/03/2026
### **TAX INVOICE**
### **Endorsement**
| Policy Number | Period of Insurance | Account Number / Name |
| :--- | :--- | :--- |
| **N0099001** | **25/01/2026 to 24/01/2027**<br>(Both Dates Inclusive) | **01001639**<br>**TRADE RISK SOLUTIONS PTE LTD** |
| **Tax Invoice Number** | | |
| **GMB-N0099001-T00003 -00199487** | | |
### **Premium Information**
| Description | SGD |
| :--- | :--- |
| GHSM Group Hospital & Surgical Plan | 474.66- |
| GOP0 Group Outpatient Plan | 373.40- |
| GST @ 9.00% Standard-Rated | 76.33- |
| **Total Due** | **924.39-** |
Please note this is a Credit Note and no payment is required.`

const LIBERTY_TABLE = `Tax Invoice/
Debit Note
Details of Tax Invoice/Debit Note
| Class of Policy: | Policy No.: | Debit Note |
| :--- | :--- | :--- |
| Shopcare | SI26Q00001/QAS/R01/E00 | DN26130999 |
| Previous Policy No.: | Date of Issue: | Period of Insurance (Both Dates Inclusive): |
| :--- | :--- | :--- |
| SI25Q00001 | 17 Jul 2026 | From: 17 Jul 2026 00:00 |
| | | To: 16 Jul 2027 23:59 |
Name of Producer: TRADE RISK SOLUTIONS PTE LTD (B9199-3)
Details of Premium
Gross Premium: S$ 513.00
Prevailing GST (9%): S$ 46.17
Total Premium: S$ 559.17
Liberty Pte Limited. UEN | GST Reg. No. 201538069C`

const GE_COMMISSION = `**Great Eastern**
**CREDIT NOTE**
**FOREIGN WORKER MEDICAL**
### POLICY INFORMATION
* **Policy No.** : 2026-A9900002-HFW
* **Date of Issue** : 29/06/2026
* **Name** : TRADE RISK SOLUTIONS PTE LTD
### DETAILS OF COVER
* **Insured Name** : ACME FABRICATION PTE LTD
* **Period of Insurance** : From 01/07/2026 to 30/06/2027 (both dates inclusive)
### COMMISSION DETAILS
| Description | (%) | SGD |
| Commission : | 15.00 | 3,159.00 |
| Commission Payable : | | 3,159.00 |
| Net Premium : | | 19,796.40 |`

const TRS_CN = `TRADE RISK SOLUTIONS
Co Reg No 202022795H
CREDIT NOTE
Acme Fabrication Pte Ltd
Date: 10-Jul-26
Debit Note No: CN 260999
Policy No: N0099001
Class of Insurance: Employee Benefit Insurance
Period of Insurance: 25/01/2026 to 24/01/2027 (Both Dates Inclusive)
Description: Credit note for staff resignation
Gross Premium refunded to client SGD (924.39)
TOTAL (924.39)`

const SCHEDULE = `SCHEDULE
FOREIGN WORKER MEDICAL
POLICY INFORMATION
Policy No. : 2026-A9900001-HFW-R001
Period of Insurance : From 01/09/2026 to 31/08/2027 (both dates inclusive)
PREMIUM
Gross Premium : SGD 2,800.00
GST : SGD 252.00
Total Amount Due : SGD 3,052.00
DETAILS OF COVER
Plan : Plan 60-Hospital Surgical Exps
Risk Number : 001 | H & S (per policy year) | 60,000.00
Insured Person (s) : On Unnamed Basis (Headcount : 20) | |`

const IAR_SCHEDULE = `| **Class of Policy** | INDUSTRIAL ALL RISK -COMMERCIAL RISK |
| **Policy No.** | SD26F00001 / FIC /R1 /E0 |
| **Period of Insurance** | From 08-AUG-2026 To 07-AUG-2027 Both Dates Inclusive |
| **Gross Premium** | SGD **************1,050.00 |
| ITEM | DESCRIPTION OF PROPERTY | SUM INSURED |
| 1 | RENOVATION TO PREMISE | SGD ********100,000.00 |
| **TOTAL SUM INSURED** | | **SGD *******1,100,000.00** |
### **Excess**
IT IS HEREBY DECLARED AND AGREED THAT THE INSURED SHALL BE RESPONSIBLE FOR THE FIRST S$500.00 IN RESPECT OF EACH AND EVERY LOSS`

const RENEWAL = `RENEWAL NOTICE FOR WORK INJURY COMPENSATION
POLICY NUMBER: 5100000001
Thank you for insuring with Income.
We are pleased to invite you for the upcoming renewal based on the following terms:
Period of Insurance : 08 Aug 2026 to 07 Aug 2027
Sum Insured : S$530,280.00
Premium : S$592.44
GST 9% : S$53.32
Total Premium Payable : S$645.76
Total Salaries Wages and Other Earnings On Which The Premium is Based
3 EXECUTIVES S$179,520.00`

const CLAIM_LETTER = `AIA Singapore
Jun 19, 2026
Dear Customer
Policy No. : H200000001 and E200000001
Life Assured : Tan Ah Kow
Claim No. : 0003 00 00 and 0003 00 01
Event Date : Jun 02, 2026
We are pleased to inform you that we have approved your claim. Kindly refer to the enclosed Settlement Details.
Total Amount Payable : S$1,234.56
We have made payment to Luma Day Surgery Centre.`

describe('amounts and dates', () => {
  it('reads thousands, currencies and negatives', () => {
    expect(parseAmount('SGD 3,357.20')).toBe(3357.2)
    expect(parseAmount('1,118.53-')).toBe(-1118.53)
    expect(parseAmount('(381.50)')).toBe(-381.5)
    expect(parseAmount('-$ (125.96)')).toBe(-125.96)
    expect(parseAmount('S$ 48,069.00')).toBe(48069)
    expect(parseAmount('no money here')).toBeNull()
  })
  it('reads day-first and month-name dates', () => {
    expect(parseDate('06/07/2026')).toBe('2026-07-06')
    expect(parseDate('12 AUG 2026')).toBe('2026-08-12')
    expect(parseDate('08-AUG-2026')).toBe('2026-08-08')
    expect(parseDate('17 Jul 26')).toBe('2026-07-17')
    expect(parseDate('10-Jul-26')).toBe('2026-07-10')
    expect(parseDate('Jun 19, 2026')).toBe('2026-06-19')
    expect(parseDate('31/02/2026')).toBeNull()
  })
  it('finds a period across layouts', () => {
    expect(findPeriod('Period of Insurance : From 01/09/2026 to 31/08/2027 (both dates inclusive)')).toEqual({ start: '2026-09-01', end: '2027-08-31' })
    expect(findPeriod('| Period of Insurance | FROM 08 AUG 2026\nTO 07 AUG 2027\nBoth Dates Inclusive |')).toEqual({ start: '2026-08-08', end: '2027-08-07' })
    expect(findPeriod('Period of Insurance\n01/09/2025 to 31/08/2026\n(Both Dates Inclusive)')).toEqual({ start: '2025-09-01', end: '2026-08-31' })
    expect(findPeriod('| Period of Insurance | From 08-AUG-2026 To 07-AUG-2027 Both Dates Inclusive |')).toEqual({ start: '2026-08-08', end: '2027-08-07' })
    expect(findPeriod('From: 17 Jul 2026 00:00 |\n| | | To: 16 Jul 2027 23:59 |')).toEqual({ start: '2026-07-17', end: '2027-07-16' })
    expect(findPeriod('nothing dated')).toBeNull()
  })
})

describe('policy numbers', () => {
  it('reads the number as written, including slashes', () => {
    expect(findPolicyNoInText('Policy No. : SD26F02212 / R01\nDocument No : DN26146827')).toBe('SD26F02212/R01')
    expect(findPolicyNoInText(LIBERTY_TABLE)).toBe('SI26Q00001/QAS/R01/E00')
    expect(findPolicyNoInText('| Policy Number | Period |\n| GMB-N0018530-T00001 | 01/09/2026 |')).toBe('GMB-N0018530-T00001')
  })
  it('shares identity tokens across an insurer\'s variants', () => {
    expect(policyTokens('2026-A5614771-HFW-R001')).toEqual(['A5614771'])
    expect(policyTokens('GMB-N0018530-T00001')).toEqual(['N0018530'])
    expect(samePolicyNumber('2026-A5614771-HFW-R001', 'A5614771')).toBe(true)
    expect(samePolicyNumber('SD26F02212 / R01', 'SD26F02212/FIC/R1/E0')).toBe(true)
    expect(samePolicyNumber('N0018530', 'N0019621')).toBe(false)
  })
})

describe('readInsurerNote', () => {
  it('reads a Great Eastern tax invoice', () => {
    const r = readInsurerNote(GE_TAX_INVOICE)!
    expect(r.kind).toBe('debit'); expect(r.copy).toBe('client'); expect(r.issuer).toBe('insurer')
    expect(r.policy_no).toBe('2026-A9900001-HFW-R001')
    expect(r.gross?.value).toBe(2800); expect(r.gst?.value).toBe(252); expect(r.total?.value).toBe(3052)
    expect(r.issued_on).toBe('2026-07-06'); expect(r.effective_on).toBe('2026-09-01')
    expect(r.period_start).toBe('2026-09-01'); expect(r.period_end).toBe('2027-08-31')
    expect(r.note_no).toBe('2026-A9900001-HFW-R001#2')
    expect(r.insurer).toMatch(/Great Eastern/)
    expect(r.confidence).toBe('high')
  })
  it('reads a QBE endorsement credit with per-plan lines', () => {
    const r = readInsurerNote(QBE_CREDIT)!
    expect(r.kind).toBe('credit'); expect(r.endorsement).toBe(true)
    expect(r.total?.value).toBe(-924.39); expect(r.gst?.value).toBe(-76.33); expect(r.gross?.value).toBe(-848.06)
    expect(r.policy_no).toBe('N0099001'); expect(r.period_start).toBe('2026-01-25')
    expect(r.note_no).toBe('GMB-N0099001-T00003')
    expect(r.items.map(i => i.amount)).toEqual([-474.66, -373.4])
  })
  it('reads a header-over-values table', () => {
    const r = readInsurerNote(LIBERTY_TABLE)!
    expect(r.policy_no).toBe('SI26Q00001/QAS/R01/E00'); expect(r.note_no).toBe('DN26130999')
    expect(r.issued_on).toBe('2026-07-17'); expect(r.period_start).toBe('2026-07-17'); expect(r.period_end).toBe('2027-07-16')
    expect(r.gross?.value).toBe(513); expect(r.total?.value).toBe(559.17)
  })
  it('keeps a commission statement as the intermediary copy, not a client credit', () => {
    const r = readInsurerNote(GE_COMMISSION)!
    expect(r.copy).toBe('intermediary'); expect(r.kind).toBe('debit')
    expect(r.gross).toBeNull(); expect(r.commission?.value).toBe(3159)
  })
  it('marks TRS\'s own credit note', () => {
    const r = readInsurerNote(TRS_CN)!
    expect(r.issuer).toBe('trs'); expect(r.kind).toBe('credit'); expect(r.note_no).toBe('CN260999'); expect(r.gross?.value).toBe(-924.39)
  })
  it('returns null without money', () => {
    expect(readInsurerNote('Dear Sirs,\nPlease find attached.\nRegards')).toBeNull()
  })
})

describe('readScheduleTerms', () => {
  it('reads premium, headcount and the rate per head', () => {
    const r = readScheduleTerms(SCHEDULE)!
    expect(r.gross?.value).toBe(2800); expect(r.total?.value).toBe(3052); expect(r.headcount).toBe(20); expect(r.rate_per_head).toBe(140)
    expect(r.period_start).toBe('2026-09-01'); expect(r.renewal_terms).toBe(false); expect(r.confidence).toBe('high')
  })
  it('reads sum insured and excess from a property schedule', () => {
    const r = readScheduleTerms(IAR_SCHEDULE)!
    expect(r.sum_insured?.value).toBe(1100000); expect(r.excess?.value).toBe(500); expect(r.gross?.value).toBe(1050)
    expect(r.policy_no).toBe('SD26F00001/FIC/R1/E0'); expect(r.period_start).toBe('2026-08-08')
  })
  it('reads a renewal invitation as terms, with the wages base', () => {
    const r = readScheduleTerms(RENEWAL)!
    expect(r.renewal_terms).toBe(true); expect(r.gross?.value).toBe(592.44); expect(r.total?.value).toBe(645.76)
    expect(r.sum_insured?.value).toBe(530280); expect(r.policy_no).toBe('5100000001'); expect(r.insurer).toMatch(/Income/)
  })
})

describe('readClaimSettlement', () => {
  it('reads decision, amount, claim number and dates', () => {
    const r = readClaimSettlement(CLAIM_LETTER)!
    expect(r.decision).toBe('paid'); expect(r.amount?.value).toBe(1234.56)
    expect(r.claim_no).toBe('0003 00 00'); expect(r.claimant).toBe('Tan Ah Kow')
    expect(r.event_date).toBe('2026-06-02'); expect(r.letter_date).toBe('2026-06-19')
    expect(r.confidence).toBe('high')
  })
  it('returns null for a letter with no claim', () => {
    expect(readClaimSettlement('Payment instructions for the arbitration deposit.')).toBeNull()
  })
})
