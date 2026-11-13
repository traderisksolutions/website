/**
 * A file the last-year read can send: PDFs and images as they are, spreadsheets as text.
 * Shared by New quotation's read and Compare cover's upload. Server only.
 */
import { workbookSheets } from '@/lib/xlsx-text'

export const LAST_YEAR_MAX_BYTES = 20 * 1024 * 1024
const MIME: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', heic: 'image/heic' }

export async function lastYearPart(name: string, bytes: Buffer): Promise<{ name: string; mime: string; bytes: Buffer } | null> {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (MIME[ext]) return { name, mime: MIME[ext], bytes }
  if (/^xls[xm]?$|^csv$/.test(ext)) {
    const text = ext === 'csv' ? bytes.toString('utf8') : (await workbookSheets(bytes)).map(s => `## ${s.name}\n${s.text}`).join('\n\n')
    return { name, mime: 'text/plain', bytes: Buffer.from(text.slice(0, 400_000), 'utf8') }
  }
  return null
}
