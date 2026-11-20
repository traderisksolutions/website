/**
 * A census sent as a PDF (call note 19). Code first: pdf-parse writes each table row as a line with
 * its cells tab-separated, and those rows go through the same census reading as a spreadsheet
 * (censusFromRows). A scan or a layout that yields no rows waits for a person's Read with AI, whose
 * read is bounded here (normaliseCensusRead) and then read by the same code: names, dates of birth
 * and categories are parsed by census-parse, never taken as the model's figures.
 *
 * Pure. Tested in src/__tests__/gb-census-pdf.test.ts.
 */
import { censusFromRows, type CensusRead } from './census-parse'

/** PDF text pages as rows of cells. */
export function pdfRows(pages: { text: string }[]): string[][] {
  return pages.flatMap(p => p.text.split(/\r?\n/)).map(l => l.split('\t').map(c => c.replace(/\s+/g, ' ').trim())).filter(r => r.some(Boolean))
}

/** The census in a PDF's text, read as a spreadsheet would be. */
export function censusFromPdfText(pages: { text: string }[]): CensusRead {
  return censusFromRows(pdfRows(pages))
}

const HEADER = ['Name', 'Date of birth', 'Age', 'Relationship', 'Category', 'GHS Plan', 'Occupation class']
const cell = (v: unknown, n: number) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '').replace(/[\t\r\n]+/g, ' ').trim().slice(0, n)

/** A model's census transcription, bounded (3,000 people, short strings) and read by the census code. */
export function normaliseCensusRead(raw: unknown): CensusRead {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { people?: unknown }
  const people = (Array.isArray(r.people) ? r.people : []).slice(0, 3000) as Record<string, unknown>[]
  const rows = people.map(p => [cell(p?.name, 120), cell(p?.dob, 20), cell(p?.age, 3), cell(p?.relationship, 30), cell(p?.category, 80), cell(p?.plan, 60), cell(p?.occupation_class, 10)])
    .filter(x => x[0])
  return censusFromRows([HEADER, ...rows])
}

export const CENSUS_READ_PROMPT = `You transcribe an employee census (member listing) for a Singapore insurance broker. Copy each person exactly as written. Never compute, guess or fill in.
Return JSON only: {"people":[{"name":"as written","dob":"as written or null","age":"as written or null","relationship":"Employee|Spouse|Child as written","category":"the category, class or grade column as written or null","plan":"the hospital plan as written or null","occupation_class":"as written or null"}]}
Rules: one entry per row of the listing, dependants included; keep dates exactly as written (do not reformat); leave a field null when the document does not show it; skip totals and headings.`
