/**
 * Insurer forms from a saved quotation, in each insurer's own layout, so the member list is never
 * retyped into the insurer's spreadsheet:
 *
 *   Income FlexCare     the BIX upload file (calculator sheet "Step3": two header rows, then one
 *                       row per life, record type "A - Addition", plans as "Plan n" / "Not Covered")
 *   RCC Enhanced III    the member enrolment listing (application form sheet "Enrolment Form")
 *
 * Plans come from the quotation's member lines, exactly as priced. Identity numbers, nationality,
 * email and bank details are not held by TRS; those columns are left for HR to complete, and the
 * file says so in its first row.
 */
import ExcelJS from 'exceljs'

export type FormMember = { name: string; relationship: string; dob: string | null; occupation_class?: string | null; work_pass?: string | null; gender?: string | null }
export type FormLine = { member_index: number; product_code: string; plan_code: string | null; premium: number | null }

const isDep = (r: string) => /spouse|child|dependa/i.test(r)
const dmy = (iso: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '')
const rel = (r: string) => (/spouse/i.test(r) ? 'Spouse' : /child/i.test(r) ? 'Child' : 'Employee')
const planNo = (code: string | null) => (code ? /plan\s*(\d+[AB]?)/i.exec(code)?.[1] ?? null : null)

const LIFE_OR_ACCIDENT = /term life|critical|accident|\(GTL\)|\(GCI\)|\(GPA\)|GADD|GACI/i

/** The plan a member holds on a product whose code matches `re`, as priced (premium not null).
 *  Dependants never hold term life, critical illness or accident cover, whatever an older quote
 *  priced for them. */
function held(lines: FormLine[], i: number, re: RegExp, dependant = false): string | null {
  const l = lines.find(x => x.member_index === i && re.test(x.product_code) && x.plan_code && x.premium != null && !(dependant && LIFE_OR_ACCIDENT.test(x.product_code)))
  return l?.plan_code ?? null
}

// ── Income ────────────────────────────────────────────────────────────────────────────────

const INCOME_HEAD_1 = ['Record Type*', 'Policy Number (not applicable)', 'Main Policyholder Name (can leave it blank)', 'Sub Entity Name (not applicable)', 'Full Name as per Identity card*', 'ID Type*', 'Type of Work Pass (Applicable for FIN/Passport/Other ID holders)', 'Identification  number*', 'Relationship with employer/ employee*', 'ID number of the parent  or spouse employed', 'Gender*', 'Date of birth*  (dd/mm/yyyy)', 'Employment Date (not applicable)', 'Effective Date (not applicable)', 'Last Day of Service / Cover (not applicable)', 'Nationality*', 'Country of Residence*', 'Email Address*', 'Occupation class*', 'Occupation description', 'Coverage for Medical (not applicable)', 'Products/Plan']
const INCOME_PRODUCTS: [string, RegExp, 'plan' | 'covered'][] = [
  ['Group Hospital & Surgical', /\(GHS\)/, 'plan'], ['Participation of Group Hospital & Surgical (Core/Voluntary) (not applicable)', /^$/, 'plan'],
  ['Dental (rider to GHS)', /\(GD\)/, 'plan'], ['Participation of Dental (Core/Voluntary) (not applicable)', /^$/, 'plan'],
  ['Primary Care (rider to GHS)', /\(GOPC\)/, 'plan'], ['Participation of Primary Care (Core/Voluntary) (not applicable)', /^$/, 'plan'],
  ['Specialist Care (rider to GP)', /\(GOSC\)/, 'plan'], ['Participation of Specialist Care (Core/Voluntary) (not applicable)', /^$/, 'plan'],
  ['Group Term Life', /\(GTL\)/, 'plan'], ['Participation of Group Term Life (Core/Voluntary) (not applicable)', /^$/, 'plan'], ['Last Accepted Sum Assured of Group Term Life (not applicable)', /^$/, 'plan'],
  ['Critical Illnesses', /\(GCI\)/, 'covered'], ['Participation of Critical Illnesses (Core/Voluntary) (not applicable)', /^$/, 'plan'], ['Last Accepted Sum Assured of Critical Illnesses (not applicable)', /^$/, 'plan'],
  ['Group Personal Accident', /\(GPA\)/, 'plan'], ['Participation of Group Personal Accident (Core/Voluntary) (not applicable)', /^$/, 'plan'], ['Last Accepted Sum Assured of Group Personal Accident (not applicable)', /^$/, 'plan'],
]

export function incomeUploadRows(members: FormMember[], lines: FormLine[]): (string | null)[][] {
  return members.map((m, i) => {
    const base: (string | null)[] = [
      'A - Addition', null, null, null, m.name, null, m.work_pass ?? null, null, rel(m.relationship), null,
      m.gender === 'M' ? 'Male' : m.gender === 'F' ? 'Female' : null, dmy(m.dob), null, null, null, null, null, null,
      isDep(m.relationship) ? null : `Class ${m.occupation_class ?? '1'}`, null, null,
    ]
    const products = INCOME_PRODUCTS.map(([, re, kind]) => {
      if (re.source === '^$') return null
      const plan = held(lines, i, re, isDep(m.relationship))
      if (kind === 'covered') return plan ? 'Covered' : 'Not Covered'
      return plan ? `Plan ${planNo(plan)}` : 'Not Covered'
    })
    return [...base, ...products]
  })
}

// ── RCC ───────────────────────────────────────────────────────────────────────────────────

const RCC_COVERS: [string, RegExp][] = [
  ['GHS', /^Hospital & Surgical$/], ['GMM', /^Major Medical$/], ['GOC (GP)', /^Outpatient GP$/], ['GOS (Specialist)', /^Outpatient Specialist$/],
  ['GDT (Dental)', /^Dental$/], ['GTL', /^Term Life$/], ['GCI (Accelerated)', /^Critical Illness$/], ['GCI (Additional)', /^$/], ['GPA', /^Personal Accident$/],
]
const RCC_HEAD = ['S/N', ...RCC_COVERS.map(c => c[0]), 'Coverage Effective Date', "Insured's Identity No. (as per NRIC/FIN)", 'Type of ID', 'Name of Insured (as per NRIC/FIN)', 'Date of Birth', 'Gender', 'Nationality', 'Country of Residence', 'Relationship', "Employee's Identity No. (as per NRIC/FIN)", 'Name of Employee', 'Name of Entity / Subsidiary', 'Date of Employment', 'Occupational Class (only applicable for GPA)', 'Corporate Email Address', 'Mobile Number (for OTP use)', 'Bank Code', 'Branch Code', 'Bank Account Number']

export function rccEnrolmentRows(members: FormMember[], lines: FormLine[], effectiveDate: string | null, company: string): (string | number | null)[][] {
  let employee = ''
  return members.map((m, i) => {
    if (!isDep(m.relationship)) employee = m.name
    const plans = RCC_COVERS.map(([, re]) => {
      if (re.source === '^$') return 'NA'
      const p = held(lines, i, re, isDep(m.relationship))
      // RCC's own dropdowns read "Plan 1", "Plan 2a", "Plan 2b".
      return p ? `Plan ${(planNo(p) ?? '').toLowerCase()}` : 'NA'
    })
    return [i + 1, ...plans, dmy(effectiveDate), null, null, m.name, dmy(m.dob), m.gender === 'M' ? 'Male' : m.gender === 'F' ? 'Female' : null, null, null, rel(m.relationship), null, employee, company, null,
      isDep(m.relationship) ? null : `Class ${m.occupation_class ?? '1'}`, null, null, null, null, null]
  })
}

const NOTE = 'Prepared by Trade Risk Solutions from the quotation. Identity numbers, nationality, country of residence and contact details are not held by TRS: HR completes those columns before the file goes to the insurer.'

export async function incomeUploadXlsx(members: FormMember[], lines: FormLine[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Step3')
  ws.addRow([...INCOME_HEAD_1, ...Array(INCOME_PRODUCTS.length - 1).fill(null)])
  ws.addRow([...Array(INCOME_HEAD_1.length - 1).fill(null), ...INCOME_PRODUCTS.map(p => p[0])])
  for (const r of incomeUploadRows(members, lines)) ws.addRow(r)
  ws.getRow(1).font = { bold: true }; ws.getRow(2).font = { bold: true }
  ws.columns.forEach(c => { c.width = 18 })
  const notes = wb.addWorksheet('Read me')
  notes.addRow([NOTE]); notes.addRow(['Paste the rows of Step3 into Income\'s BIX upload template as values.'])
  return Buffer.from(await wb.xlsx.writeBuffer())
}

export async function rccEnrolmentXlsx(members: FormMember[], lines: FormLine[], effectiveDate: string | null, company: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Enrolment Form')
  ws.addRow([NOTE])
  ws.addRow(['RAFFLES CORPORATE CARE MEMBER ENROLMENT LISTING'])
  ws.addRow(RCC_HEAD)
  ws.getRow(3).font = { bold: true }
  for (const r of rccEnrolmentRows(members, lines, effectiveDate, company)) ws.addRow(r)
  ws.columns.forEach(c => { c.width = 16 })
  return Buffer.from(await wb.xlsx.writeBuffer())
}
