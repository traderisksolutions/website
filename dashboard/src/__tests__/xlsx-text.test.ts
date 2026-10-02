/**
 * The census arrives as a spreadsheet. Its dates must reach the agent in an order nobody has to
 * guess, whatever format the sender gave the column.
 */
import { describe, it, expect } from 'vitest'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require('xlsx') as typeof import('xlsx')
import { xlsxSheetsAsText } from '@/lib/xlsx-text'

function book(cells: Record<string, unknown>): Buffer {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, { '!ref': 'A1:A6', ...cells } as never, 'Census')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

describe('xlsxSheetsAsText', () => {
  it('writes every date cell as YYYY-MM-DD, whatever its display format', () => {
    // 26291 = 24 Dec 1971, 26554 = 12 Sep 1972, 45763 = 16 Apr 2025 (Excel serials)
    const text = xlsxSheetsAsText(book({
      A1: { t: 's', v: 'dob' },
      A2: { t: 'n', v: 26291, z: 'm/d/yy' },        // Excel's default — rendered 12/24/71 before
      A3: { t: 'n', v: 26554, z: 'dd/mm/yyyy' },
      A4: { t: 'n', v: 26554, z: 'd-mmm-yy' },
      A5: { t: 'n', v: 45763, z: 'yyyy-mm-dd' },
    }))[0].text
    expect(text.split('\n').filter(Boolean)).toEqual(['dob', '1971-12-24', '1972-09-12', '1972-09-12', '2025-04-16'])
  })

  it('leaves a date typed as text exactly as typed, for the day-first parser', () => {
    const text = xlsxSheetsAsText(book({ A1: { t: 's', v: 'dob' }, A2: { t: 's', v: '12/09/1972' } }))[0].text
    expect(text.split('\n').filter(Boolean)).toEqual(['dob', '12/09/1972'])
  })

  it('does not turn an ordinary number into a date', () => {
    const text = xlsxSheetsAsText(book({ A1: { t: 's', v: 'age' }, A2: { t: 'n', v: 41 }, A3: { t: 'n', v: 26291, z: '0' } }))[0].text
    expect(text.split('\n').filter(Boolean)).toEqual(['age', '41', '26291'])
  })
})
