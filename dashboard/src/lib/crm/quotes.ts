/**
 * The quotations prepared for a company — Pricing Matrix quotations (gb_quotations), matched by
 * company name. A read model: nothing here is written.
 *
 * Two other sources were read until 2 Oct 2026 and both are gone: RFQ lines, retired with the RFQ
 * workflow, and the old pricing-matrix quotations (pm_quotations), retired when Group Benefits
 * became Pricing Matrix. Their tables are kept; nothing reads them.
 */
import { sbTry } from './db'
import type { Company, QuoteRow } from './types'

type GbRow = { id: string; company_name: string | null; effective_date: string | null; member_count: number | null; created_at: string }

const QUOTE_FRESH_DAYS = 60

export async function listCompanyQuotes(company: Company): Promise<QuoteRow[]> {
  // Plain URL-encoding: PostgREST treats double quotes in an ilike value literally.
  const rows = await sbTry<GbRow[]>(`gb_quotations?company_name=ilike.${encodeURIComponent(company.name)}` +
    `&select=id,company_name,effective_date,member_count,created_at&order=created_at.desc`, [])
  const freshCutoff = Date.now() - QUOTE_FRESH_DAYS * 86_400_000
  // The quotation pages were deleted on 20 Nov 2026: each opens its re-priced proposal, else the register.
  const moved = rows.length ? await sbTry<{ id: string; legacy_gb_id: string }[]>(`eb_quotations?legacy_gb_id=in.(${rows.map(g => g.id).join(',')})&select=id,legacy_gb_id`, []) : []
  const proposal = new Map(moved.map(e => [e.legacy_gb_id, e.id]))
  return rows.map((g): QuoteRow => ({
    id: g.id, kind: 'pricing_matrix', title: 'Pricing Matrix quotation',
    status: 'Prepared', isOpen: new Date(g.created_at).getTime() > freshCutoff,
    created_at: g.created_at, effective_date: g.effective_date, productLine: 'group_benefits', memberCount: g.member_count,
    href: proposal.has(g.id) ? `/eb/proposal/${proposal.get(g.id)}` : '/eb/quotations',
  }))
}
