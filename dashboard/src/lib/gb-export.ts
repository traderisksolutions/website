/**
 * Per-insurer quote exports (Phase D). Deterministic — numbers come straight from the
 * saved quote, never re-derived. Two builders share one data shape so the download route
 * and the reply-attach route (D2) produce identical files.
 */
import ExcelJS from 'exceljs'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
function sbH() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}` }
}

const NAVY = 'FF0C338A'
const NAVY_SOFT = 'FFEAF0F9'

export type ExportLine = {
  member_name: string; relationship: string; category: string; age: number | null
  product_code: string; plan_code: string | null; premium: number | null; note: string | null
}
export type ExportData = {
  company: string | null
  effective_date: string | null
  insurer_name: string
  gst_rate: number
  basis?: string | null
  lines: ExportLine[]
  totals: { subtotal: number; gst: number; total: number; missing: number }
  applied?: { group_factor: number; gst_treatment: string | null } | null
  generated_at?: string
}

type LineRow = ExportLine & { insurer_name: string; rate_table_id: string }
type Result = { rate_table_id: string; insurer_id: string | null; insurer_name: string; subtotal: number; gst: number; total: number; missing: number; applied?: { group_factor: number; gst_treatment: string | null } }

/** Load a saved quotation + its lines and shape them for ONE insurer's export.
 *  Numbers are copied from the saved quote — never recomputed. Returns null if absent. */
export async function buildExportData(id: string, insurer: string): Promise<ExportData | null> {
  const [qRes, lRes] = await Promise.all([
    fetch(`${SB_URL}/rest/v1/gb_quotations?id=eq.${id}&select=*&limit=1`, { headers: sbH(), cache: 'no-store' }),
    fetch(`${SB_URL}/rest/v1/gb_quote_lines?quotation_id=eq.${id}&select=*&order=member_index,product_code`, { headers: sbH(), cache: 'no-store' }),
  ])
  const quotation = qRes.ok ? (await qRes.json())[0] : null
  if (!quotation) return null
  const lines: LineRow[] = lRes.ok ? await lRes.json() : []
  const insurerLines = lines.filter(l => l.insurer_name === insurer)
  if (!insurerLines.length) return null

  const results: Result[] = (quotation.results ?? []).filter((r: Result) => r.insurer_name === insurer)
  const t = results.reduce((a, r) => ({ subtotal: a.subtotal + (r.subtotal ?? 0), gst: a.gst + (r.gst ?? 0), total: a.total + (r.total ?? 0), missing: a.missing + (r.missing ?? 0) }), { subtotal: 0, gst: 0, total: 0, missing: 0 })
  const round2 = (n: number) => Math.round(n * 100) / 100

  return {
    company: quotation.company_name ?? null,
    effective_date: quotation.effective_date ?? null,
    insurer_name: insurer,
    gst_rate: quotation.gst_rate ?? 0.09,
    basis: quotation.basis ?? null,
    lines: insurerLines.map(l => ({ member_name: l.member_name, relationship: l.relationship, category: l.category, age: l.age, product_code: l.product_code, plan_code: l.plan_code, premium: l.premium, note: l.note })),
    totals: { subtotal: round2(t.subtotal), gst: round2(t.gst), total: round2(t.total), missing: t.missing },
    applied: results.find(r => r.applied)?.applied ?? null,
    generated_at: new Date().toISOString(),
  }
}

export function safeFileStem(data: ExportData): string {
  const parts = [data.company, data.insurer_name, 'quote'].filter(Boolean).join('-')
  return parts.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'quote'
}

const money = (n: number | null) => (n == null ? '' : n.toFixed(2))
const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function buildInsurerCsv(data: ExportData): string {
  const rows: string[][] = []
  rows.push([`${data.insurer_name} — Group Insurance Premium Quotation`])
  if (data.company) rows.push([`Company: ${data.company}`])
  if (data.effective_date) rows.push([`Policy effective: ${data.effective_date}`])
  if (data.basis) rows.push([`Quote basis: ${data.basis === 'renewal' ? 'Renewal' : 'New Business'}`])
  rows.push(['Net annual premium, excluding GST'])
  rows.push([])
  rows.push(['Member', 'Relationship', 'Category', 'Age', 'Product', 'Plan', 'Premium (SGD)', 'Note'])
  for (const l of data.lines) {
    rows.push([l.member_name, l.relationship, l.category, l.age == null ? '' : String(l.age),
      l.product_code, l.plan_code ?? '', money(l.premium), l.note ?? ''])
  }
  rows.push([])
  rows.push(['', '', '', '', '', 'Subtotal (ex-GST)', money(data.totals.subtotal)])
  rows.push(['', '', '', '', '', `GST (${Math.round(data.gst_rate * 100)}%)`, money(data.totals.gst)])
  rows.push(['', '', '', '', '', 'Total annual premium', money(data.totals.total)])
  if (data.totals.missing > 0) rows.push([`${data.totals.missing} line(s) could not be priced — see Note column`])
  return rows.map(r => r.map(csvCell).join(',')).join('\r\n')
}

export async function buildInsurerXlsx(data: ExportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Trade Risk Solutions'
  wb.created = new Date()
  const ws = wb.addWorksheet(data.insurer_name.slice(0, 28) || 'Quotation', {
    views: [{ state: 'frozen', ySplit: 7 }],
  })

  ws.columns = [
    { width: 26 }, { width: 13 }, { width: 14 }, { width: 6 },
    { width: 30 }, { width: 16 }, { width: 15 }, { width: 26 },
  ]

  // Title block.
  ws.mergeCells('A1:H1')
  const title = ws.getCell('A1')
  title.value = `${data.insurer_name} — Group Insurance Premium Quotation`
  title.font = { bold: true, size: 14, color: { argb: NAVY } }
  ws.getRow(1).height = 22

  ws.mergeCells('A2:H2')
  const sub = ws.getCell('A2')
  sub.value = [
    data.company ? `Company: ${data.company}` : null,
    data.effective_date ? `Effective: ${data.effective_date}` : null,
    `Basis: ${data.basis === 'renewal' ? 'Renewal' : 'New Business'}`,
    'Net annual premium, excluding GST',
  ].filter(Boolean).join('   ·   ')
  sub.font = { size: 10, color: { argb: 'FF667085' } }

  // Header row (row 4 for the table; rows 1-2 title, 3 blank).
  const headerRowIdx = 4
  const headers = ['Member', 'Relationship', 'Category', 'Age', 'Product', 'Plan', 'Premium (SGD)', 'Note']
  const headerRow = ws.getRow(headerRowIdx)
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = h
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    cell.alignment = { vertical: 'middle', horizontal: i === 6 ? 'right' : 'left' }
  })
  headerRow.height = 18
  ws.views = [{ state: 'frozen', ySplit: headerRowIdx }]

  // Data rows.
  let r = headerRowIdx + 1
  data.lines.forEach((l, i) => {
    const row = ws.getRow(r++)
    row.getCell(1).value = l.member_name
    row.getCell(2).value = l.relationship
    row.getCell(3).value = l.category
    row.getCell(4).value = l.age
    row.getCell(5).value = l.product_code
    row.getCell(6).value = l.plan_code ?? '—'
    const prem = row.getCell(7)
    if (l.premium == null) { prem.value = l.note ?? 'unpriced'; prem.font = { color: { argb: 'FFB54708' }, size: 10 } }
    else { prem.value = l.premium; prem.numFmt = '#,##0.00'; prem.alignment = { horizontal: 'right' } }
    row.getCell(8).value = l.note ?? ''
    if (i % 2 === 1) row.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_SOFT } } })
  })

  r += 1
  const putTotal = (label: string, value: number, bold = false) => {
    const row = ws.getRow(r++)
    const lc = row.getCell(6); lc.value = label; lc.alignment = { horizontal: 'right' }; lc.font = { bold, size: 10 }
    const vc = row.getCell(7); vc.value = value; vc.numFmt = '#,##0.00'; vc.alignment = { horizontal: 'right' }
    vc.font = { bold, size: bold ? 11 : 10, color: { argb: bold ? NAVY : 'FF000000' } }
  }
  putTotal('Subtotal (ex-GST)', data.totals.subtotal)
  putTotal(`GST (${Math.round(data.gst_rate * 100)}%)`, data.totals.gst)
  putTotal('Total annual premium', data.totals.total, true)

  if (data.applied) {
    r += 1
    const note = ws.getRow(r++)
    ws.mergeCells(`A${note.number}:H${note.number}`)
    const parts = [
      data.applied.gst_treatment === 'inclusive' ? 'Rates were GST-inclusive; shown net of GST.' : null,
      data.applied.group_factor !== 1 ? `Group-size factor ×${data.applied.group_factor} applied.` : null,
    ].filter(Boolean)
    note.getCell(1).value = parts.length ? `Applied rules: ${parts.join(' ')}` : ''
    note.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF98A2B3' } }
  }
  if (data.totals.missing > 0) {
    const m = ws.getRow(r++)
    ws.mergeCells(`A${m.number}:H${m.number}`)
    m.getCell(1).value = `${data.totals.missing} line(s) could not be priced — see the Note column.`
    m.getCell(1).font = { italic: true, size: 9, color: { argb: 'FFB54708' } }
  }

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf as ArrayBuffer)
}
