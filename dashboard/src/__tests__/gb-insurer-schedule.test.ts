// @vitest-environment node
/**
 * Insurer pricing schedules read by code (spreadsheets by header rules, PDFs by text) and by a
 * bounded model read; every figure keeps its source and a status. Fixtures are made here.
 */
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { coverOfLabel, normaliseScheduleRead, readSchedulePdf, readScheduleSheets, schedulePremium, scheduleSummary } from '@/lib/gb/insurer-schedule'
import { pdfPages } from '@/lib/gb/pdf-text'
import { censusFromPdfText, normaliseCensusRead, pdfRows } from '@/lib/gb/census-pdf'

const sheetRows = (aoa: unknown[][]) => {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Quote')
  const back = XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' })
  return [{ name: 'Quote', rows: XLSX.utils.sheet_to_json(back.Sheets.Quote, { header: 1, raw: true, defval: null }) as unknown[][] }]
}

async function pdfOf(lines: string[][]): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([700, 800])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  lines.forEach((cells, r) => cells.forEach((c, i) => page.drawText(c, { x: 40 + i * 140, y: 760 - r * 22, size: 10, font })))
  return Buffer.from(await doc.save())
}

describe('cover labels', () => {
  it('names the cover a label speaks of', () => {
    expect(coverOfLabel('Group Hospital & Surgical (GHS)')).toBe('hs')
    expect(coverOfLabel('Outpatient Specialist')).toBe('sp')
    expect(coverOfLabel('Clinical GP')).toBe('gp')
    expect(coverOfLabel('GP')).toBe('gp')
    expect(coverOfLabel('Major Medical')).toBe('mm')
    expect(coverOfLabel('Group Term Life')).toBeNull()
    expect(coverOfLabel('S Pass holders')).toBeNull()
  })
})

describe('spreadsheet schedules', () => {
  it('covers across a header row, one row per category, with the cell each figure came from', () => {
    const s = readScheduleSheets('QBE pricing.xlsx', sheetRows([
      ['QBE Steadfast MCare+ renewal pricing'],
      ['Category', 'Lives', 'GHS', 'GP', 'Dental', 'Total'],
      ['Directors', 18, 12303.82, 6988, 6247.5, 25539.32],
      ['Staff', 40, '8,100.00', 5200, 0, 13300],
      ['Total', 58, 20403.82, 12188, 6247.5, 38839.32],
    ]), 'Steadfast MCare+')
    expect(s.readBy).toBe('code')
    expect(s.figures.find(f => f.cover === 'hs' && f.category === 'Directors')).toMatchObject({ premium: 12303.82, status: 'read', source: 'QBE pricing.xlsx · Quote!C3' })
    expect(s.figures.find(f => f.cover === 'gd' && f.category === 'Staff')).toMatchObject({ premium: null, status: 'missing' })
    expect(s.total).toEqual({ premium: 38839.32, source: 'QBE pricing.xlsx · Quote!F5' })
    expect(schedulePremium(s, 'hs')).toMatchObject({ premium: 20403.82, status: 'read' })
    expect(schedulePremium(s, 'mm').premium).toBeNull()
  })
  it('covers down a label column, the premium column chosen over rate and lives', () => {
    const s = readScheduleSheets('aia.xlsx', sheetRows([
      ['Benefit', 'No. of lives', 'Rate per life', 'Annual premium (S$)', 'Premium incl. GST'],
      ['Hospital & Surgical', 58, 420, 24360, 26552.4],
      ['Major Medical', 58, 0, 0, 0],
      ['Outpatient GP', 58, 120, 6960, 7586.4],
      ['Total premium', '', '', 31320, 34138.8],
    ]))
    expect(s.figures.find(f => f.cover === 'hs')).toMatchObject({ premium: 24360, status: 'read', source: 'aia.xlsx · Quote!D2' })
    expect(s.figures.find(f => f.cover === 'mm')).toMatchObject({ premium: null, status: 'missing' })
    expect(s.total?.premium).toBe(31320)
    expect(scheduleSummary(s)).toBe('2 figures read · 1 missing')
  })
  it('one column per category when the columns are named for categories', () => {
    const s = readScheduleSheets('rcc.xlsx', sheetRows([['Cover', 'Directors', 'Staff'], ['GHS', 5000, 7000], ['Dental', 900, 1100]]))
    expect(s.figures.filter(f => f.cover === 'hs').map(f => [f.category, f.premium])).toEqual([['Directors', 5000], ['Staff', 7000]])
  })
  it('two figures for the same cover that disagree are marked to check', () => {
    const s = readScheduleSheets('x.xlsx', sheetRows([['GHS', 'GP'], [1000, 200], ['Notes'], ['GHS', 'GP'], [1100, 200]]))
    expect(s.figures.length).toBeGreaterThan(0)
    const twice = readScheduleSheets('y.xlsx', [{ name: 'A', rows: [['Cover', 'Premium'], ['GHS', 1000], ['Hospital & Surgical', 1200]] }])
    expect(twice.figures.find(f => f.cover === 'hs')?.status).toBe('check')
    expect(twice.notes.join(' ')).toMatch(/1000.*1200/)
  })
  it('nothing read says so', () => {
    expect(readScheduleSheets('z.xlsx', sheetRows([['Hello'], ['World']])).figures).toEqual([])
  })
})

describe('PDF schedules', () => {
  it('reads cover lines with an amount on pages that speak of premium, page kept', async () => {
    const buf = await pdfOf([
      ['Singlife MyBenefits Plus quotation'],
      ['Annual premium summary'],
      ['Hospital & Surgical', 'S$18,450.00'],
      ['Outpatient GP', 'S$4,200.00'],
      ['Dental', ''],
      ['Total premium', 'S$22,650.00'],
    ])
    const pages = await pdfPages(buf)
    const s = readSchedulePdf('singlife.pdf', pages, 'Singlife MyBenefits Plus')
    expect(s.figures.find(f => f.cover === 'hs')).toMatchObject({ premium: 18450, status: 'read', source: 'singlife.pdf · page 1' })
    expect(s.figures.find(f => f.cover === 'gp')?.premium).toBe(4200)
    expect(s.figures.find(f => f.cover === 'gd')?.status).toBe('missing')
    expect(s.total?.premium).toBe(22650)
  })
  it('limits and benefit rows are not premiums', () => {
    const s = readSchedulePdf('b.pdf', [{ num: 2, text: 'Premium schedule\nHospital & Surgical\tAnnual limit\t$60,000\nHospital & Surgical\t$9,100.00' }])
    expect(s.figures).toEqual([{ cover: 'hs', category: null, premium: 9100, source: 'b.pdf · page 2', status: 'read' }])
  })
})

describe('Read with AI, bounded', () => {
  const text = 'AIA quotation\nGroup Hospital & Surgical premium S$12,345.60\nGP premium S$2,000.00'
  it('a figure found word for word in the text is read; one not found is to check; out of range is dropped', () => {
    const s = normaliseScheduleRead({ insurer: 'AIA Singapore', figures: [
      { cover: 'GHS', premium: '12,345.60', page: 1, excerpt: 'Group Hospital & Surgical premium S$12,345.60' },
      { cover: 'GOPC', premium: 2500, page: 1, excerpt: 'GP premium S$2,500.00' },
      { cover: 'GD', premium: 99_000_000, page: 1, excerpt: 'x' },
      { cover: 'GTL', premium: 100, page: 1, excerpt: 'x' },
    ] }, 'aia.pdf', text)
    expect(s.readBy).toBe('model')
    expect(s.insurer).toBe('AIA Flexi Vital Care Plus')
    expect(s.figures.find(f => f.cover === 'hs')).toMatchObject({ premium: 12345.6, status: 'read', source: 'aia.pdf · page 1 · read with AI' })
    expect(s.figures.find(f => f.cover === 'gp')?.status).toBe('check')
    expect(s.figures.find(f => f.cover === 'gd')).toMatchObject({ premium: null, status: 'missing' })
    expect(s.figures.some(f => (f.cover as string) === 'tl')).toBe(false)
  })
  it('a scan (no text) leaves every figure to check', () => {
    expect(normaliseScheduleRead({ figures: [{ cover: 'GHS', premium: 100, excerpt: 'GHS 100' }] }, 's.pdf', null).figures[0].status).toBe('check')
  })
})

describe('census PDF', () => {
  it('a tabular PDF is read by the census code, rows from tab-separated cells', async () => {
    const buf = await pdfOf([
      ['Name', 'Date of birth', 'Relationship', 'Category'],
      ['Tan Ah Kow', '12/03/1970', 'Employee', 'Directors'],
      ['Lim Mei', '05/06/1972', 'Spouse', 'Directors'],
      ['Ong Bee', '01/02/1990', 'Employee', 'Staff'],
    ])
    const pages = await pdfPages(buf)
    expect(pdfRows(pages)[0]).toEqual(['Name', 'Date of birth', 'Relationship', 'Category'])
    const r = censusFromPdfText(pages)
    expect(r.members.map(m => [m.name, m.dob, m.relationship, m.category])).toEqual([
      ['Tan Ah Kow', '1970-03-12', 'self', 'Directors'], ['Lim Mei', '1972-06-05', 'spouse', 'Directors'], ['Ong Bee', '1990-02-01', 'self', 'Staff'],
    ])
  })
  it('a PDF with no table reads no one, and says why', () => {
    expect(censusFromPdfText([{ text: 'Dear HR, please see attached.' }]).members).toEqual([])
  })
  it('a model transcription is bounded and parsed by the census code: dates as written, never the model’s age', () => {
    const r = normaliseCensusRead({ people: [
      { name: 'Tan Ah Kow', dob: '12/03/1970', relationship: 'Employee', category: 'Directors', plan: 'Plan 1 (PTE 1-bed)' },
      { name: 'Lim Mei', dob: '31/02/1972', relationship: 'Spouse', category: 'Directors' },
      { name: '', dob: '01/01/1990' },
      'junk',
    ] })
    expect(r.members).toHaveLength(2)
    expect(r.members[0]).toMatchObject({ dob: '1970-03-12', relationship: 'self', category: 'Directors', plans: { GHS: 'Plan 1 (PTE 1-bed)' } })
    expect(r.members[1].dob).toBeNull()
    expect(r.unread[0]).toMatch(/31\/02\/1972/)
  })
})
