// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import ExcelJS from 'exceljs'
import { checkAttachment, fileKind, formulaRefs, readPdf, parseCsv } from '@/lib/commission/redact'

async function quotePdf(): Promise<Uint8Array> {
  const d = await PDFDocument.create()
  const f = await d.embedFont(StandardFonts.Helvetica)
  const p1 = d.addPage([595, 842])
  p1.drawText('Group Hospital and Surgical quotation', { x: 50, y: 780, size: 14, font: f })
  p1.drawText('Commissioning date of the policy: 1 January 2027', { x: 50, y: 750, size: 10, font: f })
  const p2 = d.addPage([595, 842])
  p2.drawText('Annual premium', { x: 50, y: 700, size: 12, font: f }); p2.drawText('SGD 48,250.00', { x: 320, y: 700, size: 12, font: f })
  p2.drawText('Commission (12.5%)', { x: 50, y: 680, size: 12, font: f }); p2.drawText('SGD 6,031.25', { x: 320, y: 680, size: 12, font: f })
  p2.drawText('Valid for 30 days', { x: 50, y: 660, size: 12, font: f })
  const p3 = d.addPage([842, 595]) // landscape
  p3.drawText('Benefit schedule', { x: 50, y: 540, size: 12, font: f })
  return d.save()
}

const pageText = async (bytes: Uint8Array) => (await readPdf(bytes)).pages.map(p => p.items.map(i => i.str).join(' '))

describe('PDF client copy', () => {
  it('removes the commission line and keeps the other pages as text', async () => {
    const src = await quotePdf()
    const r = await checkAttachment(src, 'AIA quote.pdf', 'application/pdf')
    expect(r.status).toBe('blanked')
    expect(r.hits).toEqual([{ page: 2, text: 'Commission (12.5%) SGD 6,031.25' }])
    expect(r.clientCopy?.filename).toBe('AIA quote (client copy).pdf')
    const copy = r.clientCopy!.bytes
    const text = await pageText(copy)
    expect(text).toHaveLength(3)
    expect(text.join(' ')).not.toContain('6,031.25')
    expect(text.join(' ')).not.toMatch(/commission \(/i)
    expect(text[0]).toContain('Group Hospital and Surgical quotation')
    expect(text[0]).toContain('Commissioning date')
    expect(text[1]).toBe('') // rebuilt as an image
    expect(text[2]).toContain('Benefit schedule')
    const out = await PDFDocument.load(copy)
    expect(out.getPages().map(p => [Math.round(p.getWidth()), Math.round(p.getHeight())])).toEqual([[595, 842], [595, 842], [842, 595]])
  }, 60_000)

  it('a clean PDF stays clean and has no copy', async () => {
    const d = await PDFDocument.create()
    const f = await d.embedFont(StandardFonts.Helvetica)
    d.addPage().drawText('Proposal V2 premium SGD 10,000', { x: 50, y: 700, size: 12, font: f })
    const r = await checkAttachment(await d.save(), 'proposal.pdf')
    expect(r).toEqual({ status: 'clean', hits: [] })
  })

  it('a PDF without text is not checked', async () => {
    const d = await PDFDocument.create(); d.addPage()
    const r = await checkAttachment(await d.save(), 'scan.pdf')
    expect(r.status).toBe('not_checked')
    expect(r.reason).toMatch(/no readable text/i)
  })

  it('a broken file is not checked', async () => {
    const r = await checkAttachment(new TextEncoder().encode('%PDF-1.7 garbage'), 'x.pdf')
    expect(r.status).toBe('not_checked')
  })
})

describe('workbook client copy', () => {
  async function quoteBook(): Promise<Uint8Array> {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Quote')
    ws.addRow(['Plan', 'Premium', 'Commission Rate', 'Commission Amount', 'Net to insurer'])
    ws.addRow(['GHS', 12000, 0.15, { formula: 'B2*C2', result: 1800 }, { formula: 'B2-D2', result: 10200 }])
    ws.addRow(['GTL', 3000, 0.1, { formula: 'B3*C3', result: 300 }, { formula: 'B3-D3', result: 2700 }])
    ws.addRow(['Total', { formula: 'SUM(B2:B3)', result: 15000 }])
    const s2 = wb.addWorksheet('Summary')
    s2.addRow(['Brokerage', '15%'])
    s2.addRow(['Commissioning date', new Date('2027-01-01')])
    s2.addRow(['Comm. from Quote', { formula: 'Quote!D2', result: 1800 }])
    return new Uint8Array(await wb.xlsx.writeBuffer() as ArrayBuffer)
  }

  it('empties commission cells and columns and replaces formulas that read them', async () => {
    const r = await checkAttachment(await quoteBook(), 'terms.xlsx')
    expect(r.status).toBe('blanked')
    expect(r.hits.map(h => `${h.sheet}!${h.cell}`)).toEqual(['Quote!C1:C4', 'Quote!D1:D4', 'Summary!A1:B1', 'Summary!A3:B3'])
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(Buffer.from(r.clientCopy!.bytes) as unknown as ArrayBuffer)
    const q = wb.getWorksheet('Quote')!
    for (const a of ['C1', 'C2', 'C3', 'D1', 'D2', 'D3']) expect(q.getCell(a).value, a).toBeNull()
    expect(q.getCell('B2').value).toBe(12000)
    expect(q.getCell('E2').value).toBe(10200) // formula read D2: now its value
    expect(q.getCell('B4').value).toMatchObject({ formula: 'SUM(B2:B3)' }) // untouched
    const s = wb.getWorksheet('Summary')!
    expect(s.getCell('A1').value).toBeNull()
    expect(s.getCell('B1').value).toBeNull()
    expect(s.getCell('A2').value).toBe('Commissioning date')
    expect(r.clientCopy!.filename).toBe('terms (client copy).xlsx')
    // read again: nothing left
    expect((await checkAttachment(r.clientCopy!.bytes, 'again.xlsx')).status).toBe('clean')
  })

  it('xls (BIFF) is read through SheetJS', async () => {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Premium', 5000], ['Commission', 750]]), 'S1')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'biff8' }) as Buffer
    const r = await checkAttachment(new Uint8Array(buf), 'old.xls')
    expect(r.status).toBe('blanked')
    expect(r.clientCopy?.filename).toBe('old (client copy).xlsx')
  })

  it('formulaRefs expands ranges and other sheets', () => {
    expect(formulaRefs('SUM(B2:B3)+Quote!D2+\'My Sheet\'!A1', 'S')).toEqual(['S!B2', 'S!B3', 'Quote!D2', 'My Sheet!A1'])
    expect(formulaRefs('"D2"&A1', 'S')).toEqual(['S!A1'])
  })
})

describe('csv client copy', () => {
  it('empties the commission column', async () => {
    const csv = 'Plan,Premium,Comm %,Notes\r\nGHS,"12,000",15%,"includes ""rider"""\r\nGTL,3000,10%,\r\n'
    const r = await checkAttachment(new TextEncoder().encode(csv), 'q.csv', 'text/csv')
    expect(r.status).toBe('blanked')
    const out = new TextDecoder().decode(r.clientCopy!.bytes)
    expect(out).toBe('Plan,Premium,,Notes\r\nGHS,"12,000",,"includes ""rider"""\r\nGTL,3000,,\r\n')
  })
  it('parseCsv handles quotes and newlines', () => {
    expect(parseCsv('a,"b\nc",d\n1,2,3', ',')).toEqual([['a', 'b\nc', 'd'], ['1', '2', '3']])
  })
})

describe('fileKind', () => {
  it('reads name, then type, then bytes', () => {
    expect(fileKind('a.XLSM', null)).toBe('xlsx')
    expect(fileKind('a', 'application/vnd.ms-excel')).toBe('xls')
    expect(fileKind('a.bin', null, new TextEncoder().encode('%PDF-1.4'))).toBe('pdf')
    expect(fileKind('a.docx', null)).toBe('other')
  })
  it('other types are not checked', async () => {
    const r = await checkAttachment(new Uint8Array([1, 2, 3]), 'letter.docx')
    expect(r.status).toBe('not_checked')
  })
})
