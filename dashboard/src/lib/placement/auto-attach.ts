/**
 * When the group benefits agent prices a client's member list from an email, the prices land on
 * the company's open employee-benefits line at once, so the company page moves without a person
 * uploading the same list again. One line only: when a company has two open EB lines, nobody
 * guesses, and the quotation waits for a person (attachQuotation from the page).
 *
 * Idempotent: a line that already carries this quotation's engine prices is left alone.
 */
import { sbTry, enc } from '@/lib/crm/db'
import { attachQuotation } from './eb'

type LineRow = { id: string; placement_id: string; status: string; done_at: string | null; created_at: string }
const OPEN = new Set(['open', 'quoting', 'quoted'])

/** The one open employee-benefits line of a company, or null when there is none or more than one. */
export async function openEbLine(companyId: string): Promise<LineRow | null> {
  const placements = await sbTry<{ id: string }[]>(`placements?company_id=eq.${enc(companyId)}&status=eq.open&select=id`, [])
  if (!placements.length) return null
  const lines = await sbTry<LineRow[]>(`placement_lines?placement_id=in.(${placements.map(p => p.id).join(',')})&product_line=eq.employee_benefits&done_at=is.null&select=id,placement_id,status,done_at,created_at&order=created_at.desc`, [])
  const open = lines.filter(l => OPEN.has(l.status))
  return open.length === 1 ? open[0] : null
}

export type AutoAttach = { lineId: string; filed: number } | { lineId: string | null; skipped: string }

export async function attachQuotationToOpenLine(companyId: string | null, quotationId: string, actor: string): Promise<AutoAttach> {
  if (!companyId) return { lineId: null, skipped: 'no company on the thread' }
  const line = await openEbLine(companyId)
  if (!line) return { lineId: null, skipped: 'no single open employee-benefits line' }
  const have = await sbTry<{ id: string }[]>(`placement_quotes?line_id=eq.${line.id}&engine_run_id=eq.${enc(quotationId)}&status=neq.superseded&select=id&limit=1`, [])
  if (have.length) return { lineId: line.id, skipped: 'already on the line' }
  const filed = await attachQuotation(line.id, quotationId, actor)
  return { lineId: line.id, filed }
}
