import { describe, it, expect } from 'vitest'
import { a1, detectGrid, detectPdfPage, findTerms, figureRunEnd, isFigureCell, type TextItem } from '@/lib/commission/detect'

const item = (str: string, x: number, y: number, size = 10): TextItem => ({ str, x, y, w: str.length * size * 0.5, h: size })
const terms = (s: string) => findTerms(s).map(t => t.text.toLowerCase())

describe('findTerms', () => {
  it('finds every commission term', () => {
    expect(terms('Commission')).toEqual(['commission'])
    expect(terms('Commission Rate')).toEqual(['commission rate'])
    expect(terms('commission amount')).toEqual(['commission amount'])
    expect(terms('Commissions payable')).toEqual(['commissions'])
    expect(terms('Brokerage 10%')).toEqual(['brokerage'])
    expect(terms('Comm %')).toEqual(['comm %'])
    expect(terms('Comm. 15%')).toEqual(['comm.'])
    expect(terms('Comm rate')).toEqual(['comm rate'])
    expect(terms('Broker fee')).toEqual(['broker fee'])
    expect(terms("Broker's fee")).toEqual(["broker's fee"])
    expect(terms('Brokers fees')).toEqual(['brokers fees'])
    expect(terms('Agency fee')).toEqual(['agency fee'])
  })
  it('does not take words that only start with commission', () => {
    for (const s of ['Commissioning date 1 Jan 2026', 'Plant commissioned 2019', 'Commissioner of Insurance', 'decommissioned 2020', 'Community 2,000', 'Commercial 5,000', 'Committee 3']) {
      expect(findTerms(s), s).toEqual([])
    }
  })
  it('does not take a brokerage firm name', () => {
    expect(findTerms('ABC Insurance Brokerage Pte Ltd')).toEqual([])
    expect(findTerms('Brokerage Services Group')).toEqual([])
  })
})

describe('figures', () => {
  it('reads a figure run after a term', () => {
    const s = 'Commission (15%) SGD 1,500.00'
    expect(s.slice(0, figureRunEnd(s, 'Commission'.length)!)).toBe(s)
    const t = 'Commission rate: 12.5%'
    expect(figureRunEnd(t, 'Commission'.length)).toBe(t.length)
    expect(figureRunEnd('Commission of 15% of premium', 'Commission'.length)).toBe('Commission of 15%'.length)
  })
  it('stops at a word', () => {
    expect(figureRunEnd('Commission is paid by the insurer 2026', 'Commission'.length)).toBeNull()
    expect(figureRunEnd('Commission Rate Premium 1,000', 'Commission Rate'.length)).toBeNull()
  })
  it('cell figures', () => {
    expect(isFigureCell(1500)).toBe(true)
    expect(isFigureCell('15%')).toBe(true)
    expect(isFigureCell('SGD 1,500.00')).toBe(true)
    expect(isFigureCell('S$1,500')).toBe(true)
    expect(isFigureCell('(1,500)')).toBe(true)
    expect(isFigureCell('Premium')).toBe(false)
    expect(isFigureCell('')).toBe(false)
  })
})

describe('detectPdfPage: rows', () => {
  it('blanks the term and its figures on the same line, not the line above', () => {
    const items = [item('Premium', 50, 700), item('SGD 10,000.00', 300, 700), item('Commission (15%)', 50, 680), item('SGD 1,500.00', 300, 680)]
    const hits = detectPdfPage(items, 2)
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ page: 2, kind: 'row', text: 'Commission (15%) SGD 1,500.00' })
    // boxes cover y≈680 only and reach x=300+
    for (const b of hits[0].boxes) { expect(b.y).toBeLessThan(690); expect(b.y + b.h).toBeGreaterThan(680) }
    expect(Math.max(...hits[0].boxes.map(b => b.x + b.w))).toBeGreaterThan(300 + 'SGD 1,500.00'.length * 5 - 1)
    expect(hits[0].boxes.every(b => b.y + b.h < 700)).toBe(true)
  })
  it('keeps the premium when both sit in one item', () => {
    const it0 = item('Premium 10,000 Commission 1,500', 50, 600)
    const [h] = detectPdfPage([it0], 1)
    expect(h.text).toBe('Commission 1,500')
    expect(h.boxes[0].x).toBeGreaterThan(50 + 'Premium 10,000'.length * 5 - 10)
  })
  it('catches a figure before the term', () => {
    const [h] = detectPdfPage([item('15% commission applies', 50, 500)], 1)
    expect(h.text).toBe('15% commission')
  })
  it('ignores prose and look-alikes without figures', () => {
    const items = [
      item('Commission is payable by the insurer to the broker.', 50, 700),
      item('Commissioning date', 50, 680), item('1 January 2026', 300, 680),
      item('Plant commissioned in 2019 at 3,000 MW', 50, 660),
      item('Monetary Authority and Securities Commission', 50, 640),
    ]
    expect(detectPdfPage(items, 1)).toEqual([])
  })
})

describe('detectPdfPage: columns', () => {
  const header = [item('Plan', 50, 700), item('Premium', 200, 700), item('Comm %', 320, 700), item('Commission', 420, 700)]
  const row = (y: number, plan: string, prem: string, pct: string, amt: string) => [item(plan, 50, y), item(prem, 200, y), item(pct, 325, y), item(amt, 420, y)]
  const items = [...header, ...row(685, 'GHS A', '12,000.00', '15%', '1,800.00'), ...row(670, 'GTL', '3,000.00', '10%', '300.00'), item('Notes', 50, 640), item('Subject to underwriting', 200, 640)]

  it('blanks both commission columns and nothing in the premium column', () => {
    const hits = detectPdfPage(items, 1)
    expect(hits.map(h => h.kind)).toEqual(['column', 'column'])
    const boxes = hits.flatMap(h => h.boxes)
    // 2 headers + 4 cells
    expect(boxes).toHaveLength(6)
    expect(boxes.every(b => b.x > 300)).toBe(true)
    expect(hits[0].text).toContain('15%')
    expect(hits[1].text).toContain('1,800.00')
  })
  it('stops at the end of the table', () => {
    const hits = detectPdfPage([...items, item('Total', 50, 600), item('99.00', 420, 600)], 1)
    expect(hits.flatMap(h => h.boxes).some(b => b.y < 620)).toBe(false)
  })
  it('a lone heading is not a column', () => {
    expect(detectPdfPage([item('Commission', 50, 700), item('1,000', 50, 680)], 1)).toEqual([])
  })
})

describe('detectGrid', () => {
  it('row label: term and the figures to its right', () => {
    const hits = detectGrid([['Premium', 10000], ['Commission', '15%', 1500], ['Total', 11500]], 'Quote')
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ sheet: 'Quote', kind: 'row', cell: 'A2:C2' })
    expect(hits[0].cells).toEqual([[1, 0], [1, 1], [1, 2]])
  })
  it('column header: the whole column below', () => {
    const rows = [['Plan', 'Premium', 'Commission Rate', 'Commission Amount'], ['GHS', 12000, 0.15, 1800], ['GTL', 3000, 0.1, 300], [], ['Total', 15000, null, 2100]]
    const hits = detectGrid(rows)
    expect(hits.map(h => h.cell)).toEqual(['C1:C5', 'D1:D5'])
    expect(hits[1].cells).toEqual([[0, 3], [1, 3], [2, 3], [4, 3]])
    expect(hits.flatMap(h => h.cells).some(([, c]) => c === 1)).toBe(false)
  })
  it('a term with its figure in one cell', () => {
    const [h] = detectGrid([['Brokerage: 10% of premium']])
    expect(h).toMatchObject({ kind: 'cell', cell: 'A1' })
  })
  it('ignores look-alikes and prose', () => {
    expect(detectGrid([['Commissioning date', 45000], ['Commissioned', 2019], ['ABC Brokerage Pte Ltd', '6123 4567'], ['Commission', 'paid by insurer']])).toEqual([])
  })
  it('a1 names', () => {
    expect(a1(0, 0)).toBe('A1')
    expect(a1(9, 25)).toBe('Z10')
    expect(a1(0, 26)).toBe('AA1')
  })
})
