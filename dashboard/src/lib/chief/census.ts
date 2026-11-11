/**
 * Does a spreadsheet read as a member list? The sheet text (src/lib/xlsx-text.ts) is CSV-like,
 * one "Sheet: <name>" block per tab. A census has a header row naming people and their birth
 * dates, then rows with a name and a date. Insurer templates pad to 50 or 80 numbered blank rows,
 * which count for nothing.
 *
 * censusMembers reads the rows themselves, so a census never depends on a model echoing fifty
 * names back (a 50-member file hit the model's output cap on 10 Nov 2026 and read as nothing).
 *
 * Pure. Tested in src/__tests__/census-signal.test.ts.
 */
export type CensusSheet = { name: string; company: string | null; insurer: string | null; rows: number }
export type CensusSignal = { rows: number; sheets: CensusSheet[] }

const HEADER_WORDS: RegExp[] = [/\bname\b/i, /\b(date of birth|dob|birth)\b/i, /\b(gender|sex)\b/i, /\b(staff|employee|dependa?nt|relationship|member)\b/i, /\b(plan|category|class|entitlement)\b/i, /\bage\b/i, /\bnric\b|\bfin\b|\bpassport\b/i]
const DATE = /\b(?:19|20)\d{2}-\d{2}-\d{2}\b|\b\d{1,2}[/.-]\d{1,2}[/.-](?:19|20)?\d{2}\b/
const AGE_ONLY = /^\s*\d{1,2}\s*$/

export const SHEET_MIME = /spreadsheet|ms-excel|\bcsv\b/i
export const isSheetFile = (filename: string, mime: string | null | undefined) => SHEET_MIME.test(mime ?? '') || /\.(xlsx?|xlsm|csv)$/i.test(filename)

/** CSV cells: a quoted cell may hold a comma ("Yong Khai Si, Kay"). */
function cells(line: string): string[] {
  const out: string[] = []
  let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++ } else q = !q }
    else if (ch === ',' && !q) { out.push(cur.trim()); cur = '' }
    else cur += ch
  }
  out.push(cur.trim())
  return out
}
const after = (text: string, label: RegExp) => { const m = text.match(label); return m ? m[1].replace(/[,]+$/, '').trim() || null : null }

/** The member rows of one sheet block, or 0 when it has no census header. */
function sheetRows(block: string): number {
  const lines = block.split('\n')
  const h = lines.findIndex(l => HEADER_WORDS.filter(re => re.test(l)).length >= 3 && cells(l).filter(Boolean).length >= 3)
  if (h < 0) return 0
  const header = cells(lines[h]).map(c => c.toLowerCase())
  const nameCol = header.findIndex(c => /name/.test(c) && !/company/.test(c))
  const dateCol = header.findIndex(c => /birth|dob/.test(c))
  const ageCol = header.findIndex(c => /^age\b/.test(c))
  let rows = 0
  for (const line of lines.slice(h + 1)) {
    const c = cells(line)
    if (c.every(x => !x)) continue
    const name = nameCol >= 0 ? c[nameCol] : c.find(x => /[a-z]{2,}\s+[a-z]{2,}/i.test(x))
    if (!name || !/[a-z]{2}/i.test(name)) continue
    const dated = (dateCol >= 0 && DATE.test(c[dateCol] ?? '')) || (ageCol >= 0 && AGE_ONLY.test(c[ageCol] ?? '')) || DATE.test(line)
    if (dated) rows++
  }
  return rows
}

/** Null when the text is not a member list. */
export function censusSignal(text: string | null | undefined): CensusSignal | null {
  if (!text) return null
  const blocks = text.split(/^Sheet:\s*/m).filter(b => b.trim())
  const sheets: CensusSheet[] = []
  for (const b of blocks) {
    const nl = b.indexOf('\n')
    const name = (nl >= 0 ? b.slice(0, nl) : b).trim()
    const rows = sheetRows(b)
    if (!rows) continue
    sheets.push({ name, rows, company: after(b, /name of (?:the )?company\s*:\s*([^\n]+?)(?:,|$)/im), insurer: after(b, /(?:existing|current) insurer\s*,?\s*:?\s*([^\n,]+)/im) })
  }
  const rows = sheets.reduce((n, s) => n + s.rows, 0)
  return rows ? { rows, sheets } : null
}

export type CensusMember = { name: string; category: string; relationship: 'self' | 'spouse' | 'child'; dob: string | null; age: number | null; occupation_class: string | null }

/** Whole years from a date read day-first or ISO to today, by code; null when unreadable. */
function ageFrom(raw: string): number | null {
  const m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/) ?? raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/)?.slice().reverse()
  if (!m) return null
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3])
  if (!y || !mo || !d) return null
  const t = new Date(); let a = t.getFullYear() - y
  if (t.getMonth() + 1 < mo || (t.getMonth() + 1 === mo && t.getDate() < d)) a -= 1
  return a
}
export type CensusRead = { members: CensusMember[]; company: string | null; insurer: string | null; others: { company: string | null; rows: number }[] }

const REL_SPOUSE = /\b(spouse|wife|husband|partner)\b/i
const REL_CHILD = /\b(child|children|son|daughter|kid|dependa?nt)\b/i

function sheetMembers(block: string): CensusMember[] {
  const lines = block.split('\n')
  const h = lines.findIndex(l => HEADER_WORDS.filter(re => re.test(l)).length >= 3 && cells(l).filter(Boolean).length >= 3)
  if (h < 0) return []
  const header = cells(lines[h]).map(c => c.toLowerCase())
  const col = (re: RegExp, not?: RegExp) => header.findIndex(c => re.test(c) && !(not && not.test(c)))
  const nameCol = col(/name/, /company|nationality|national/), dateCol = col(/birth|dob/), ageCol = col(/^age\b/)
  const relCol = col(/staff|employee|dependa?nt|relationship|member type/), catCol = col(/plan|category|grade|class|entitlement|job level|level|designation/, /occupation|employment/)
  const occCol = col(/occupation/)
  // A sheet with no name column numbers its people (S/N); a dependant carries the employee's number
  // with a D (OUE: "3", "3D", "3D"). Nothing else in the row is a name: a nationality is not one.
  const snCol = nameCol >= 0 ? -1 : col(/^s\/?n\.?$|^no\.?$|^#$|^serial/)
  const out: CensusMember[] = []
  let lastCategory = 'Default', depCount = 0, lastSn = ''
  for (const line of lines.slice(h + 1)) {
    const c = cells(line)
    if (c.every(x => !x)) continue
    const sn = snCol >= 0 ? (c[snCol] ?? '').trim() : ''
    const name = nameCol >= 0 ? c[nameCol] : sn ? `Member ${sn.replace(/\s*d$/i, '')}${/d$/i.test(sn) ? ` · dependant ${++depCount}` : ''}` : undefined
    if (!name || !/[a-z0-9]{2}/i.test(name)) continue
    if (sn && !/d$/i.test(sn) && sn !== lastSn) { depCount = 0; lastSn = sn }
    const dobRaw = dateCol >= 0 ? c[dateCol] ?? '' : (line.match(DATE)?.[0] ?? '')
    const ageRaw = ageCol >= 0 ? c[ageCol] ?? '' : ''
    if (!DATE.test(dobRaw) && !AGE_ONLY.test(ageRaw)) continue
    const rel = relCol >= 0 ? c[relCol] ?? '' : ''
    const age = AGE_ONLY.test(ageRaw) ? Number(ageRaw) : DATE.test(dobRaw) ? ageFrom(dobRaw.match(DATE)![0]) : null
    const bySn = !rel && /d$/i.test(sn) ? (age != null && age <= 25 ? 'child' : 'spouse') : null
    const relationship: CensusMember['relationship'] = REL_SPOUSE.test(rel) ? 'spouse' : REL_CHILD.test(rel) ? 'child' : bySn ?? 'self'
    let category = (catCol >= 0 && c[catCol]) || ''
    if (relationship === 'self') { if (category) lastCategory = category; else category = lastCategory } else if (!category) category = lastCategory
    out.push({
      name, category: category || 'Default',
      relationship,
      dob: DATE.test(dobRaw) ? dobRaw.match(DATE)![0] : null,
      age: !DATE.test(dobRaw) && AGE_ONLY.test(ageRaw) ? Number(ageRaw) : null,
      occupation_class: occCol >= 0 && c[occCol] ? c[occCol] : null,
    })
  }
  return out
}

/**
 * The members of the file's main company: the sheets that name the first sheet's company (or name
 * none). Sheets for other companies are counted in `others`, not merged. Null when no sheet is a census.
 */
export function censusMembers(text: string | null | undefined): CensusRead | null {
  if (!text) return null
  const blocks = text.split(/^Sheet:\s*/m).filter(b => b.trim())
  const read = blocks.map(b => ({ members: sheetMembers(b), company: after(b, /name of (?:the )?company\s*:\s*([^\n]+?)(?:,|$)/im), insurer: after(b, /(?:existing|current) insurer\s*,?\s*:?\s*([^\n,]+)/im) })).filter(r => r.members.length)
  if (!read.length) return null
  const main = read[0].company
  const same = (c: string | null) => !c || !main || c.trim().toLowerCase() === main.trim().toLowerCase()
  const mine = read.filter(r => same(r.company))
  return {
    members: mine.flatMap(r => r.members), company: main, insurer: read.find(r => r.insurer)?.insurer ?? null,
    others: read.filter(r => !same(r.company)).map(r => ({ company: r.company, rows: r.members.length })),
  }
}

// ── The plans a census sheet carries ──────────────────────────────────────────────────────────────

import { parseCoPay, parseHospital, parseSum, parseWard } from '@/lib/gb/plan-rules'
import type { CoverKey, Requirement, Ward } from '@/lib/gb/ladder'

export type CensusPlans = { current: Partial<Requirement>; covers: CoverKey[]; sample: Record<string, string> }

const PLAN_COLS: { key: CoverKey; re: RegExp }[] = [
  { key: 'GHS', re: /hospital\s*&?\s*(and\s*)?surgical|^ghs\b|\bh&s\b/i },
  { key: 'EMM', re: /major medical|\bemm\b|\bgmm\b/i },
  { key: 'GOPC', re: /outpatient\s*gp|\bgp\b|primary care|\bgopc\b/i },
  { key: 'GOSC', re: /specialist|\bsp\b|\bgosc\b/i },
  { key: 'GD', re: /dental|\bgd\b/i },
  { key: 'GTL', re: /term life|\bgtl\b/i },
  { key: 'GCI', re: /critical illness|\bgci\b/i },
  { key: 'GPA', re: /personal accident|\bgpa\b|\bpa\b/i },
]

/**
 * TRS's own calculator sheet (and any census with a plan per cover) names the plan each member
 * holds in a column per cover. The first such group of columns is the current programme: a ward
 * and hospital type from the hospital plan's name ("Plan 5 (GRH 1-bed)" → government 1-bed), GP
 * co-payment from the GP plan ("Plan 1B ($10 co-pay)"), a cover present when most members have a
 * plan in its column. Null when the sheet has no plan columns. Pure.
 */
export function censusPlans(text: string | null | undefined): CensusPlans | null {
  if (!text) return null
  for (const block of text.split(/^Sheet:\s*/m)) {
    const lines = block.split('\n')
    const h = lines.findIndex(l => HEADER_WORDS.filter(re => re.test(l)).length >= 3 && cells(l).filter(Boolean).length >= 3)
    if (h < 0) continue
    const header = cells(lines[h])
    const cols = new Map<CoverKey, number>()
    header.forEach((c, i) => { for (const p of PLAN_COLS) if (!cols.has(p.key) && p.re.test(c) && !/age|birth|name|class|category/i.test(c)) cols.set(p.key, i) })
    if (!cols.has('GHS')) continue
    const members = sheetMembers(block)
    if (!members.length) continue
    // The commonest non-empty value per column across the member rows (employees only).
    const rows = lines.slice(h + 1).map(cells).filter(c => c.some(Boolean))
    const sample: Record<string, string> = {}
    const covers: CoverKey[] = []
    for (const [key, i] of cols) {
      const counts = new Map<string, number>()
      for (const r of rows) { const v = (r[i] ?? '').trim(); if (v && !/^(-|n\/?a|nil|none|no)$/i.test(v)) counts.set(v, (counts.get(v) ?? 0) + 1) }
      const top = [...counts].sort((a, b) => b[1] - a[1])[0]
      if (top && top[1] >= Math.max(1, Math.ceil(members.length / 2))) { sample[key] = top[0]; covers.push(key) }
    }
    if (!sample.GHS) continue
    const hosp = parseHospital(sample.GHS), bed = parseWard(sample.GHS)
    const ward = hosp || bed ? (`${hosp === 'government' ? 'G' : 'P'}${bed === 4 ? '4' : bed === 2 && hosp !== 'government' ? '2' : '1'}` as Ward) : undefined
    const gpCo = sample.GOPC ? parseCoPay(sample.GOPC) : null
    const current: Partial<Requirement> = {
      ...(ward ? { ward } : {}),
      gmm: !!sample.EMM,
      gp: sample.GOPC ? (gpCo ? 'copay' : 'nil') : null,
      sp: sample.GOSC ? 'entry' : null,
      dental: sample.GD ? 'entry' : null,
      gtl: sample.GTL ? parseSum(sample.GTL) ?? 100_000 : null,
      gci: sample.GCI ? parseSum(sample.GCI) ?? 50_000 : null,
      pa: sample.GPA ? parseSum(sample.GPA) ?? 100_000 : null,
      deps: members.some(m => m.relationship !== 'self') ? 'medical' : 'none',
    }
    return { current, covers, sample }
  }
  return null
}
