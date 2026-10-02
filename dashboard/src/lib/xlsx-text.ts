/**
 * A spreadsheet as text, with every date written YYYY-MM-DD.
 *
 * Attachments are turned into text before an agent reads them, and the census of a group
 * benefits quote usually arrives this way. The spreadsheet library renders a date cell in its
 * default format month-first with a two-digit year — 24 Dec 1971 became "12/24/71", 12 Sep 1972
 * became "9/12/72" — and the agent was then asked to normalise the dates. A Singapore reader
 * takes 9/12/72 to be 9 December. Nothing in the text said which order it was in.
 *
 * So date cells are written from their underlying serial number, as ISO, whatever their display
 * format. No timezone is involved: the serial is a calendar day, and it is decoded as one. Text
 * that only looks like a date ("24/12/1971" typed into a text cell) is left exactly as typed, and
 * read day-first later by src/lib/dates/dob.ts.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require('xlsx') as typeof import('xlsx')

const pad = (n: number) => String(n).padStart(2, '0')

type Cell = { t?: string; v?: unknown; w?: string; z?: string | number }

/** Rewrite every date cell's displayed text as YYYY-MM-DD, in place. */
function isoDates(sheet: Record<string, unknown>): void {
  for (const [addr, raw] of Object.entries(sheet)) {
    if (addr.startsWith('!')) continue
    const c = raw as Cell
    if (c.t === 'n' && typeof c.v === 'number' && c.z != null && XLSX.SSF.is_date(c.z as string)) {
      const p = XLSX.SSF.parse_date_code(c.v)
      if (p && p.y) c.w = `${p.y}-${pad(p.m)}-${pad(p.d)}`
    }
  }
}

export function xlsxSheetsAsText(buf: Buffer | Uint8Array, maxPerSheet = 10_000): { name: string; text: string }[] {
  // cellNF keeps each cell's number format, which is how a date cell is recognised as one.
  const wb = XLSX.read(buf, { type: 'buffer', cellNF: true, dateNF: 'yyyy-mm-dd' })
  return wb.SheetNames.map(name => {
    const sheet = wb.Sheets[name] as unknown as Record<string, unknown>
    isoDates(sheet)
    return { name, text: XLSX.utils.sheet_to_csv(wb.Sheets[name]).slice(0, maxPerSheet) }
  })
}
