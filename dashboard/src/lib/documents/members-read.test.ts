import { describe, it, expect } from 'vitest'
import { readMemberListingText, readMemberListingRows, listingDate, maskId, relationshipOf, parseMemberRows } from './members-read'
import { matchListingPolicy, matchListingPolicies, type EbPolicy } from './members-store'
import { policyToOpen, type MoneyDoc, type PolicyLite } from './money-store'

// Fixtures are invented: names, numbers and insurers do not refer to anyone.

const CSV = `Sheet: MemberSheet
Category of employee,Employee NRIC,Dependent NRIC,Occupation Class,Relationship,Name,Date of Birth (DD/MM/YYYY),Gender,Nationality,Hire Date (DD/MM/YYYY),Marital Status,Email,Remarks
All Employees,S1234567A,,Class 1,Employee,Ada Lim,16/07/1987,Female,Singapore,,,ada@example.test,
All Employees,S7654321B,,Class 1,Employee,"Ong, Ben",19/12/1994,Male,Singapore,01/03/2026,,ben@example.test,
All Employees,S7654321B,T0001234C,Class 1,Child,Ong Cai,05/05/2020,Male,Singapore,,,,
,,,,,,,,,,,,
Total,,,,,3,,,,,,,`

const QBE_PDF = `=== PAGE 1 ===
**[Insured & Policy Details]**
EXAMPLE PTE LTD
Policy Number: GMB-N0099999-T00001
Period of Insurance: 01/10/2026 to 30/09/2027 (Both Dates Inclusive)
Date of issue: 04/08/2026
MEMBER LISTING - RENEWAL NOTICES

| Name of Member | Member No. | Age/Sex | Family Code | Employee No | Movement Code | Effective Date | Plan No. | Product | Premium (SGD) |
|---|---|---|---|---|---|---|---|---|---|
| ADA LIM | 00001-00 | 39 / F | Member | | R | 01/10/2026 | 001 | GHSM | 342.00 |
| | | | | | | | 001 | GOP0 | 413.00 |
| BEN ONG | 00002-00 | 31 / M | Member | | R | 01/10/2026 | 001 | GHSM | 342.00 |
| CAI ONG | 00002-02 | 6 / M | Child | | R | 01/10/2026 | 001 | GHSM | 202.00 |

QBE Insurance (Singapore) Pte Ltd`

const SINGLIFE_PDF = `**NEW BUSINESS SCHEDULE**
* Policy No. : 3100001
* Policy Period : 27 Jul 2026 - 26 Jul 2027
* Date : 4 Aug 2026

### Insured Persons / Dependants List

| IC No. | Staff ID | Name of Insured Person / Name of Dependant | DOB (dd/mm/yyyy) | Rel. | Product | Effective Date (dd/mm/yyyy) | Term Date (dd/mm/yyyy) | Sum Assured / Plan | Premium | H & R Extra | Total Premium | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| SXXXX567A | | Ada Lim | 16/07/1987 | E | TCMYBPE | 27/07/2026 | | 100,000 | 408.00 | | 858.00 | 0 |
| TXXXX234C | | Ong Cai | 05/05/2020 | C | TCMYBPE | 27/07/2026 | | 100,000 | 150.00 | | | 0 |
| SXXXX321B | | Ong Ben | 19/12/1994 | E | TCMYBPE | 27/07/2026 | 30/09/2026 | 100,000 | 408.00 | | 408.00 | 0 |`

describe('member listing reader', () => {
  it('reads a client census from the ingest CSV text', () => {
    const r = readMemberListingText(CSV)!
    expect(r.layout).toBe('csv')
    expect(r.members.map(m => m.name)).toEqual(['Ada Lim', 'Ong, Ben', 'Ong Cai'])
    expect(r.employees).toBe(2); expect(r.dependants).toBe(1)
    const ada = r.members[0]
    expect(ada.relationship).toBe('employee'); expect(ada.dob).toBe('1987-07-16'); expect(ada.gender).toBe('F'); expect(ada.category).toBe('All Employees')
    expect(ada.id_masked).toBe('S****567A')
    expect(r.members[1].effective_from).toBe('2026-03-01')
    expect(r.members[2].relationship).toBe('child'); expect(r.members[2].id_masked).toBe('T****234C')
  })
  it('reads an insurer listing PDF with product lines under each member and sums the premium', () => {
    const r = readMemberListingText(QBE_PDF)!
    expect(r.layout).toBe('markdown')
    expect(r.policy_no).toContain('N0099999'); expect(r.period_start).toBe('2026-10-01'); expect(r.listing_date).toBe('2026-08-04')
    expect(r.members).toHaveLength(3)
    expect(r.members[0]).toMatchObject({ name: 'ADA LIM', relationship: 'employee', gender: 'F', annual_premium: 755, products: ['GHSM', 'GOP0'], employee_ref: '00001', movement: 'R', effective_from: '2026-10-01' })
    expect(r.members[2]).toMatchObject({ name: 'CAI ONG', relationship: 'child', employee_ref: '00002' })
    expect(r.employees).toBe(2); expect(r.premium_total).toBe(755 + 342 + 202)
  })
  it('reads a Singlife schedule: masked ids kept, E/C codes, term date, total premium preferred', () => {
    const r = readMemberListingText(SINGLIFE_PDF)!
    expect(r.members).toHaveLength(3)
    expect(r.members[0]).toMatchObject({ name: 'Ada Lim', relationship: 'employee', id_masked: 'SXXXX567A', dob: '1987-07-16', annual_premium: 858, plan_code: '100,000' })
    expect(r.members[1].relationship).toBe('child')
    expect(r.members[2].effective_to).toBe('2026-09-30')
    expect(r.period_start).toBe('2026-07-27')
  })
  it('reads workbook rows the same way and ignores a sheet with no name column', () => {
    const r = readMemberListingRows([{ name: 'Notes', rows: [['Prepared by', 'x']] }, { name: 'List', rows: [['Name', 'DOB', 'Relationship', 'Plan'], ['Ada Lim', new Date(Date.UTC(1987, 6, 16)), 'Employee', 'P1'], ['Ong Cai', '05/05/2020', 'Child', 'P1']] }])!
    expect(r.layout).toBe('sheet'); expect(r.members).toHaveLength(2); expect(r.members[0].dob).toBe('1987-07-16'); expect(r.members[0].plan_code).toBe('P1')
  })
  it('returns null for text with no member rows', () => {
    expect(readMemberListingText('Dear Sir, please find attached the list.')).toBeNull()
    expect(parseMemberRows([['Total premium', '1,000']])).toEqual([])
  })
  it('dates from 1900 and excel serials; ids masked once', () => {
    expect(listingDate('16/07/1987')).toBe('1987-07-16'); expect(listingDate('4 Aug 2026')).toBe('2026-08-04'); expect(listingDate('Jul 16, 1987')).toBe('1987-07-16'); expect(listingDate('31/02/2020')).toBeNull(); expect(listingDate('46234')).toBe('2026-07-31')
    expect(maskId('S1234567A')).toBe('S****567A'); expect(maskId('SXXXX567A')).toBe('SXXXX567A'); expect(maskId('-')).toBeNull()
    expect(relationshipOf('E')).toBe('employee'); expect(relationshipOf('Spouse')).toBe('spouse'); expect(relationshipOf('', '00001-02')).toBe('other'); expect(relationshipOf('', '00001-00')).toBe('employee')
  })
})

const pol = (o: Partial<EbPolicy>): EbPolicy => ({ id: 'p', company_id: 'c', policy_number: null, insurer: null, start_date: null, end_date: null, lifecycle: 'live', is_eb: true, class_of_insurance: null, product_line: null, label: null, ...o })
const doc = (o: Partial<MoneyDoc>): MoneyDoc => ({ id: 'd', company_id: 'c', policy_id: null, doc_type: 'member_list', filename: 'list.xlsx', received_at: '2026-08-05', email_attachment_id: 'a', thread_id: null, message_id: null, drive_url: null, policy_number: null, insurer_name: null, ...o })

describe('listing → policy', () => {
  const ghs = pol({ id: 'ghs', policy_number: 'GMB-N0099999-T00001', insurer: 'QBE Insurance (Singapore) Pte Ltd', start_date: '2026-10-01', class_of_insurance: 'Group Hospital & Surgical' })
  const gtl = pol({ id: 'gtl', policy_number: '3100001', insurer: 'Singapore Life Ltd', start_date: '2026-07-27', class_of_insurance: 'Group Term Life' })
  it('by the number in the text, then by the insurer named in the file name, then by the line words', () => {
    const q = readMemberListingText(QBE_PDF)!
    expect(matchListingPolicy(doc({}), q, [ghs, gtl])?.id).toBe('ghs')
    const c = readMemberListingText(CSV)!
    expect(matchListingPolicy(doc({ filename: 'Members listing - Singlife GTL & GCI.xlsx' }), c, [ghs, gtl])?.id).toBe('gtl')
    // A client's own list with no insurer named covers every live EB policy.
    expect(matchListingPolicy(doc({ filename: 'Employee List.xlsx' }), c, [ghs, gtl])).toBeNull()
    expect(matchListingPolicies(doc({ filename: 'Employee List.xlsx' }), c, [ghs, gtl]).map(p => p.id)).toEqual(['ghs', 'gtl'])
    // An insurer's listing naming a number not on file matches nothing.
    expect(matchListingPolicies(doc({ filename: 'listing.pdf' }), readMemberListingText(QBE_PDF)!, [gtl])).toEqual([])
    expect(matchListingPolicy(doc({ filename: 'Employee List.xlsx' }), c, [gtl])?.id).toBe('gtl')
    expect(matchListingPolicy(doc({ policy_id: 'ghs' }), c, [ghs, gtl])?.id).toBe('ghs')
  })
})

describe('policy from schedule', () => {
  const lite = (o: Partial<PolicyLite>): PolicyLite => ({ id: 'x', company_id: 'c', policy_number: null, insurer: null, start_date: null, end_date: null, premium: null, sum_insured: null, currency: null, product_line: null, class_of_insurance: null, ...o })
  const read = { policy_no: 'SD26F02212', insurer: 'Great Eastern General Insurance Ltd', period_start: '2026-03-01', period_end: '2027-02-28', currency: 'SGD', gross: { value: 1200, line: 'Gross premium 1,200.00' }, gst: null, total: null, sum_insured: null, excess: null, headcount: null, rate_per_head: null, wages: null, renewal_terms: false, confidence: 'high' as const }
  const sched = doc({ doc_type: 'policy_schedule', filename: 'schedule.pdf', class_of_insurance: 'Fire' })
  it('opens when nothing on file shares the number or the cover', () => {
    expect(policyToOpen(sched, read, [lite({ policy_number: 'A1234567' })])).toMatchObject({ number: 'SD26F02212', start: '2026-03-01', insurer: 'Great Eastern General Insurance Ltd', cls: 'Fire' })
  })
  it('never opens from an endorsement, a renewal invitation, a number already on file (even typed with a slip), or the same cover', () => {
    expect(policyToOpen({ ...sched, doc_type: 'endorsement' }, read, [])).toEqual({ reason: 'not_a_schedule' })
    expect(policyToOpen(sched, { ...read, renewal_terms: true }, [])).toEqual({ reason: 'renewal_invitation' })
    expect(policyToOpen(sched, read, [lite({ policy_number: 'SD26F02212/R01' })])).toEqual({ reason: 'number_on_file' })
    expect(policyToOpen(sched, read, [lite({ policy_number: 'SDL26F02212' })])).toEqual({ reason: 'number_on_file' })
    expect(policyToOpen(sched, read, [lite({ insurer: 'Great Eastern', start_date: '2026-03-01', class_of_insurance: 'fire' })])).toEqual({ reason: 'same_cover_on_file' })
    expect(policyToOpen(sched, { ...read, policy_no: null }, [])).toEqual({ reason: 'no_policy_number' })
  })
})
