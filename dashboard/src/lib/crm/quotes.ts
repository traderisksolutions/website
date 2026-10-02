/**
 * One list of quotations for a company, across the two places quoting happens:
 *   - Pricing-matrix quotations (pm_quotations) — group benefits priced from insurer calculators
 *   - Group-benefits quotations (gb_quotations) — matched by company name
 * Nothing here is written; it is a read model so the company page can show quoting activity
 * without knowing which engine produced it.
 *
 * RFQ lines (rfq_requests and their insurer dispatches) were a third source until the RFQ
 * workflow was retired on 2 Oct 2026. The tables are kept; nothing reads them.
 */
import { sbTry } from './db'
import type { Company, QuoteRow } from './types'

type PmRow  = { id: string; company_id: string | null; company_name: string | null; effective_date: string | null; member_count: number | null; created_at: string; calculator_ids: string[] | null }
type GbRow  = { id: string; company_name: string | null; effective_date: string | null; member_count: number | null; created_at: string }

const QUOTE_FRESH_DAYS = 60

export async function listCompanyQuotes(company: Company): Promise<QuoteRow[]> {
  // Plain URL-encoding: PostgREST treats double quotes in an ilike value literally.
  const nameFilter = `company_name=ilike.${encodeURIComponent(company.name)}`

  const [pmById, pmByName, gbByName] = await Promise.all([
    sbTry<PmRow[]>(`pm_quotations?company_id=eq.${company.id}&select=id,company_id,company_name,effective_date,member_count,created_at,calculator_ids&order=created_at.desc`, []),
    sbTry<PmRow[]>(`pm_quotations?${nameFilter}&select=id,company_id,company_name,effective_date,member_count,created_at,calculator_ids&order=created_at.desc`, []),
    sbTry<GbRow[]>(`gb_quotations?${nameFilter}&select=id,company_name,effective_date,member_count,created_at&order=created_at.desc`, []),
  ])

  const freshCutoff = Date.now() - QUOTE_FRESH_DAYS * 86_400_000
  const pmMap = new Map<string, PmRow>()
  for (const p of [...pmById, ...pmByName]) pmMap.set(p.id, p)

  const rows: QuoteRow[] = [
    ...Array.from(pmMap.values()).map((p): QuoteRow => ({
      id: p.id, kind: 'pricing_matrix', title: `Group benefits quote (${p.calculator_ids?.length ?? 0} insurer${(p.calculator_ids?.length ?? 0) === 1 ? '' : 's'})`,
      status: 'Prepared', isOpen: new Date(p.created_at).getTime() > freshCutoff,
      created_at: p.created_at, effective_date: p.effective_date, productLine: 'group_benefits', memberCount: p.member_count,
      href: `/pricing-matrix/quote/${p.id}`,
    })),
    ...gbByName.map((g): QuoteRow => ({
      id: g.id, kind: 'group_benefits', title: 'Group benefits quotation',
      status: 'Prepared', isOpen: new Date(g.created_at).getTime() > freshCutoff,
      created_at: g.created_at, effective_date: g.effective_date, productLine: 'group_benefits', memberCount: g.member_count,
      // /group-benefits/{id} is the insurer RATE TABLE page, not the quotation; every link here
      // used to open the wrong page.
      href: `/group-benefits/quote/${g.id}`,
    })),
  ]
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at))
}
