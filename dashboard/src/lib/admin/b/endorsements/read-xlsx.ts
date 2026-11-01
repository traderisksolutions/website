/** Turns a spreadsheet or CSV into rows of cells for parse-sheet.ts. Dates come back as Date objects. */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require('xlsx') as typeof import('xlsx')

export const isSpreadsheet = (filename: string, mime?: string | null) =>
  /\.(xlsx|xlsm|xls|csv)$/i.test(filename) || /spreadsheet|ms-excel|text\/csv/i.test(mime ?? '')

/** Every sheet's rows, first sheet first. A file that is not a workbook returns no sheets. */
export function sheetRows(bytes: Buffer, filename: string): { name: string; rows: unknown[][] }[] {
  try {
    const wb = XLSX.read(bytes, { type: 'buffer', cellDates: true, raw: false })
    return wb.SheetNames.slice(0, 6).map(name => {
      const ws = wb.Sheets[name]
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: false }) as unknown[][]
      return { name, rows: rows.slice(0, 2000) }
    })
  } catch {
    if (!/\.csv$/i.test(filename)) return []
    const text = bytes.toString('utf8')
    return [{ name: 'csv', rows: text.split(/\r?\n/).filter(Boolean).map(l => l.split(',').map(c => c.trim().replace(/^"|"$/g, ''))) }]
  }
}
