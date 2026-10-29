/**
 * Member movements as the insurer asks for them, so a broker never re-keys a client's list:
 *
 *   QBE           Employee Member Form (EMF, sheet "MBRIPF"): action A / D / C per row
 *   Great Eastern foreign worker medical (FWMI): name, date of birth, gender, FIN, nationality
 *   Income        BIX upload rows: record type "A - Addition" / "D - Deletion"
 *   anyone else   one general sheet with every field insurers have asked for
 *
 * TRS does not keep identity numbers, nationality or bank details (PDPA). Those columns are left
 * for the insurer to read from the client's own file, which goes on the same email; the sheet says
 * so in its first row. Pure apart from the ExcelJS write.
 */
import ExcelJS from 'exceljs'

export type SheetFormat = 'qbe_emf' | 'ge_fwmi' | 'income_bix' | 'general'

export type SheetMovement = {
  kind: 'join' | 'leave' | 'change'
  member_name: string
  relationship: string | null
  dob: string | null
  gender: string | null
  category: string | null
  plan_code: string | null
  /** Joiner: first day of cover. Leaver: first day without cover. */
  effective_on: string | null
  /** Leaver: last day of service, when the client gave it. */
  last_day?: string | null
  employment_date?: string | null
  /** The employee a dependant belongs to. */
  employee_name?: string | null
}

export function sheetFormatFor(insurer: string | null | undefined, policyNumber?: string | null): SheetFormat {
  const s = `${insurer ?? ''} ${policyNumber ?? ''}`.toLowerCase()
  if (/\bqbe\b/.test(s)) return 'qbe_emf'
  if (/great eastern/.test(s) && /hfw|fwmi|foreign/.test(s)) return 'ge_fwmi'
  if (/\bincome\b|ntuc/.test(s)) return 'income_bix'
  return 'general'
}

const dmy = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '')
const gender = (g: string | null) => (/^m/i.test(g ?? '') ? 'M' : /^f/i.test(g ?? '') ? 'F' : '')
const relCode = (r: string | null) => (/spouse/i.test(r ?? '') ? 'S' : /child/i.test(r ?? '') ? 'C' : 'M')
const relWord = (r: string | null) => (/spouse/i.test(r ?? '') ? 'Spouse' : /child/i.test(r ?? '') ? 'Child' : 'Employee')
const action = (k: SheetMovement['kind']) => (k === 'join' ? 'A' : k === 'leave' ? 'D' : 'C')
const lastDay = (m: SheetMovement) => m.last_day ?? (m.kind === 'leave' && m.effective_on ? dayBefore(m.effective_on) : null)
function dayBefore(iso: string) { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10) }

export const SHEET_NOTE = 'Prepared by Trade Risk Solutions from the client\'s movement list. Identity numbers, nationality and bank details are not held by TRS: please read them from the client\'s file attached to the same email.'

export type Sheet = { name: string; head: string[]; rows: (string | number | null)[][] }

export function movementSheet(format: SheetFormat, ms: SheetMovement[], policyNumber: string | null, company: string): Sheet {
  switch (format) {
    case 'qbe_emf':
      return {
        name: 'MBRIPF',
        head: ['Action Code (A/D/C)', 'Policy No.', 'Subsidiary', 'Name (as in NRIC/Passport)', 'Relationship (M/S/C)', 'Gender', 'NRIC/FIN/Passport No.', "Employee's NRIC/FIN (for dependants)", 'Nationality', 'Country of Residence', 'Date of Birth', 'Date of Employment', 'Effective Date', 'Plan No.', 'Last Day of Service', 'Email', 'Bank Code', 'Branch Code', 'Account No.'],
        rows: ms.map(m => [action(m.kind), policyNumber, company, m.member_name, relCode(m.relationship), gender(m.gender), null, null, null, null, dmy(m.dob), dmy(m.employment_date), dmy(m.effective_on), m.plan_code, m.kind === 'leave' ? dmy(lastDay(m)) : null, null, null, null, null]),
      }
    case 'ge_fwmi':
      return {
        name: 'Movement',
        head: ['Addition / Deletion', 'Policy No.', 'Name of Worker', 'Date of Birth', 'Gender', 'FIN / Work Permit No.', 'Nationality', 'Effective Date', 'Last Day of Employment'],
        rows: ms.map(m => [m.kind === 'join' ? 'Addition' : m.kind === 'leave' ? 'Deletion' : 'Change', policyNumber, m.member_name, dmy(m.dob), gender(m.gender), null, null, dmy(m.effective_on), m.kind === 'leave' ? dmy(lastDay(m)) : null]),
      }
    case 'income_bix':
      return {
        name: 'Step3',
        head: ['Record Type*', 'Policy Number', 'Main Policyholder Name', 'Full Name as per Identity card*', 'ID Type*', 'Identification number*', 'Relationship with employer/ employee*', 'ID number of the parent or spouse employed', 'Gender*', 'Date of birth* (dd/mm/yyyy)', 'Effective Date', 'Last Day of Service / Cover', 'Plan'],
        rows: ms.map(m => [m.kind === 'join' ? 'A - Addition' : m.kind === 'leave' ? 'D - Deletion' : 'C - Change', policyNumber, company, m.member_name, null, null, relWord(m.relationship), null, gender(m.gender) === 'M' ? 'Male' : gender(m.gender) === 'F' ? 'Female' : null, dmy(m.dob), dmy(m.effective_on), m.kind === 'leave' ? dmy(lastDay(m)) : null, m.plan_code]),
      }
    default:
      return {
        name: 'Member movements',
        head: ['Action', 'Policy No.', 'Company', 'Name', 'Relationship', 'Employee (for dependants)', 'Gender', 'Date of Birth', 'Category', 'Plan', 'Date of Employment', 'Effective Date', 'Last Day of Service', 'NRIC/FIN', 'Nationality'],
        rows: ms.map(m => [m.kind === 'join' ? 'Addition' : m.kind === 'leave' ? 'Deletion' : 'Change', policyNumber, company, m.member_name, relWord(m.relationship), m.employee_name ?? null, gender(m.gender), dmy(m.dob), m.category, m.plan_code, dmy(m.employment_date), dmy(m.effective_on), m.kind === 'leave' ? dmy(lastDay(m)) : null, null, null]),
      }
  }
}

export async function movementSheetXlsx(format: SheetFormat, ms: SheetMovement[], policyNumber: string | null, company: string): Promise<Buffer> {
  const sheet = movementSheet(format, ms, policyNumber, company)
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(sheet.name)
  ws.addRow([SHEET_NOTE])
  ws.addRow(sheet.head)
  ws.getRow(2).font = { bold: true }
  for (const r of sheet.rows) ws.addRow(r)
  ws.columns.forEach(c => { c.width = 18 })
  return Buffer.from(await wb.xlsx.writeBuffer())
}

/** TRS's subject line for a movement request, as brokers write it today. */
export function movementSubject(insurerShort: string, company: string, policyNumber: string | null, counts: { joins: number; leaves: number; changes: number }): string {
  const parts = [counts.joins ? `${counts.joins} addition${counts.joins === 1 ? '' : 's'}` : null, counts.leaves ? `${counts.leaves} deletion${counts.leaves === 1 ? '' : 's'}` : null, counts.changes ? `${counts.changes} change${counts.changes === 1 ? '' : 's'}` : null].filter(Boolean).join(', ')
  return `TRS (${insurerShort}) : ${company}${policyNumber ? ` Policy No: ${policyNumber}` : ''} - Member movement${parts ? ` (${parts})` : ''}`
}
