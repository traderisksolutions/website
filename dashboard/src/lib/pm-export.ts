/**
 * Pricing Matrix — Phase 3: per-insurer CSV export.
 *
 * One CSV per insurer, built deterministically from the stored quote results (numbers are copied,
 * never recomputed). Columns mirror that insurer's workbook breakdown: one premium column per
 * coverage line, plus a Subtotal, a Total row and Average-per-life — the same shape a broker sees
 * in the insurer's own spreadsheet.
 */
import type { CensusMember, Selection, QuoteResult } from '@/lib/pm-quote'
import { categoryFor } from '@/lib/pm-quote'

export type QuoteRow = {
  company_name: string | null
  effective_date: string | null
  census: CensusMember[]
  selections: Record<string, Selection>
  results: QuoteResult | null
}

const fmt = (n: number | null | undefined) => (typeof n === 'number' ? n.toFixed(2) : '')

/** CSV-escape a single field. */
function esc(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const line = (cells: (string | number | null | undefined)[]) => cells.map(esc).join(',')

/** Human-readable one-liner of the plan basis for an insurer, e.g. "HS: Plan 1 / Private Hospital …". */
function planBasis(sel: Selection | undefined): string {
  if (!sel) return ''
  return Object.entries(sel)
    .map(([code, fields]) => `${code}: ${Object.values(fields).filter(Boolean).join(' / ')}`)
    .join('; ')
}

export function insurerFilename(company: string | null, insurerName: string): string {
  const clean = (s: string) => s.replace(/[^\w -]+/g, '').replace(/\s+/g, '-').slice(0, 40)
  const parts = [company ? clean(company) : null, clean(insurerName), 'quote'].filter(Boolean)
  return parts.join('_') + '.csv'
}

/** Build the CSV text for one insurer within a quote. Throws if the insurer isn't in the results. */
export function buildInsurerCsv(quote: QuoteRow, calculatorId: string): { filename: string; csv: string } {
  const ins = quote.results?.insurers.find(i => i.calculator_id === calculatorId)
  if (!ins) throw new Error('insurer not found in quote results')

  const labels = ins.coverage_lines
  const namedCensus = (quote.census ?? []).filter(m => (m.name ?? '').trim() || m.date_of_birth || m.age != null)

  const rows: string[] = []
  rows.push(line([`Pricing Matrix Quote — ${ins.insurer_name}`]))
  rows.push(line(['Company', quote.company_name]))
  rows.push(line(['Effective date', quote.effective_date ?? ins.effective_date]))
  rows.push(line(['Plan basis', planBasis(quote.selections?.[calculatorId])]))
  rows.push(line(['Lives', ins.member_count]))
  rows.push(line(['Generated', new Date().toISOString()]))
  rows.push('')

  rows.push(line(['No', 'Name', 'Relationship', 'Category', ...labels.map(l => l.label), 'Subtotal']))
  ins.members.forEach((m, i) => {
    const cm = namedCensus[i]  // results.members preserve census order
    rows.push(line([
      i + 1, m.name, cm?.relationship ?? '', cm ? categoryFor(cm) : '',
      ...labels.map(l => fmt(m.lines[l.code])), fmt(m.subtotal),
    ]))
  })

  rows.push(line(['', '', '', 'Total', ...labels.map(l => fmt(ins.by_line[l.code])), fmt(ins.grand)]))
  rows.push(line(['', '', '', 'Average per life', ...labels.map(() => ''), fmt(ins.avg_per_life)]))

  return { filename: insurerFilename(quote.company_name, ins.insurer_name), csv: rows.join('\r\n') }
}
