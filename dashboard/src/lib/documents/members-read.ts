/**
 * Reads a member listing into rows of members, without a model. Pure. Three sources:
 *   - the CSV text the ingest extracts from a client's census or movement workbook
 *     ("Sheet: MemberSheet" sections; header cells may span lines inside quotes);
 *   - the markdown tables the ingest extracts from an insurer's listing PDF (QBE member listing,
 *     Singlife insured persons list), where a blank-name row carries another product line of the
 *     member above it;
 *   - a workbook's own rows (read-xlsx.ts), for files whose text was never extracted.
 * A premium column per product ("GHS - $60k", "GTL - $50k Singlife") is summed into the member's
 * annual premium, the column headings kept as the products. Identity numbers are masked on the
 * way in (first character and last four kept): the register tells members apart, it does not
 * hold their NRIC.
 */
import { findInsurerName, findPeriod, findPolicyNoInText } from './money'

export type MemberRelationship = 'employee' | 'spouse' | 'child' | 'other'
export type MemberRead = {
  name: string
  relationship: MemberRelationship
  /** Groups a dependant with the employee: the employee number, staff id, member number stem or masked employee id. */
  employee_ref: string | null
  dob: string | null
  gender: string | null
  category: string | null
  plan_code: string | null
  id_masked: string | null
  effective_from: string | null
  effective_to: string | null
  annual_premium: number | null
  products: string[]
  /** An insurer listing's movement code: R renewal, A addition, D deletion, when stated. */
  movement: string | null
}
export type ListingRead = {
  members: MemberRead[]
  employees: number
  dependants: number
  premium_total: number | null
  policy_no: string | null
  insurer: string | null
  period_start: string | null
  period_end: string | null
  listing_date: string | null
  layout: 'csv' | 'markdown' | 'sheet'
}

type Col = 'name' | 'first_name' | 'last_name' | 'member_no' | 'employee_ref' | 'id' | 'dob' | 'age' | 'gender' | 'relationship' | 'category' | 'plan' | 'product' | 'premium' | 'total_premium' | 'effective' | 'term' | 'status' | 'movement' | 'employment'
const HEADERS: [Col, RegExp][] = [
  ['first_name', /^first name/i],
  ['last_name', /^(last name|surname|family name)/i],
  ['name', /^(name of (member|insured person|insured|employee|dependant|worker|staff)|name of insured person ?\/ ?name of dependant|insured person name|insured person'?s name|member name|employee name|full name|insured name|staff name|name as (in|per|shown)|name)\b/i],
  ['member_no', /^(member(ship)? no|member id|cert(ificate)? no)/i],
  ['employee_ref', /^(employee no|employee id|staff id|staff no|principal|employee'?s? (nric|fin|id))/i],
  ['id', /^(nric|fin|ic no|nric ?\/ ?fin|passport|identification|id no|work permit|dependent nric|nric\/passport|insured person nric)/i],
  ['dob', /(date of birth|\bdob\b|birth)/i],
  ['age', /^age/i],
  ['gender', /(gender|\bsex\b)/i],
  ['relationship', /^(rel\.?|relationship|relation|dependant type|dependent type|type of member|member type|family code|staff ?\/ ?dependant|dep(endant|endent)?)$/i],
  ['category', /^(category of (employee|staff)|category|cat\.?|occupation class|class|grade|band|job (title|category)|designation|occupation|job category ?\/ ?seniority)/i],
  ['plan', /^(plan( no| code| type)?|sum assured ?\/ ?plan|sum assured|benefit plan)$/i],
  ['product', /^(product|benefit|cover)$/i],
  ['total_premium', /^total premium/i],
  ['premium', /^premium/i],
  ['term', /(term date|termination|last day|date (of )?(resignation|cessation|leaving)|date left|end date|cease)/i],
  ['effective', /(effective|w\.?e\.?f|inception date|cover (start|from)|date of entry)/i],
  ['employment', /(hire date|date of (employment|joining|hire)|employment date|join(ing)? date|date joined|commencement)/i],
  ['status', /^status/i],
  ['movement', /^(movement( code)?|action|record type|a - addition)/i],
]
/** A per-product premium column, such as "GHS - $60k, 4 bed" or "GTL + GACI (without GST) Premium"; never a plan, date, amount-insured or age column. */
const PRODUCT_COL = /\b(ghs|ghsm|gp|sp|gpa|gtl|gci|gaci|tpd|gop|gsp|hospital|surgical|outpatient|dental|specialist|life|accident|critical|medical|premium)\b/i
const NOT_PREMIUM_COL = /plan|type|date|amt|amount|sum|cover|age|class|category|eff|name|dob|gender|ins\b/i
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 }

export const cell = (v: unknown): string => (v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v)).replace(/\s+/g, ' ').trim()

/** A date as written in a listing (day first, ISO, "16 Jul 1987", "Jul 16, 1987", an Excel serial), from 1900. */
export function listingDate(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10)
  const s = cell(v).toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, '$1')
  if (!s) return null
  if (/^\d{5}$/.test(s)) { const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86_400_000); return d.toISOString().slice(0, 10) }
  let y = 0, m = 0, d = 0, r: RegExpExecArray | null
  if ((r = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) { y = +r[1]; m = +r[2]; d = +r[3] }
  else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(s))) { d = +r[1]; m = +r[2]; y = +r[3] }
  else if ((r = /^(\d{1,2})[ -]([a-z]{3,9})\.?,?[ -](\d{2,4})/.exec(s)) && MONTHS[r[2].slice(0, 3)]) { d = +r[1]; m = MONTHS[r[2].slice(0, 3)]; y = +r[3] }
  else if ((r = /^([a-z]{3,9})\.? (\d{1,2}),? (\d{4})/.exec(s)) && MONTHS[r[1].slice(0, 3)]) { m = MONTHS[r[1].slice(0, 3)]; d = +r[2]; y = +r[3] }
  else return null
  if (y < 100) y += y < 30 ? 2000 : 1900
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1900 && y <= 2100)) return null
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso ? iso : null
}

/** "S1234567A" → "S****567A"; an already masked number ("SXXXX584E") is kept; blanks and dashes are null. */
export function maskId(v: unknown): string | null {
  const s = cell(v).toUpperCase().replace(/\s+/g, '')
  if (!s || /^[-–.n\/a]+$/i.test(s) || s.length < 5) return null
  if (/[X*]{3,}/.test(s)) return s
  return `${s[0]}${'*'.repeat(Math.max(1, s.length - 5))}${s.slice(-4)}`
}

export function relationshipOf(v: unknown, memberNo?: string | null): MemberRelationship {
  const s = cell(v).toLowerCase()
  if (/^(e|emp|employee|member|principal|staff|self|main|insured|all employees)$/.test(s) || /^(employee|staff)\b/.test(s)) return 'employee'
  if (/^(s|sp|spouse|wife|husband|partner)$/.test(s) || /spouse|wife|husband/.test(s)) return 'spouse'
  if (/^(c|ch|child|children|son|daughter|dependant child|kid)$/.test(s) || /child|\bson\b|daughter/.test(s)) return 'child'
  if (/depend|^d$/.test(s)) return 'other'
  if (!s && memberNo) return /-00$/.test(memberNo) ? 'employee' : 'other'
  return s ? 'other' : 'employee'
}

const money = (v: unknown): number | null => {
  const s = cell(v).replace(/[^0-9.()-]/g, '')
  if (!s || !/\d/.test(s)) return null
  const n = Number(s.replace(/[(),]/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

export type MemberHeader = { row: number; cols: Partial<Record<Col, number>>; premiumCols: { idx: number; label: string }[] }

/** Finds the header row: a name column plus two other known columns, within the first 40 rows. */
export function detectMemberHeader(rows: unknown[][]): MemberHeader | null {
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const cols: Partial<Record<Col, number>> = {}
    const premiumCols: { idx: number; label: string }[] = []
    ;(rows[r] ?? []).forEach((v, i) => {
      const raw = cell(v).replace(/[*_]/g, '').trim()
      const h = raw.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim()
      if (!h || h.length > 100) return
      for (const [col, re] of HEADERS) if (cols[col] == null && re.test(h)) { cols[col] = i; return }
      if (PRODUCT_COL.test(h) && (/premium/i.test(h) || !NOT_PREMIUM_COL.test(h))) premiumCols.push({ idx: i, label: h.slice(0, 40) })
    })
    const hasName = cols.name != null || (cols.first_name != null && cols.last_name != null)
    if (hasName && Object.keys(cols).length + premiumCols.length >= 3) return { row: r, cols, premiumCols }
  }
  return null
}

const END_ROW = /^(total|grand total|sub ?total|end of (list|report)|page \d|note[s:]|\*|remarks?:|prepared by)/i
const NOT_A_NAME = /^(name|total|nil|none|n\/a|-+|page \d|insured person name|employee name)/i

/** The members on rows of cells, header detected. Pure. */
export function parseMemberRows(rows: unknown[][]): MemberRead[] {
  const h = detectMemberHeader(rows)
  if (!h) return []
  const c = h.cols
  const at = (row: unknown[], col: Col) => (c[col] == null ? '' : cell(row[c[col]!]))
  const out: MemberRead[] = []
  for (let i = h.row + 1; i < rows.length; i++) {
    const row = rows[i] ?? []
    if (!row.some(v => cell(v))) continue
    const first = cell(row.find(v => cell(v)))
    if (END_ROW.test(first)) break
    const name = (c.name != null ? at(row, 'name') : `${at(row, 'first_name')} ${at(row, 'last_name')}`).replace(/\s*\(.*?\)\s*$/, '').replace(/\s+/g, ' ').trim()
    const product = at(row, 'product'), premiumCell = money(at(row, 'premium')), plan = at(row, 'plan')
    const perProduct = h.premiumCols.map(p => ({ label: p.label, value: money(row[p.idx]) })).filter(p => p.value != null && p.value > 0)
    if (!name || NOT_A_NAME.test(name) || !/[A-Za-z]{2}/.test(name)) {
      // An insurer listing's extra product line for the member above: add it, sum the premium.
      const prev = out[out.length - 1]
      if (prev && (product || premiumCell != null) && !name) {
        if (product && !prev.products.includes(product)) prev.products.push(product)
        if (premiumCell != null) prev.annual_premium = Math.round(((prev.annual_premium ?? 0) + premiumCell) * 100) / 100
      }
      continue
    }
    if (/^\d+$/.test(name)) continue
    const memberNo = at(row, 'member_no') || null
    const age = at(row, 'age')
    const gender = at(row, 'gender') || (/\/\s*([MF])\b/i.exec(age)?.[1] ?? '') || null
    const effective = listingDate(at(row, 'effective')) ?? listingDate(at(row, 'employment'))
    const term = listingDate(at(row, 'term'))
    const refCell = at(row, 'employee_ref')
    const employeeRef = (refCell && /^[A-Z]\d{7}[A-Z]$/i.test(refCell) ? maskId(refCell) : refCell) || (memberNo ? memberNo.replace(/-\d{2}$/, '') : '') || null
    const statusText = at(row, 'status').toLowerCase()
    const relationship = relationshipOf(at(row, 'relationship'), memberNo)
    // A census keeps the employee's NRIC in the employee column and a dependant's in its own; either is the row's identity.
    const idMasked = maskId(at(row, 'id')) ?? (relationship === 'employee' && /^[A-Z]\d{7}[A-Z]$/i.test(refCell) ? maskId(refCell) : null)
    const products = [...(product ? [product] : []), ...perProduct.map(p => p.label)]
    const premium = money(at(row, 'total_premium')) ?? (perProduct.length ? Math.round(perProduct.reduce((s, p) => s + p.value!, 0) * 100) / 100 : premiumCell)
    out.push({
      name: name.slice(0, 200),
      relationship,
      employee_ref: employeeRef,
      dob: listingDate(at(row, 'dob')),
      gender: gender && /^[mf]/i.test(gender) ? gender.slice(0, 1).toUpperCase() : null,
      category: at(row, 'category') || null,
      plan_code: plan || null,
      id_masked: idMasked,
      effective_from: effective,
      effective_to: term ?? (/^(terminated|left|deleted|cancelled)$/.test(statusText) ? listingDate(at(row, 'term')) : null),
      annual_premium: premium,
      products,
      movement: at(row, 'movement').toUpperCase().slice(0, 12) || null,
    })
  }
  return out
}

/** A real CSV parser (quotes, doubled quotes, newlines inside quotes); "Sheet: X" lines start a new section. */
export function csvRows(text: string): unknown[][][] {
  const sheets: unknown[][][] = []
  let cur: unknown[][] = [], row: string[] = [], f = '', q = false
  const endRow = () => {
    row.push(f); f = ''
    if (row.length === 1 && /^\s*Sheet:\s*/i.test(row[0])) { if (cur.length) sheets.push(cur); cur = [] }
    else if (row.some(x => x.trim())) cur.push(row)
    row = []
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++ } else q = false } else f += ch; continue }
    if (ch === '"') q = true
    else if (ch === ',') { row.push(f); f = '' }
    else if (ch === '\n') endRow()
    else if (ch !== '\r') f += ch
  }
  if (f || row.length) endRow()
  if (cur.length) sheets.push(cur)
  return sheets
}

/** The rows of every markdown table in extracted PDF text; separator rows dropped. */
export function markdownRows(text: string): unknown[][][] {
  const tables: unknown[][][] = []
  let cur: unknown[][] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.startsWith('|')) {
      if (/^\|?\s*:?-{2,}/.test(line.replace(/^\|/, ''))) continue
      cur.push(line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(x => x.trim()))
    } else if (cur.length) { tables.push(cur); cur = [] }
  }
  if (cur.length) tables.push(cur)
  return tables
}

function meta(text: string): Pick<ListingRead, 'policy_no' | 'insurer' | 'period_start' | 'period_end' | 'listing_date'> {
  const t = text.replace(/\*\*/g, '')
  const period = findPeriod(t)
  const dateM = /(?:date of issue|issue date|date|as (?:at|of))\s*[:：]?\s*(\d{1,2}[\/. -][A-Za-z0-9]{1,9}[\/. -]\d{2,4})/i.exec(t)
  return {
    policy_no: findPolicyNoInText(t), insurer: findInsurerName(t),
    period_start: period?.start ?? null, period_end: period?.end ?? null,
    listing_date: dateM ? listingDate(dateM[1]) : null,
  }
}

function summarise(members: MemberRead[], layout: ListingRead['layout'], m: ReturnType<typeof meta>): ListingRead {
  const employees = members.filter(x => x.relationship === 'employee').length
  const premiums = members.map(x => x.annual_premium).filter((x): x is number => x != null)
  return { members, employees, dependants: members.length - employees, premium_total: premiums.length ? Math.round(premiums.reduce((s, x) => s + x, 0) * 100) / 100 : null, layout, ...m }
}

/** A listing from the ingest's extracted text (CSV from a workbook, markdown tables from a PDF). Null when no member rows are found. */
export function readMemberListingText(text: string | null | undefined): ListingRead | null {
  if (!text || text.length < 40) return null
  const isCsv = /^\s*Sheet:/m.test(text) || (!/^\s*\|/m.test(text) && /,/.test(text.split('\n')[0] ?? ''))
  const groups = isCsv ? csvRows(text) : markdownRows(text)
  const members = groups.flatMap(rows => parseMemberRows(rows))
  if (!members.length) return null
  return summarise(dedupe(members), isCsv ? 'csv' : 'markdown', meta(text))
}

/** A listing from a workbook's own rows (read-xlsx.ts sheetRows). */
export function readMemberListingRows(sheets: { name: string; rows: unknown[][] }[], textForMeta = ''): ListingRead | null {
  const members = sheets.flatMap(s => parseMemberRows(s.rows))
  if (!members.length) return null
  return summarise(dedupe(members), 'sheet', meta(textForMeta))
}

/** The same person listed twice (one row per product, or on two sheets) is one member; premiums add up once. */
function dedupe(members: MemberRead[]): MemberRead[] {
  const seen = new Map<string, MemberRead>()
  for (const m of members) {
    const k = `${m.name.toLowerCase().replace(/[^a-z0-9]/g, '')}|${m.relationship}|${m.dob ?? ''}`
    const prev = seen.get(k)
    if (!prev) { seen.set(k, { ...m, products: [...m.products] }); continue }
    for (const p of m.products) if (!prev.products.includes(p)) { prev.products.push(p); if (m.annual_premium != null) prev.annual_premium = Math.round(((prev.annual_premium ?? 0) + m.annual_premium) * 100) / 100 }
    for (const f of ['dob', 'gender', 'category', 'plan_code', 'id_masked', 'effective_from', 'effective_to', 'employee_ref', 'movement'] as const) if (prev[f] == null && m[f] != null) (prev as Record<string, unknown>)[f] = m[f]
  }
  return Array.from(seen.values())
}
