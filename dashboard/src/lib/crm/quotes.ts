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
  return rows.map((g): QuoteRow => ({
    id: g.id, kind: 'pricing_matrix', title: 'Pricing Matrix quotation',
    status: 'Prepared', isOpen: new Date(g.created_at).getTime() > freshCutoff,
    created_at: g.created_at, effective_date: g.effective_date, productLine: 'group_benefits', memberCount: g.member_count,
    href: `/pricing-matrix/quote/${g.id}`,
  }))
}
