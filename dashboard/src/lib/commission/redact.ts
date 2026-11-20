/**
 * The client copy of a file: broker commission removed (detect.ts finds it).
 *
 *   PDF            pages with commission are rendered to an image at 200 DPI, the commission painted
 *                  white, and the page replaced by that image (the text under it is gone, not
 *                  covered). Other pages are copied unchanged. Text on a replaced page cannot be
 *                  selected.
 *   xlsx/xlsm/xls  matching cells emptied, whole columns under a commission header emptied,
 *                  formulas that read an emptied cell replaced by their last value. Written as xlsx.
 *   csv            matching cells and columns emptied.
 *
 * Anything that cannot be read (no text layer, a password, another type) is not_checked: a person
 * must look at it before it goes. Server only.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'
import ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'
import { a1, detectGrid, detectPdfPage, type Cell, type PdfHit, type TextItem } from './detect'

export type CommissionStatus = 'clean' | 'blanked' | 'not_checked'
export type CommissionHit = { page?: number; sheet?: string; cell?: string; text: string }
export type ClientCopy = { bytes: Uint8Array; filename: string; mimeType: string }
export type CheckResult = { status: CommissionStatus; hits: CommissionHit[]; reason?: string; clientCopy?: ClientCopy }

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const DPI = 200
/** A PDF that must be rebuilt whole (encrypted) is rendered page by page; past this it is not_checked. */
const MAX_RASTER_PAGES = 60

export type FileKind = 'pdf' | 'xlsx' | 'xls' | 'csv' | 'other'

/** The kind of a file, from its name, then its type, then its first bytes. */
export function fileKind(filename: string, mimeType: string | null | undefined, bytes?: Uint8Array): FileKind {
  const ext = (filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]) ?? ''
  if (ext === 'pdf') return 'pdf'
  if (ext === 'xlsx' || ext === 'xlsm') return 'xlsx'
  if (ext === 'xls') return 'xls'
  if (ext === 'csv') return 'csv'
  const m = (mimeType ?? '').toLowerCase()
  if (m === 'application/pdf') return 'pdf'
  if (m.includes('spreadsheetml') || m.includes('ms-excel.sheet.macroenabled')) return 'xlsx'
  if (m === 'application/vnd.ms-excel') return 'xls'
  if (m === 'text/csv') return 'csv'
  if (bytes && bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'pdf'
  return 'other'
}

const stem = (filename: string) => filename.replace(/\.[^.]+$/, '') || 'file'
const copyName = (filename: string, ext: string) => `${stem(filename)} (client copy).${ext}`

/** Check one file. Never throws: a file that cannot be read comes back not_checked with a reason. */
export async function checkAttachment(bytes: Uint8Array, filename: string, mimeType?: string | null): Promise<CheckResult> {
  const kind = fileKind(filename, mimeType, bytes)
  try {
    if (kind === 'pdf') return await redactPdf(bytes, filename)
    if (kind === 'xlsx' || kind === 'xls') return await redactWorkbook(bytes, filename, kind)
    if (kind === 'csv') return redactCsv(bytes, filename)
    return { status: 'not_checked', hits: [], reason: `File type not read (${filename.match(/\.[^.]+$/)?.[0] ?? 'no extension'})` }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/password|encrypt/i.test(msg)) return { status: 'not_checked', hits: [], reason: 'Password protected' }
    return { status: 'not_checked', hits: [], reason: `Could not be read: ${msg.slice(0, 160)}` }
  }
}

// ── PDF ────────────────────────────────────────────────────────────────────────────────────────

type PdfJsTextItem = { str?: string; transform?: number[]; width?: number; height?: number }
type PdfJsViewport = { width: number; height: number; convertToViewportRectangle(r: number[]): number[] }
type PdfJsPage = {
  getTextContent(): Promise<{ items: PdfJsTextItem[] }>
  getViewport(o: { scale: number }): PdfJsViewport
  render(o: { canvasContext: unknown; viewport: PdfJsViewport; canvas: unknown }): { promise: Promise<void> }
  cleanup?: () => void
}
type CanvasLike = { toBuffer(type: 'image/png'): Buffer }
type Ctx2d = { fillStyle: string; fillRect(x: number, y: number, w: number, h: number): void }
type PdfJsDoc = {
  numPages: number
  getPage(n: number): Promise<PdfJsPage>
  canvasFactory: { create(w: number, h: number): { canvas: CanvasLike; context: Ctx2d } }
}

/**
 * pdf.js's own font and character-map files. Without them a page whose fonts are not embedded
 * (Helvetica, Arial, CJK) is drawn with system fonts, and a Vercel function has none: the
 * rendered page would come out without its text. next.config.mjs ships these folders with the
 * route.
 */
function pdfjsAssets(): { standardFontDataUrl?: string; cMapUrl?: string; cMapPacked?: boolean } {
  const base = path.join(process.cwd(), 'node_modules', 'pdfjs-dist')
  const fonts = path.join(base, 'standard_fonts') + path.sep
  const cmaps = path.join(base, 'cmaps') + path.sep
  return {
    ...(existsSync(fonts) ? { standardFontDataUrl: fonts } : {}),
    ...(existsSync(cmaps) ? { cMapUrl: cmaps, cMapPacked: true } : {}),
  }
}

/** pdf.js through pdf-parse (it sets up the worker, the canvas and DOMMatrix for Node). */
async function openPdf(bytes: Uint8Array) {
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: new Uint8Array(bytes), ...pdfjsAssets() })
  // load() is the document pdf-parse already opens for getText/getScreenshot; it is not in the
  // typings, but it is the only way to reach item positions and the canvas factory it set up.
  const doc = await (parser as unknown as { load(): Promise<PdfJsDoc> }).load()
  return { doc, close: () => parser.destroy().catch(() => {}) }
}

export function textItems(raw: PdfJsTextItem[]): TextItem[] {
  const out: TextItem[] = []
  for (const it of raw) {
    if (typeof it.str !== 'string' || !it.transform) continue
    const [, , c, d, e, f] = it.transform
    const h = Math.hypot(c, d) || it.height || 0
    out.push({ str: it.str, x: e, y: f, w: it.width ?? 0, h })
  }
  return out
}

/** Text items and commission hits for every page. */
export async function readPdf(bytes: Uint8Array): Promise<{ pages: { items: TextItem[]; hits: PdfHit[] }[] }> {
  const { doc, close } = await openPdf(bytes)
  try {
    const pages: { items: TextItem[]; hits: PdfHit[] }[] = []
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      const items = textItems((await page.getTextContent()).items)
      pages.push({ items, hits: detectPdfPage(items, n) })
      page.cleanup?.()
    }
    return { pages }
  } finally { await close() }
}

async function redactPdf(bytes: Uint8Array, filename: string): Promise<CheckResult> {
  const { doc, close } = await openPdf(bytes)
  try {
    const n = doc.numPages
    const hitsByPage = new Map<number, PdfHit[]>()
    const blankPages: number[] = []
    for (let p = 1; p <= n; p++) {
      const page = await doc.getPage(p)
      const items = textItems((await page.getTextContent()).items)
      if (!items.some(i => i.str.trim())) blankPages.push(p)
      const hits = detectPdfPage(items, p)
      if (hits.length) hitsByPage.set(p, hits)
      page.cleanup?.()
    }
    const hits: CommissionHit[] = [...hitsByPage.values()].flat().map(h => ({ page: h.page, text: h.text }))
    if (!hitsByPage.size) {
      if (blankPages.length === n) return { status: 'not_checked', hits: [], reason: 'No readable text (scanned)' }
      if (blankPages.length) return { status: 'not_checked', hits: [], reason: `No readable text on page ${blankPages.join(', ')}` }
      return { status: 'clean', hits: [] }
    }

    const src = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
    // pdf-lib cannot decrypt: copied pages of an encrypted file come out unreadable, so every page
    // is rendered instead.
    const rasterAll = src.isEncrypted
    if (rasterAll && n > MAX_RASTER_PAGES) return { status: 'not_checked', hits, reason: `Encrypted, ${n} pages` }
    const out = await PDFDocument.create()
    const keep = Array.from({ length: n }, (_, i) => i).filter(i => !rasterAll && !hitsByPage.has(i + 1))
    const copied = keep.length ? await out.copyPages(src, keep) : []
    const copiedAt = new Map(keep.map((idx, k) => [idx, copied[k]]))
    for (let p = 1; p <= n; p++) {
      const kept = copiedAt.get(p - 1)
      if (kept) { out.addPage(kept); continue }
      const page = await doc.getPage(p)
      const base = page.getViewport({ scale: 1 })
      const vp = page.getViewport({ scale: DPI / 72 })
      const { canvas, context } = doc.canvasFactory.create(Math.ceil(vp.width), Math.ceil(vp.height))
      await page.render({ canvasContext: context, viewport: vp, canvas }).promise
      context.fillStyle = '#ffffff'
      for (const h of hitsByPage.get(p) ?? []) {
        for (const b of h.boxes) {
          const [x1, y1, x2, y2] = vp.convertToViewportRectangle([b.x, b.y, b.x + b.w, b.y + b.h])
          context.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1))
        }
      }
      const png = await out.embedPng(canvas.toBuffer('image/png'))
      const np = out.addPage([base.width, base.height])
      np.drawImage(png, { x: 0, y: 0, width: base.width, height: base.height })
      page.cleanup?.()
    }
    const copy = await out.save()

    // The copy is read back: any commission still in its text means the copy is not safe.
    const again = await readPdf(copy)
    const left = again.pages.flatMap(p => p.hits)
    if (left.length) return { status: 'not_checked', hits, reason: `Commission still readable on page ${[...new Set(left.map(h => h.page))].join(', ')}` }
    return { status: 'blanked', hits, clientCopy: { bytes: copy, filename: copyName(filename, 'pdf'), mimeType: 'application/pdf' } }
  } finally { await close() }
}

// ── Workbooks ──────────────────────────────────────────────────────────────────────────────────

type Primitive = string | number | boolean | Date | null
const isCfb = (b: Uint8Array) => b.length > 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0

/** A cell's value as the reader sees it: the result of a formula, rich text joined. */
function shownValue(v: ExcelJS.CellValue): Cell {
  if (v == null) return null
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v instanceof Date) return v
  if (typeof v === 'object') {
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map(r => r.text).join('')
    if ('formula' in v || 'sharedFormula' in v) return shownValue((v as { result?: ExcelJS.CellValue }).result ?? null)
    if ('text' in v && typeof (v as { text: unknown }).text === 'string') return (v as { text: string }).text
    if ('error' in v) return null
  }
  return null
}
const primitive = (v: unknown): Primitive => (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v instanceof Date ? v : null)

const colNum = (letters: string) => letters.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0)

/** Every cell a formula reads, as "Sheet!A1" (ranges capped at 20,000 cells). */
export function formulaRefs(formula: string, ownSheet: string): string[] {
  const out: string[] = []
  const re = /(?:(?:'((?:[^']|'')+)'|([A-Za-z0-9_.]+))!)?\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?/g
  const clean = formula.replace(/"[^"]*"/g, '""')
  for (let m = re.exec(clean); m; m = re.exec(clean)) {
    const sheet = (m[1]?.replace(/''/g, "'") ?? m[2] ?? ownSheet)
    const c1 = colNum(m[3]), r1 = Number(m[4])
    const c2 = m[5] ? colNum(m[5]) : c1, r2 = m[6] ? Number(m[6]) : r1
    let count = 0
    for (let r = Math.min(r1, r2); r <= Math.max(r1, r2) && count < 20000; r++) {
      for (let c = Math.min(c1, c2); c <= Math.max(c1, c2) && count < 20000; c++, count++) out.push(`${sheet}!${a1(r - 1, c - 1)}`)
    }
  }
  return out
}

async function redactWorkbook(bytes: Uint8Array, filename: string, kind: 'xlsx' | 'xls'): Promise<CheckResult> {
  let buf = Buffer.from(bytes)
  if (kind === 'xls' || isCfb(bytes)) {
    // An xlsx inside a compound file is a password-protected workbook.
    if (kind === 'xlsx') return { status: 'not_checked', hits: [], reason: 'Password protected' }
    const wb = XLSX.read(buf, { type: 'buffer', cellFormula: true, cellDates: true })
    buf = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer)
  }
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf as unknown as ArrayBuffer)

  // Formulas are read before anything changes: a shared formula's copies are worked out from
  // their master, which may be emptied below.
  type F = { sheet: ExcelJS.Worksheet; addr: string; formula: string; result: Primitive; master: string | null; isMaster: boolean }
  const formulas: F[] = []
  wb.eachSheet(ws => ws.eachRow({ includeEmpty: false }, row => row.eachCell({ includeEmpty: false }, cell => {
    const v = cell.value as { formula?: string; sharedFormula?: string; result?: unknown; shareType?: string } | null
    if (!v || typeof v !== 'object' || !('formula' in v || 'sharedFormula' in v)) return
    formulas.push({ sheet: ws, addr: cell.address, formula: cell.formula ?? v.formula ?? '', result: primitive(v.result), master: v.sharedFormula ?? null, isMaster: v.shareType === 'shared' })
  })))

  const hits: CommissionHit[] = []
  const blanked = new Set<string>()
  wb.eachSheet(ws => {
    const rows: Cell[][] = []
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      const vals: Cell[] = []
      row.eachCell({ includeEmpty: false }, (cell, c) => { vals[c - 1] = shownValue(cell.value) })
      rows[r - 1] = vals
    })
    for (let i = 0; i < rows.length; i++) rows[i] ??= []
    for (const h of detectGrid(rows, ws.name)) {
      hits.push({ sheet: ws.name, cell: h.cell, text: h.text })
      for (const [r, c] of h.cells) { ws.getCell(r + 1, c + 1).value = null; blanked.add(`${ws.name}!${a1(r, c)}`) }
    }
  })
  if (!hits.length) return { status: 'clean', hits: [] }

  const key = (f: F) => `${f.sheet.name}!${f.addr}`
  const changed = new Set<string>()
  for (const f of formulas) {
    const k = key(f)
    if (blanked.has(k)) { changed.add(k); continue }
    if (formulaRefs(f.formula, f.sheet.name).some(ref => blanked.has(ref))) {
      f.sheet.getCell(f.addr).value = f.result
      changed.add(k)
    }
  }
  // A shared-formula copy whose master changed becomes a formula of its own.
  for (const f of formulas) {
    const k = key(f)
    if (changed.has(k) || !f.master || f.isMaster) continue
    if (changed.has(`${f.sheet.name}!${f.master}`)) {
      f.sheet.getCell(f.addr).value = f.formula ? ({ formula: f.formula, result: f.result ?? undefined } as ExcelJS.CellFormulaValue) : f.result
    }
  }
  const out = new Uint8Array(await wb.xlsx.writeBuffer() as ArrayBuffer)
  return { status: 'blanked', hits, clientCopy: { bytes: out, filename: copyName(filename, 'xlsx'), mimeType: XLSX_MIME } }
}

// ── CSV ────────────────────────────────────────────────────────────────────────────────────────

export function parseCsv(text: string, sep: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ } else if (ch === '"') q = false; else cell += ch
    } else if (ch === '"' && cell === '') q = true
    else if (ch === sep) { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows
}
const csvCell = (s: string, sep: string) => (s.includes(sep) || /["\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)

function redactCsv(bytes: Uint8Array, filename: string): CheckResult {
  let text = Buffer.from(bytes).toString('utf8')
  const bom = text.startsWith('﻿')
  if (bom) text = text.slice(1)
  const first = text.split(/\r?\n/, 1)[0] ?? ''
  const sep = [',', ';', '\t'].map(s => [s, first.split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0]
  const rows = parseCsv(text, sep)
  const grid: Cell[][] = rows.map(r => r.map(v => (v.trim() !== '' && /^-?\d+(?:\.\d+)?$/.test(v.trim()) ? Number(v) : v)))
  const found = detectGrid(grid)
  if (!found.length) return { status: 'clean', hits: [] }
  for (const h of found) for (const [r, c] of h.cells) if (rows[r]?.[c] !== undefined) rows[r][c] = ''
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const out = (bom ? '﻿' : '') + rows.map(r => r.map(c => csvCell(c, sep)).join(sep)).join(eol) + (/\r?\n$/.test(text) ? eol : '')
  return {
    status: 'blanked',
    hits: found.map(h => ({ cell: h.cell, text: h.text })),
    clientCopy: { bytes: new Uint8Array(Buffer.from(out, 'utf8')), filename: copyName(filename, 'csv'), mimeType: 'text/csv' },
  }
}
