/**
 * Insurer pricing schedules (Insurer pricing on /eb, Jarod 20 Nov 2026): one file per insurer, the
 * insurer's own premium for this census, read into premium per cover (and per category where the
 * file states one) and compared in Compare beside the brochure columns.
 *
 * Code reads first: a spreadsheet by header rules (covers across a header row, or down a label
 * column, with the premium column or one column per category); a PDF by its text (pdf-parse keeps
 * table cells apart with tabs), on pages that speak of premium, lines naming a cover with an amount.
 * A person's Read with AI is the fallback; its read passes through normaliseScheduleRead, which
 * bounds every figure and checks it against the file's text.
 *
 * Every figure keeps where it came from (file, sheet and cell, or page) and a status computed by
 * code, never the model's own word: read (one clear figure), check (two figures disagree, more
 * than one amount on the line, a total that does not add up, a model figure not found word for
 * word in the text), missing (a cover named with no premium).
 *
 * Pure. Tested in src/__tests__/gb-insurer-schedule.test.ts.
 */
import type { CoverKey } from './eb-quote'

/** The house product a name points to (as compare-cover's productOf; kept here so the page does not load the workbook code). */
const productOf = (name: string | null | undefined): string | null => {
  const s = String(name ?? '').toLowerCase()
  if (/\bqbe\b|steadfast|mcare/.test(s)) return 'Steadfast MCare+'
  if (/raffles|\brcc\b/.test(s)) return 'RCC Enhanced III'
  if (/\bincome\b|flexcare/.test(s)) return 'Income FlexCare'
  if (/singlife|singapore life|mybenefits/.test(s)) return 'Singlife MyBenefits Plus'
  if (/\baia\b|flexi vital/.test(s)) return 'AIA Flexi Vital Care Plus'
  return null
}

export type ScheduleStatus = 'read' | 'check' | 'missing'
export type ScheduleFigure = { cover: CoverKey; category: string | null; premium: number | null; source: string; status: ScheduleStatus }
export type InsurerSchedule = {
  file: string
  /** The insurer as read: a house product name where the file names one of the five, else the name found, else null. */
  insurer: string | null
  figures: ScheduleFigure[]
  total: { premium: number; source: string } | null
  readBy: 'code' | 'model'
  notes: string[]
}

const COVER_LABELS: [CoverKey, RegExp][] = [
  ['mm', /\b(gmm|emm|major\s*medical|supplementary\s*major)\b/i],
  ['sp', /\b(gosc|gsp|specialist)\b|^\s*sp\s*$/i],
  ['gp', /\b(gopc|ggp|clinical|general\s*practitioner|primary\s*care)\b|^\s*gp\s*$|\bout-?patient\s*\(?gp\b|\bgp\s*(visits?|outpatient|benefit|plan)\b/i],
  ['gd', /\b(gd|dental)\b/i],
  ['pa', /\b(gpa|personal\s*accident)\b/i],
  ['hs', /\b(ghs|ghsm|hospital(isation)?\s*(&|and)?\s*surgical|in-?patient|hospitali[sz]ation)\b/i],
]
const OTHER_COVER = /\b(gtl|term\s*life|gci|critical\s*illness|gaci|tpd|disability\s*income)\b/i
/** The cover a label names, or null. "Group Hospital & Surgical (GHS)" → hs. Pure. */
export function coverOfLabel(label: string): CoverKey | null {
  const s = String(label ?? '').trim()
  if (!s || s.length > 120) return null
  if (OTHER_COVER.test(s) && !/hospital|major|specialist|dental|accident|clinical/i.test(s)) return null
  return COVER_LABELS.find(([, re]) => re.test(s))?.[0] ?? null
}

const TOTAL = /^\s*(grand\s*)?total\b|\btotal\s*(annual\s*)?premium\b/i
const SKIP_HEAD = /\brate\b|per\s*(life|head|member|employee|person)|sum\s*(assured|insured)|\blives\b|no\.?\s*of|headcount|\bcount\b|\bage\b|\blimit\b|deductible|co-?pay|\bplan\b|benefit/i
const PREMIUM_HEAD = /premium|total|annual|amount|s\$|sgd|price|cost/i
const INCL_GST = /incl(usive|\.|uding)?\s*(of\s*)?gst|w\/\s*gst|with\s*gst|after\s*gst/i
const MAX = 5_000_000

const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v ?? '').trim()
  if (!/\d/.test(s) || /[a-z]{3,}/i.test(s.replace(/s\$|sgd|usd/gi, ''))) return null
  const n = Number(s.replace(/s\$|sgd|\$|,|\s/gi, ''))
  return Number.isFinite(n) ? n : null
}
const text = (v: unknown) => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim()
const colName = (c: number) => { let s = '', n = c + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) } return s }
const cellRef = (sheet: string, r: number, c: number) => `${sheet}!${colName(c)}${r + 1}`
const bounded = (n: number | null) => (n != null && n > 0 && n <= MAX ? Math.round(n * 100) / 100 : null)

/** The insurer a file names: one of the five house products first, else a known insurer's name. */
export function scheduleInsurer(fileName: string, body: string, known?: (t: string) => string | null): string | null {
  const house = productOf(fileName) ?? productOf(body.slice(0, 3000))
  if (house) return house
  return known?.(`${fileName}\n${body}`) ?? null
}

/** Marks disagreeing figures (same cover and category, different premium) to check, and a total that is not the sum of the covers. */
function settle(figures: ScheduleFigure[], total: InsurerSchedule['total'], notes: string[]): ScheduleFigure[] {
  const out: ScheduleFigure[] = []
  for (const f of figures) {
    const twin = out.find(o => o.cover === f.cover && o.category === f.category)
    if (!twin) { out.push(f); continue }
    if (twin.premium === f.premium || f.premium == null) continue
    if (twin.premium == null) { out[out.indexOf(twin)] = f; continue }
    twin.status = 'check'
    notes.push(`${f.cover.toUpperCase()}${f.category ? ` (${f.category})` : ''}: ${twin.premium} at ${twin.source}, ${f.premium} at ${f.source}`)
  }
  if (total) {
    const sum = out.reduce((a, f) => a + (f.premium ?? 0), 0)
    if (out.some(f => f.premium != null) && Math.abs(sum - total.premium) > 1 && sum < total.premium - 1) notes.push(`Covers add up to ${Math.round(sum)}; the stated total is ${Math.round(total.premium)} (other covers, GST or fees may be in it).`)
    else if (sum > total.premium + 1) { notes.push(`Covers add up to ${Math.round(sum)}, more than the stated total of ${Math.round(total.premium)}.`); for (const f of out) if (f.status === 'read') f.status = 'check' }
  }
  return out
}

type Sheet = { name: string; rows: unknown[][] }

/** Covers across a header row; a row per category (or one premium row) under it. */
function readAcross(file: string, s: Sheet): { figures: ScheduleFigure[]; total: InsurerSchedule['total'] } | null {
  for (let r = 0; r < Math.min(s.rows.length, 40); r++) {
    const row = s.rows[r] ?? []
    const covers = new Map<number, CoverKey>()
    row.forEach((v, c) => { const k = typeof v === 'string' ? coverOfLabel(v) : null; if (k && ![...covers.values()].includes(k)) covers.set(c, k) })
    if (covers.size < 2) continue
    const first = Math.min(...covers.keys())
    const totalCol = row.findIndex((v, c) => c > first && typeof v === 'string' && TOTAL.test(v))
    const figures: ScheduleFigure[] = []
    let total: InsurerSchedule['total'] = null, blank = 0
    for (let i = r + 1; i < s.rows.length && blank < 3; i++) {
      const cells = s.rows[i] ?? []
      const label = text(cells.slice(0, first).filter(v => typeof v === 'string' && text(v)).join(' '))
      const vals = [...covers].map(([c, k]) => ({ c, k, n: num(cells[c]) }))
      if (!vals.some(v => v.n != null) && !label) { blank++; continue }
      blank = 0
      if (!vals.some(v => v.n != null)) continue
      if (TOTAL.test(label)) {
        const t = totalCol >= 0 ? bounded(num(cells[totalCol])) : null
        if (t) total = { premium: t, source: `${file} · ${cellRef(s.name, i, totalCol)}` }
        continue
      }
      const category = label && !PREMIUM_HEAD.test(label) ? label.slice(0, 80) : null
      for (const v of vals) {
        const p = bounded(v.n)
        figures.push({ cover: v.k, category, premium: p, source: `${file} · ${cellRef(s.name, i, v.c)}`, status: p != null ? (cells[v.c] != null && INCL_GST.test(text(row[v.c])) ? 'check' : 'read') : 'missing' })
      }
      if (totalCol >= 0 && !total && !category) { const t = bounded(num(cells[totalCol])); if (t) total = { premium: t, source: `${file} · ${cellRef(s.name, i, totalCol)}` } }
    }
    if (figures.length) return { figures, total }
  }
  return null
}

/** Covers down a label column; the premium column, or one column per category. */
function readDown(file: string, s: Sheet): { figures: ScheduleFigure[]; total: InsurerSchedule['total'] } | null {
  const coverRows: { r: number; c: number; k: CoverKey }[] = []
  let totalRow: { r: number; c: number } | null = null
  s.rows.forEach((row, r) => {
    const c = (row ?? []).findIndex(v => typeof v === 'string' && (coverOfLabel(v) || TOTAL.test(v)))
    if (c < 0) return
    const k = coverOfLabel(String(row[c]))
    if (k) { if (!coverRows.some(x => x.k === k && x.r === r)) coverRows.push({ r, c, k }) }
    else if (!totalRow) totalRow = { r, c }
  })
  if (!coverRows.length) return null
  // Numeric columns to the right of the labels, on the cover rows.
  const cols = new Set<number>()
  for (const x of coverRows) (s.rows[x.r] ?? []).forEach((v, c) => { if (c > x.c && num(v) != null) cols.add(c) })
  if (!cols.size) return { figures: coverRows.map(x => ({ cover: x.k, category: null, premium: null, source: `${file} · ${cellRef(s.name, x.r, x.c)}`, status: 'missing' as const })), total: null }
  // The header of each column: the nearest text above the first cover row.
  const top = Math.min(...coverRows.map(x => x.r))
  const head = (c: number) => { for (let r = top - 1; r >= Math.max(0, top - 8); r--) { const t = text(s.rows[r]?.[c]); if (t && num(t) == null) return t } return '' }
  let use = [...cols].sort((a, b) => a - b).filter(c => !SKIP_HEAD.test(head(c)) || /premium/i.test(head(c)))
  if (!use.length) use = [Math.max(...cols)]
  const premiumCols = use.filter(c => PREMIUM_HEAD.test(head(c)))
  // One premium column (the one before GST where both are given), else a column per category.
  let perCategory = false
  if (premiumCols.length) use = [premiumCols.find(c => !INCL_GST.test(head(c))) ?? premiumCols[0]]
  else if (use.length > 1 && use.every(c => head(c))) perCategory = true
  else use = [use[use.length - 1]]
  const ambiguous = !perCategory && premiumCols.length > 1 && premiumCols.filter(c => !INCL_GST.test(head(c))).length > 1
  const figures: ScheduleFigure[] = []
  for (const x of coverRows) for (const c of use) {
    const p = bounded(num(s.rows[x.r]?.[c]))
    figures.push({ cover: x.k, category: perCategory ? head(c).slice(0, 80) : null, premium: p, source: `${file} · ${cellRef(s.name, x.r, c)}`, status: p == null ? 'missing' : ambiguous || INCL_GST.test(head(c)) ? 'check' : 'read' })
  }
  let total: InsurerSchedule['total'] = null
  if (totalRow && !perCategory) {
    const tr: { r: number; c: number } = totalRow
    const t = bounded(num(s.rows[tr.r]?.[use[0]]))
    if (t) total = { premium: t, source: `${file} · ${cellRef(s.name, tr.r, use[0])}` }
  }
  return { figures, total }
}

/** A spreadsheet schedule, every sheet tried; the first that reads wins. */
export function readScheduleSheets(file: string, sheets: Sheet[], insurer: string | null = null): InsurerSchedule {
  const notes: string[] = []
  for (const s of sheets) {
    const hit = readAcross(file, s) ?? readDown(file, s)
    if (hit?.figures.some(f => f.premium != null)) return { file, insurer, figures: settle(hit.figures, hit.total, notes), total: hit.total, readBy: 'code', notes }
  }
  return { file, insurer, figures: [], total: null, readBy: 'code', notes: ['No premium by cover was found in the file.'] }
}

const AMOUNT = /(?:S\$|SGD|\$)\s?\d[\d,]*(?:\.\d{1,2})?|\b\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?\b|\b\d+\.\d{2}\b/gi
const NOT_PREMIUM_LINE = /\blimit\b|per\s*(disability|visit|day|policy year|year)|co-?pay|co-?insurance|deductible|sum\s*(assured|insured)|\bbenefit\b|\bward\b|\bbed\b|\bmax(imum)?\b/i
/** A PDF schedule from its text, page by page (cells tab-separated, as pdf-parse writes them). */
export function readSchedulePdf(file: string, pages: { num: number; text: string }[], insurer: string | null = null): InsurerSchedule {
  const notes: string[] = []
  const figures: ScheduleFigure[] = []
  let total: InsurerSchedule['total'] = null
  for (const pg of pages) {
    if (!/premium/i.test(pg.text)) continue
    let category: string | null = null
    for (const raw of pg.text.split(/\n/)) {
      const line = raw.replace(/[  ]+/g, ' ').trim()
      if (!line) continue
      const amounts = [...line.matchAll(AMOUNT)].map(m => num(m[0])).filter((n): n is number => n != null)
      const cat = line.match(/^(?:category|cat\.?|class)\s*\d*\s*[:\-–]?\s*([^\t\d$][^\t]{1,60})$/i)
      if (cat && !amounts.length) { category = text(cat[1]); continue }
      const label = line.split('\t')[0]
      if (TOTAL.test(label) && amounts.length) { const t = bounded(amounts[amounts.length - 1]); if (t && !total) total = { premium: t, source: `${file} · page ${pg.num}` }; continue }
      const k = coverOfLabel(label) ?? (line.includes('\t') ? null : coverOfLabel(line.replace(AMOUNT, '')))
      if (!k || NOT_PREMIUM_LINE.test(line)) continue
      const p = bounded(amounts[amounts.length - 1] ?? null)
      figures.push({ cover: k, category, premium: p, source: `${file} · page ${pg.num}`, status: p == null ? 'missing' : amounts.length > 1 ? 'check' : 'read' })
    }
  }
  if (!figures.some(f => f.premium != null)) return { file, insurer, figures: [], total, readBy: 'code', notes: ['No premium by cover was found in the text. Use Read with AI.'] }
  return { file, insurer, figures: settle(figures, total, notes), total, readBy: 'code', notes }
}

const COVER_CODE: Record<string, CoverKey> = { ghs: 'hs', hs: 'hs', emm: 'mm', gmm: 'mm', mm: 'mm', gopc: 'gp', gp: 'gp', gosc: 'sp', sp: 'sp', gd: 'gd', dental: 'gd', gpa: 'pa', pa: 'pa' }
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9.]/g, '')
/**
 * A model's read of a schedule, bounded: known covers only, premiums as numbers within S$5m, at
 * most 60 figures. A figure is `read` only when its excerpt is found word for word in the file's
 * text and carries the figure; otherwise `check`. With no text (a scan), every figure is `check`.
 */
export function normaliseScheduleRead(raw: unknown, file: string, sourceText: string | null): InsurerSchedule {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const hay = sourceText ? squash(sourceText) : null
  const figures: ScheduleFigure[] = []
  for (const f of (Array.isArray(r.figures) ? r.figures : []).slice(0, 60) as Record<string, unknown>[]) {
    const code = String(f?.cover ?? '').trim().toLowerCase()
    const cover = COVER_CODE[code] ?? coverOfLabel(code)
    if (!cover) continue
    const premium = bounded(num(f?.premium))
    const excerpt = typeof f?.excerpt === 'string' ? f.excerpt.slice(0, 300) : ''
    const digits = premium != null ? String(Math.trunc(premium)) : ''
    const seen = !!hay && !!excerpt && hay.includes(squash(excerpt)) && squash(excerpt).replace(/[.,]/g, '').includes(digits)
    const page = Number(f?.page)
    figures.push({
      cover, category: typeof f?.category === 'string' && f.category.trim() ? f.category.trim().slice(0, 80) : null, premium,
      source: `${file}${Number.isInteger(page) && page > 0 && page < 500 ? ` · page ${page}` : ''} · read with AI`,
      status: premium == null ? 'missing' : seen ? 'read' : 'check',
    })
  }
  const t = bounded(num(r.total))
  const notes: string[] = []
  const total = t ? { premium: t, source: `${file} · read with AI` } : null
  const insurer = typeof r.insurer === 'string' && r.insurer.trim() ? (productOf(r.insurer) ?? r.insurer.trim().slice(0, 80)) : null
  return { file, insurer, figures: settle(figures, total, notes), total, readBy: 'model', notes }
}

/** What a schedule says in a few words: "14 figures read · 1 to check". */
export function scheduleSummary(s: InsurerSchedule): string {
  const read = s.figures.filter(f => f.status === 'read').length, check = s.figures.filter(f => f.status === 'check').length, missing = s.figures.filter(f => f.status === 'missing').length
  if (!s.figures.length) return 'Nothing read'
  return [`${read + check} ${read + check === 1 ? 'figure' : 'figures'} read`, check && `${check} to check`, missing && `${missing} missing`, s.readBy === 'model' && 'read with AI'].filter(Boolean).join(' · ')
}

/** A schedule's premium for one cover across the census (every category's figure summed); null when it states none. */
export function schedulePremium(s: InsurerSchedule, cover: CoverKey): { premium: number | null; status: ScheduleStatus | null; sources: string[] } {
  const fs = s.figures.filter(f => f.cover === cover)
  if (!fs.length) return { premium: null, status: null, sources: [] }
  const priced = fs.filter(f => f.premium != null)
  const status: ScheduleStatus = !priced.length ? 'missing' : fs.some(f => f.status === 'check') ? 'check' : fs.some(f => f.status === 'missing') ? 'check' : 'read'
  return { premium: priced.length ? Math.round(priced.reduce((a, f) => a + f.premium!, 0) * 100) / 100 : null, status, sources: fs.map(f => f.source) }
}

export const SCHEDULE_READ_PROMPT = `You read an insurer's employee benefits pricing schedule (quotation) for a Singapore insurance broker. Copy the annual premium the insurer quotes for each cover, exactly as written. Never compute, add up or estimate.
Return JSON only: {"insurer":"as written or null","figures":[{"cover":"GHS|EMM|GOPC|GOSC|GD|GPA","category":"the category or class as written, or null","premium":"as written","page":1,"excerpt":"the exact words on the page that carry the figure"}],"total":"the total annual premium as written, or null"}
Rules: GHS hospital and surgical; EMM major medical; GOPC outpatient GP or clinical; GOSC outpatient specialist; GD dental; GPA personal accident. Leave out term life and critical illness. Premiums before GST where both are shown. Do not copy limits, sums assured, rates per life or co-payments as premiums. If a figure is not on the document, leave it out.`
