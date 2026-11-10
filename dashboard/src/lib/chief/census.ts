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
export type CensusRead = { members: CensusMember[]; company: string | null; insurer: string | null; others: { company: string | null; rows: number }[] }

const REL_SPOUSE = /\b(spouse|wife|husband|partner)\b/i
const REL_CHILD = /\b(child|children|son|daughter|kid|dependa?nt)\b/i

function sheetMembers(block: string): CensusMember[] {
  const lines = block.split('\n')
  const h = lines.findIndex(l => HEADER_WORDS.filter(re => re.test(l)).length >= 3 && cells(l).filter(Boolean).length >= 3)
  if (h < 0) return []
  const header = cells(lines[h]).map(c => c.toLowerCase())
  const col = (re: RegExp, not?: RegExp) => header.findIndex(c => re.test(c) && !(not && not.test(c)))
  const nameCol = col(/name/, /company/), dateCol = col(/birth|dob/), ageCol = col(/^age\b/)
  const relCol = col(/staff|employee|dependa?nt|relationship|member type/), catCol = col(/plan|category|grade|class|entitlement/, /occupation/)
  const occCol = col(/occupation/)
  const out: CensusMember[] = []
  for (const line of lines.slice(h + 1)) {
    const c = cells(line)
    if (c.every(x => !x)) continue
    const name = nameCol >= 0 ? c[nameCol] : c.find(x => /[a-z]{2,}\s+[a-z]{2,}/i.test(x))
    if (!name || !/[a-z]{2}/i.test(name)) continue
    const dobRaw = dateCol >= 0 ? c[dateCol] ?? '' : (line.match(DATE)?.[0] ?? '')
    const ageRaw = ageCol >= 0 ? c[ageCol] ?? '' : ''
    if (!DATE.test(dobRaw) && !AGE_ONLY.test(ageRaw)) continue
    const rel = relCol >= 0 ? c[relCol] ?? '' : ''
    out.push({
      name, category: (catCol >= 0 && c[catCol]) || 'Default',
      relationship: REL_SPOUSE.test(rel) ? 'spouse' : REL_CHILD.test(rel) ? 'child' : 'self',
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
