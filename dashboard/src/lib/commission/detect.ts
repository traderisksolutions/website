/**
 * Broker commission in insurer files (Jarod, 20 Nov 2026): a file going to a client must never
 * show the broker's commission. This module finds it; redact.ts blanks it.
 *
 * Pure. Two inputs:
 *   - PDF text items with positions (PDF user space, y up, baseline origin), one page at a time
 *   - spreadsheet grids (rows of cell values)
 *
 * A hit needs a commission term AND a figure. A term alone ("Securities Commission", "commission
 * is paid by the insurer") is prose and is not blanked. Figures are found two ways:
 *   1. Row: figures right after the term on the same line or row ("Commission (15%)  SGD 1,500").
 *   2. Column: the term heads a table column (other headers on the same line, no figure after it);
 *      the figures below it in that column are blanked until the table ends.
 */

// ── Terms ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Commission terms. Word boundaries keep out "commissioning", "commissioned", "commissioner",
 * "decommission". "brokerage" followed by a company suffix is a firm's name, not a fee.
 * "comm" only counts in the forms an insurer uses for the column: "comm.", "comm %", "comm rate",
 * "comm amount".
 */
const TERM_RE = new RegExp(
  [
    String.raw`\bcommissions?\b(?:\s+(?:rate|amount|amt)\b)?`,
    String.raw`\bbrokerage\b(?!\s*(?:pte|ltd|limited|sdn|bhd|inc|llc|llp|firm|house|company|co\b|services|group|holdings|license|licence|licen[sc]ed|account))`,
    String.raw`\bbroker'?s?['’]?\s+fees?\b`,
    String.raw`\bagency\s+fees?\b`,
    String.raw`\bcomm(?:\.|\s*%|\s+(?:rate|amount|amt)\b)`,
  ].join('|'),
  'gi',
)

export type TermMatch = { start: number; end: number; text: string }

/** Every commission term in a string, with its character range. */
export function findTerms(s: string): TermMatch[] {
  const out: TermMatch[] = []
  TERM_RE.lastIndex = 0
  for (let m = TERM_RE.exec(s); m; m = TERM_RE.exec(s)) {
    out.push({ start: m.index, end: m.index + m[0].length, text: m[0] })
    if (m[0].length === 0) TERM_RE.lastIndex++
  }
  return out
}

export const hasTerm = (s: string) => findTerms(s).length > 0

// ── Figures ────────────────────────────────────────────────────────────────────────────────────

/** A token that is a figure: 15%, 1,500.00, (1,500), SGD1,500, $1,500, -, nil. */
const FIGURE_TOKEN = /^[([]?[-–+]?(?:S\$|US\$|RM|Rp\.?|\$|€|£)?[-–+]?\d[\d,.\s]*%?[)\]]?[,;:]?$/i
/** Tokens that may sit between a term and its figure without ending the run. */
const CONNECTOR = /^(?:[:=@\-–—()[\]/|*.]+|%|rate|rates|amount|amt|payable|percentage|pct|value|of|on|at|is|incl\.?|excl\.?|inclusive|exclusive|gst|vat|tax|nett?|gross|total|per|annum|p\.a\.?|sgd|usd|idr|myr|eur|gbp|hkd|aud|rp|rm|s\$|us\$|\$)$/i

const isConnector = (t: string) => CONNECTOR.test(t) || CONNECTOR.test(t.replace(/[:,;]+$/, ''))
export const isFigure = (token: string) => FIGURE_TOKEN.test(token.trim())
/** A cell value that reads as a figure, a blank-ish placeholder in a figure column, or a currency amount. */
export function isFigureCell(v: unknown): boolean {
  if (typeof v === 'number') return Number.isFinite(v)
  if (typeof v !== 'string') return false
  const t = v.trim()
  if (!t) return false
  const parts = t.split(/\s+/)
  return parts.some(p => FIGURE_TOKEN.test(p)) && parts.every(p => FIGURE_TOKEN.test(p) || isConnector(p))
}
const isPlaceholder = (s: string) => /^(?:-|–|—|nil|n\/?a|tbc|tba)$/i.test(s.trim())

type Token = { start: number; end: number; text: string }
function tokens(s: string, from: number): Token[] {
  const out: Token[] = []
  const re = /\S+/g
  re.lastIndex = from
  for (let m = re.exec(s); m; m = re.exec(s)) out.push({ start: m.index, end: m.index + m[0].length, text: m[0] })
  return out
}

/**
 * The figures right after a term in a line of text: tokens are read left to right; a figure or
 * a connector continues the run, a word ends it. Returns the end of the last figure, or null when
 * no figure follows.
 */
export function figureRunEnd(line: string, termEnd: number): number | null {
  let last: number | null = null
  for (const t of tokens(line, termEnd)) {
    if (findTerms(t.text).length) break
    if (isFigure(t.text)) { last = t.end; continue }
    if (isConnector(t.text)) continue
    break
  }
  return last
}

// ── PDF ────────────────────────────────────────────────────────────────────────────────────────

/** A text item from pdf.js getTextContent: x,y = baseline origin in PDF units; h = font size. */
export type TextItem = { str: string; x: number; y: number; w: number; h: number }
/** A rectangle in PDF units, y up (bottom-left origin). */
export type Box = { x: number; y: number; w: number; h: number }
export type PdfHit = { page: number; text: string; boxes: Box[]; kind: 'row' | 'column' }

type Line = { y: number; h: number; items: TextItem[]; text: string; spans: { item: TextItem; start: number; end: number }[] }

/** Items grouped into lines by baseline, left to right. Empty items are dropped. */
export function groupLines(items: TextItem[]): Line[] {
  const real = items.filter(i => i.str.trim().length > 0 && i.w > 0)
  const sorted = [...real].sort((a, b) => b.y - a.y || a.x - b.x)
  const lines: { y: number; h: number; items: TextItem[] }[] = []
  for (const it of sorted) {
    const tol = Math.max(2, Math.min(it.h || 10, 14) * 0.45)
    const line = lines.find(l => Math.abs(l.y - it.y) <= tol)
    if (line) { line.items.push(it); line.h = Math.max(line.h, it.h) } else lines.push({ y: it.y, h: it.h, items: [it] })
  }
  return lines.sort((a, b) => b.y - a.y).map(l => {
    const its = l.items.sort((a, b) => a.x - b.x)
    let text = ''
    const spans: Line['spans'] = []
    for (const it of its) {
      if (text) text += ' '
      spans.push({ item: it, start: text.length, end: text.length + it.str.length })
      text += it.str
    }
    return { y: l.y, h: l.h, items: its, text, spans }
  })
}

/** The box of an item's text between two character offsets, estimated by character share and padded. */
function partialBox(it: TextItem, from: number, to: number): Box {
  const len = Math.max(1, it.str.length)
  const a = Math.max(0, Math.min(len, from)), b = Math.max(a, Math.min(len, to))
  const charW = it.w / len
  const pad = charW * 0.8 + 1
  const x1 = it.x + charW * a - (a > 0 ? pad : 1)
  const x2 = it.x + charW * b + (b < len ? pad : 1)
  return itemBand(it, x1, x2)
}
const itemBand = (it: TextItem, x1: number, x2: number): Box => {
  const h = it.h || 10
  return { x: x1, y: it.y - h * 0.3, w: x2 - x1, h: h * 1.35 }
}
const wholeBox = (it: TextItem): Box => itemBand(it, it.x - 1, it.x + it.w + 1)

/** Boxes covering line characters [start, end). */
function boxesFor(line: Line, start: number, end: number): Box[] {
  const out: Box[] = []
  for (const s of line.spans) {
    if (s.end <= start || s.start >= end) continue
    out.push(partialBox(s.item, start - s.start, end - s.start))
  }
  return out
}

const centre = (it: TextItem) => it.x + it.w / 2
const overlap = (a1: number, a2: number, b1: number, b2: number) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1))

/**
 * Commission on one PDF page. Each hit carries the boxes to paint over: the term and its figures
 * for a row, the header and every figure under it for a column.
 */
export function detectPdfPage(items: TextItem[], page: number): PdfHit[] {
  const lines = groupLines(items)
  const hits: PdfHit[] = []
  lines.forEach((line, li) => {
    for (const term of findTerms(line.text)) {
      const runEnd = figureRunEnd(line.text, term.end)
      // 1. Row: the term and the figures after it. Figures before the term in the same item
      //    ("15% commission") are caught by the leading check below.
      if (runEnd !== null) {
        hits.push({ page, kind: 'row', text: line.text.slice(term.start, runEnd).trim(), boxes: boxesFor(line, term.start, runEnd) })
        continue
      }
      const before = leadingFigure(line.text, term.start)
      if (before !== null) {
        hits.push({ page, kind: 'row', text: line.text.slice(before, term.end).trim(), boxes: boxesFor(line, before, term.end) })
        continue
      }
      // 2. Column: the term's item is one header among several on this line.
      const headerItems = line.spans.filter(s => s.end > term.start && s.start < term.end).map(s => s.item)
      if (!headerItems.length || line.items.length < 2) continue
      const col = columnBelow(lines, li, headerItems, line.items)
      if (col.cells.length) {
        hits.push({
          page, kind: 'column',
          text: `${term.text} column: ${col.cells.map(c => c.str.trim()).slice(0, 6).join(', ')}${col.cells.length > 6 ? ` +${col.cells.length - 6}` : ''}`,
          boxes: [...headerItems.map(wholeBox), ...col.cells.map(wholeBox)],
        })
      }
    }
  })
  return hits
}

/** "15% commission", "SGD 1,500 brokerage": a figure right before the term. Start offset or null. */
function leadingFigure(line: string, termStart: number): number | null {
  const head = line.slice(0, termStart)
  const toks = tokens(head, 0)
  let first: number | null = null
  for (let i = toks.length - 1; i >= 0; i--) {
    const t = toks[i]
    if (isFigure(t.text)) { first = t.start; continue }
    if (/^(?:[:=@\-–—()]+|sgd|usd|idr|myr|rp|rm|s\$|\$)$/i.test(t.text)) continue
    break
  }
  // Only a figure ending within two tokens of the term counts.
  if (first === null) return null
  const gap = tokens(line.slice(0, termStart), first).length
  return gap <= 3 ? first : null
}

/**
 * The figures under a column header. A cell belongs to the column when its centre is nearer the
 * header than any other header on the header line and it overlaps the header's padded span. The
 * column ends at a word in the column, a gap of more than three line heights, or 120 lines.
 */
function columnBelow(lines: Line[], headerIdx: number, header: TextItem[], headerLine: TextItem[]) {
  const hx1 = Math.min(...header.map(h => h.x)), hx2 = Math.max(...header.map(h => h.x + h.w))
  const hc = (hx1 + hx2) / 2
  const others = headerLine.filter(it => !header.includes(it))
  const pad = Math.max(8, (hx2 - hx1) * 0.6)
  const cells: TextItem[] = []
  let prevY = lines[headerIdx].y
  const lineH = Math.max(8, lines[headerIdx].h)
  for (let i = headerIdx + 1; i < lines.length && i <= headerIdx + 120; i++) {
    const l = lines[i]
    if (prevY - l.y > lineH * 3.2) break
    const inCol = l.items.filter(it => {
      const c = centre(it)
      const mine = Math.abs(c - hc)
      if (others.some(o => Math.abs(c - centre(o)) < mine)) return false
      return overlap(it.x, it.x + it.w, hx1 - pad, hx2 + pad) > 0
    })
    if (!inCol.length) { prevY = l.y; continue }
    const words = inCol.filter(it => !isFigureCell(it.str) && !isPlaceholder(it.str))
    if (words.length) break
    cells.push(...inCol)
    prevY = l.y
  }
  return { cells }
}

// ── Spreadsheets ───────────────────────────────────────────────────────────────────────────────

export type Cell = string | number | boolean | Date | null | undefined
export type GridHit = { sheet?: string; cell: string; text: string; kind: 'cell' | 'row' | 'column'; cells: [number, number][] }

/** A1 name for zero-based row/column. */
export function a1(r: number, c: number): string {
  let s = '', n = c + 1
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) }
  return `${s}${r + 1}`
}

const cellText = (v: Cell) => v == null ? '' : v instanceof Date ? '' : String(v)
const isEmpty = (v: Cell) => cellText(v).trim() === ''

/**
 * Commission in a grid (rows of values, zero-based). A term cell is a hit when:
 *   - it carries a figure itself ("Commission: 15%"), or
 *   - a figure is in the next non-empty cell to its right (a row label), or
 *   - a figure is in the next non-empty cell below it (a column header): the whole column below
 *     the header is blanked.
 * Returns hits with every cell to empty, the term cell included.
 */
export function detectGrid(rows: Cell[][], sheet?: string): GridHit[] {
  const hits: GridHit[] = []
  const at = (r: number, c: number): Cell => rows[r]?.[c]
  const height = rows.length
  rows.forEach((row, r) => row.forEach((v, c) => {
    const s = cellText(v)
    if (typeof v !== 'string' || !hasTerm(s)) return
    const terms = findTerms(s)
    const inCell = terms.some(t => figureRunEnd(s, t.end) !== null || leadingFigure(s, t.start) !== null)
    if (inCell) { hits.push({ sheet, cell: a1(r, c), text: s.trim(), kind: 'cell', cells: [[r, c]] }); return }

    // Row: figures to the right, up to the first word cell.
    const rowCells: [number, number][] = []
    let gaps = 0
    for (let cc = c + 1; cc < row.length && gaps <= 3; cc++) {
      const x = at(r, cc)
      if (isEmpty(x)) { gaps++; continue }
      if (isFigureCell(x) || (typeof x === 'string' && isPlaceholder(x))) { rowCells.push([r, cc]); gaps = 0; continue }
      if (typeof x === 'string' && isConnector(x.trim())) continue
      break
    }
    if (rowCells.some(([rr, cc]) => isFigureCell(at(rr, cc)))) {
      const vals = rowCells.map(([rr, cc]) => cellText(at(rr, cc)))
      hits.push({ sheet, cell: `${a1(r, c)}:${a1(r, rowCells[rowCells.length - 1][1])}`, text: `${s.trim()} ${vals.join(' ')}`.trim(), kind: 'row', cells: [[r, c], ...rowCells] })
      return
    }

    // Column: the first non-empty cell below (within 3 rows) is a figure → the whole column below.
    let firstBelow: Cell = null
    for (let rr = r + 1; rr < Math.min(height, r + 4); rr++) { if (!isEmpty(at(rr, c))) { firstBelow = at(rr, c); break } }
    if (firstBelow == null || !isFigureCell(firstBelow)) return
    const colCells: [number, number][] = []
    for (let rr = r + 1; rr < height; rr++) if (!isEmpty(at(rr, c))) colCells.push([rr, c])
    const sample = colCells.slice(0, 4).map(([rr, cc]) => cellText(at(rr, cc)))
    hits.push({ sheet, cell: `${a1(r, c)}:${a1(height - 1, c)}`, text: `${s.trim()} column: ${sample.join(', ')}${colCells.length > 4 ? ` +${colCells.length - 4}` : ''}`, kind: 'column', cells: [[r, c], ...colCells] })
  }))
  return hits
}
