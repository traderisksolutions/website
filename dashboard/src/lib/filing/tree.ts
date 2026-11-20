/**
 * Where a filed document lives in Drive (Jarod, 20 Nov 2026: one tree for every line):
 *
 *   <root>/<Group>/<Line>/<Plan year · Insurer>/<Census|Policy|Billing|Quotes|Claims|Other>/<file>
 *   <root>/<Group>/To sort/<file>          no policy yet
 *   <root>/<Group>/Letters/<file>          a letter of appointment with no policy
 *
 * <Group> is the top of the client's group (documents/drive.ts groupFolderName). <Line> is the fixed
 * list (renewals/lines.ts): the policy's confirmed line_code, else the line its class of insurance
 * names. The plan year is the policy's start year: 2027–28. Pure, so the dialog shows the same path
 * the server writes.
 */
import { docLabel } from '@/lib/documents/taxonomy'
import { isLineCode, lineName, lineOfPolicy, type LineCode } from '@/lib/renewals/lines'

export const FILING_FOLDERS = ['Census', 'Policy', 'Billing', 'Quotes', 'Claims', 'Other'] as const
export type FilingFolder = typeof FILING_FOLDERS[number]

const FOLDER_OF: Record<string, FilingFolder> = {
  member_list: 'Census', member_movement: 'Census',
  policy_schedule: 'Policy', policy_wording: 'Policy', cover_note: 'Policy', endorsement: 'Policy', certificate: 'Policy',
  benefit_summary: 'Policy', bond: 'Policy', renewal_notice: 'Policy', broker_appointment: 'Policy',
  credit_note: 'Billing', trs_debit_note: 'Billing', insurer_debit_note: 'Billing', payment_advice: 'Billing',
  quotation: 'Quotes', proposal_form: 'Quotes', claims_history: 'Quotes', contract_requirements: 'Quotes',
  company_documents: 'Quotes', survey: 'Quotes',
  claim: 'Claims',
}

export const folderForType = (docType: string | null | undefined): FilingFolder => FOLDER_OF[docType ?? ''] ?? 'Other'

/** A Drive folder name: no slashes or reserved characters ("Property / Fire / IAR" → "Property, Fire, IAR"). */
export const folderSafe = (s: string): string =>
  s.replace(/\s*[\\/]\s*/g, ', ').replace(/[:*?"<>|#%]+/g, ' ').replace(/\s+/g, ' ').trim()

/** "2027–28" from a start date, or null. */
export function planYearOf(startDate: string | null | undefined): string | null {
  const m = /^(\d{4})-\d{2}-\d{2}/.exec(startDate ?? '')
  if (!m) return null
  const y = Number(m[1])
  return `${y}–${String((y + 1) % 100).padStart(2, '0')}`
}

export type FilingPolicy = {
  line_code?: string | null; is_eb?: boolean | null; class_of_insurance?: string | null; product_line?: string | null
  insurer?: string | null; start_date?: string | null
}

/** The policy's line: confirmed, else by its class of insurance. */
export const lineOfFiling = (p: FilingPolicy): LineCode =>
  isLineCode(p.line_code) ? p.line_code : lineOfPolicy({ is_eb: !!p.is_eb, class_of_insurance: p.class_of_insurance ?? null, product_line: p.product_line ?? null })

/** Insurer brands as brokers say them; one folder per insurer however the policy spells it. */
const BRANDS: [RegExp, string][] = [
  [/^qbe\b/i, 'QBE'], [/^aia\b/i, 'AIA'], [/^income\b|^ntuc income/i, 'Income'], [/singapore life|singlife/i, 'Singlife'],
  [/^chubb\b/i, 'Chubb'], [/^allianz\b/i, 'Allianz'], [/^liberty\b/i, 'Liberty'], [/^great eastern\b/i, 'Great Eastern'],
  [/^msig\b/i, 'MSIG'], [/^eq\b/i, 'EQ Insurance'], [/^zurich\b/i, 'Zurich'], [/cigna/i, 'Cigna'], [/^tokio marine\b/i, 'Tokio Marine'],
  [/^axa\b/i, 'AXA'], [/^hl assurance\b/i, 'HL Assurance'], [/^etiqa\b/i, 'Etiqa'], [/^sompo\b/i, 'Sompo'], [/^aig\b/i, 'AIG'],
  [/raffles/i, 'Raffles Health'], [/^india international\b/i, 'India International'], [/^lonpac\b/i, 'Lonpac'],
]

/** "QBE Insurance (Singapore) Pte Ltd", "Qbe Insurance" → "QBE"; a Malaysian entity keeps "Malaysia". */
export function insurerFolder(name: string | null | undefined): string {
  const raw = (name ?? '').trim()
  if (!raw) return ''
  const malaysia = /malaysia/i.test(raw)
  for (const [re, brand] of BRANDS) if (re.test(raw)) return malaysia ? `${brand} Malaysia` : brand
  const short = raw.replace(/\s*\((?:singapore|s|malaysia)\)\s*/gi, ' ')
    .replace(/[,.]?\s*(pte\.?\s*ltd\.?|private limited|limited|ltd\.?|company|co\.|berhad|bhd\.?)\b\.?/gi, ' ')
    .replace(/\b(singapore|malaysia)\b/gi, ' ').replace(/\s{2,}/g, ' ').trim() || raw
  const titled = short === short.toUpperCase() && short.length > 4 ? short.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : short
  return folderSafe(malaysia ? `${titled} Malaysia` : titled)
}

export function yearFolderName(planYear: string | null, insurer: string | null | undefined): string {
  const who = insurerFolder(insurer)
  return [planYear, who].filter(Boolean).join(' · ') || 'No plan year'
}

/** The folders under the root, top first. */
export function filingPath(t: { group: string; policy: FilingPolicy | null; docType: string }): string[] {
  const group = folderSafe(t.group) || 'Unnamed company'
  if (!t.policy) return [group, t.docType === 'broker_appointment' ? 'Letters' : 'To sort']
  return [group, folderSafe(lineName(lineOfFiling(t.policy)) ?? 'Other'), yearFolderName(planYearOf(t.policy.start_date), t.policy.insurer), folderForType(t.docType)]
}

/** "Brightwell Group / Employment Benefits / 2027–28 · QBE / Policy /" */
export const pathLabel = (segments: readonly string[]): string => `${segments.join(' / ')} /`

export { docLabel }
