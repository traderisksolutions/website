/**
 * POST /api/eb/compare/xlsx  { company, effective_date, rows }  → the Compare table as an Excel file.
 * `rows` is compareSheet's output (src/lib/gb/eb-compare.ts), written as the page shows it: covers
 * down, Current then every column, premiums and plans. Bounded: 200 rows, 40 cells, short strings.
 * Nothing is saved. No model.
 */
import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createClient } from '@/lib/supabase/server'

const cellOf = (v: unknown): string | number | null => typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' ? v.slice(0, 200) : null

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const body = await req.json().catch(() => ({})) as { company?: unknown; rows?: unknown }
  const rows = (Array.isArray(body.rows) ? body.rows.slice(0, 200) : []).map(r => (Array.isArray(r) ? r.slice(0, 40) : []).map(cellOf))
  if (rows.length < 4) return NextResponse.json({ error: 'Nothing to export.' }, { status: 400 })
  const company = typeof body.company === 'string' ? body.company.slice(0, 120) : ''

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Compare', { views: [{ state: 'frozen', xSplit: 1, ySplit: 5 }] })
  rows.forEach(r => ws.addRow(r))
  ws.getRow(1).font = { bold: true, size: 13 }
  ws.getRow(4).font = { bold: true }
  ws.getRow(5).font = { italic: true, color: { argb: 'FF6B7570' } }
  ws.getColumn(1).width = 30
  for (let c = 2; c <= Math.max(...rows.map(r => r.length)); c++) { ws.getColumn(c).width = 24; ws.getColumn(c).numFmt = '#,##0.00'; ws.getColumn(c).alignment = { horizontal: 'center', wrapText: true } }
  rows.forEach((r, i) => { if (r[0] === 'Total a year' || r[0] === 'Per employee') ws.getRow(i + 1).font = { bold: true } })
  const buf = Buffer.from(await wb.xlsx.writeBuffer())
  const name = `${(company || 'Employment Benefits').replace(/[^A-Za-z0-9&.,() -]+/g, ' ').replace(/\s+/g, ' ').trim()} - Compare.xlsx`
  return new NextResponse(new Uint8Array(buf), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${name}"` } })
}
