/**
 * One list of "quotes in flight" for a company, across the three places quoting happens:
 *   - RFQ lines (rfq_requests) inside Nexus cases — general insurance sent to insurers
 *   - Pricing-matrix quotations (pm_quotations) — group benefits priced from insurer calculators
 *   - Group-benefits quotations (gb_quotations) — the earlier GB flow, matched by company name
 * Nothing here is written; it is a read model so the company page and the pipeline can show
 * quoting activity without knowing which engine produced it.
 */
import { sbTry, inChunks, enc } from './db'
import { listCompanyCaseIds } from './cases'
import type { Company, QuoteRow, QuoteDispatch } from './types'

type RfqRow = { id: string; case_id: string; client_thread_id: string | null; product_line: string; insured_name: string | null; status: string; created_at: string }
type PmRow  = { id: string; company_id: string | null; company_name: string | null; effective_date: string | null; member_count: number | null; created_at: string; calculator_ids: string[] | null }
type GbRow  = { id: string; company_name: string | null; effective_date: string | null; member_count: number | null; created_at: string }
type DispatchRow = { id: string; rfq_request_id: string; insurer_name: string | null; to_email: string | null; status: string; thread_id: string | null; created_at: string; updated_at: string }
type QuoteDetailRow = { rfq_request_id: string | null; dispatch_id: string | null; premium: string | null; excess: string | null; limit_indemnity: string | null; validity: string | null; status: string | null; primary_source: string | null }

const RFQ_OPEN = new Set(['open', 'dispatched', 'quoted', 'recommended'])
const RFQ_LABEL: Record<string, string> = {
  open: 'Not sent yet', dispatched: 'Sent to insurers', quoted: 'Quotes received', recommended: 'Recommended',
  selected: 'Selected', not_chosen: 'Not chosen', won: 'Won', lost: 'Lost', closed: 'Closed',
}
const QUOTE_FRESH_DAYS = 60

const prettyLine = (slug: string | null) => (slug ?? '').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Insurance'

export async function listCompanyQuotes(company: Company, threadIds: string[]): Promise<QuoteRow[]> {
  const caseIds = await listCompanyCaseIds(company.id, threadIds)
  // Plain URL-encoding: PostgREST treats double quotes in an ilike value literally.
  const nameFilter = `company_name=ilike.${enc(company.name)}`

  const [rfqByCase, rfqByThread, pmById, pmByName, gbByName] = await Promise.all([
    caseIds.length ? inChunks(caseIds, 100, c => sbTry<RfqRow[]>(`rfq_requests?case_id=in.(${c.join(',')})&select=id,case_id,client_thread_id,product_line,insured_name,status,created_at`, [])) : Promise.resolve([] as RfqRow[]),
    threadIds.length ? inChunks(threadIds, 100, c => sbTry<RfqRow[]>(`rfq_requests?client_thread_id=in.(${c.join(',')})&select=id,case_id,client_thread_id,product_line,insured_name,status,created_at`, [])) : Promise.resolve([] as RfqRow[]),
    sbTry<PmRow[]>(`pm_quotations?company_id=eq.${company.id}&select=id,company_id,company_name,effective_date,member_count,created_at,calculator_ids&order=created_at.desc`, []),
    sbTry<PmRow[]>(`pm_quotations?${nameFilter}&select=id,company_id,company_name,effective_date,member_count,created_at,calculator_ids&order=created_at.desc`, []),
    sbTry<GbRow[]>(`gb_quotations?${nameFilter}&select=id,company_name,effective_date,member_count,created_at&order=created_at.desc`, []),
  ])

  const rfqMap = new Map<string, RfqRow>()
  for (const r of [...rfqByCase, ...rfqByThread]) rfqMap.set(r.id, r)
  const rfqIds = Array.from(rfqMap.keys())
  const quoteCounts = new Map<string, number>()
  const dispatchesByRequest = new Map<string, QuoteDispatch[]>()
  if (rfqIds.length) {
    // Who we wrote to, who answered, and what they said — so the company page can show the
    // state of an RFQ without sending the broker to Nexus to find out.
    const [dRows, qRows] = await Promise.all([
      inChunks(rfqIds, 100, c => sbTry<DispatchRow[]>(`rfq_dispatches?rfq_request_id=in.(${c.join(',')})&select=id,rfq_request_id,insurer_name,to_email,status,thread_id,created_at,updated_at&order=created_at.asc`, [])),
      inChunks(rfqIds, 100, c => sbTry<QuoteDetailRow[]>(`rfq_quotes?rfq_request_id=in.(${c.join(',')})&select=rfq_request_id,dispatch_id,premium,excess,limit_indemnity,validity,status,primary_source`, [])),
    ])
    const quoteByDispatch = new Map<string, QuoteDetailRow>()
    for (const q of qRows) {
      if (q.rfq_request_id) quoteCounts.set(q.rfq_request_id, (quoteCounts.get(q.rfq_request_id) ?? 0) + 1)
      if (q.dispatch_id) quoteByDispatch.set(q.dispatch_id, q)
    }
    const now = Date.now()
    for (const d of dRows) {
      const q = quoteByDispatch.get(d.id) ?? null
      const replied = d.status === 'replied'
      const arr = dispatchesByRequest.get(d.rfq_request_id) ?? []
      arr.push({
        id: d.id,
        insurerName: d.insurer_name ?? 'Insurer',
        toEmail: d.to_email,
        sentAt: d.created_at,
        repliedAt: replied ? d.updated_at : null,
        status: d.status,
        daysWaiting: Math.max(0, Math.floor((now - new Date(replied ? d.updated_at : d.created_at).getTime()) / 86_400_000)),
        threadId: d.thread_id,
        quote: q ? {
          premium: q.premium, excess: q.excess, limitIndemnity: q.limit_indemnity,
          validity: q.validity, status: q.status, sourceLabel: q.primary_source,
        } : null,
      })
      dispatchesByRequest.set(d.rfq_request_id, arr)
    }
  }

  const freshCutoff = Date.now() - QUOTE_FRESH_DAYS * 86_400_000
  const pmMap = new Map<string, PmRow>()
  for (const p of [...pmById, ...pmByName]) pmMap.set(p.id, p)

  const rows: QuoteRow[] = [
    ...Array.from(rfqMap.values()).map((r): QuoteRow => ({
      id: r.id, kind: 'rfq', title: `${prettyLine(r.product_line)} RFQ`,
      status: RFQ_LABEL[r.status] ?? r.status, isOpen: RFQ_OPEN.has(r.status),
      created_at: r.created_at, effective_date: null, productLine: r.product_line, memberCount: null,
      quotesReceived: quoteCounts.get(r.id) ?? 0, href: `/nexus?case=${r.case_id}`, caseId: r.case_id,
      dispatches: dispatchesByRequest.get(r.id) ?? [],
    })),
    ...Array.from(pmMap.values()).map((p): QuoteRow => ({
      id: p.id, kind: 'pricing_matrix', title: `Group benefits quote (${p.calculator_ids?.length ?? 0} insurer${(p.calculator_ids?.length ?? 0) === 1 ? '' : 's'})`,
      status: 'Prepared', isOpen: new Date(p.created_at).getTime() > freshCutoff,
      created_at: p.created_at, effective_date: p.effective_date, productLine: 'group_benefits', memberCount: p.member_count,
      quotesReceived: null, href: `/pricing-matrix/quote/${p.id}`, caseId: null,
    })),
    ...gbByName.map((g): QuoteRow => ({
      id: g.id, kind: 'group_benefits', title: 'Group benefits quotation',
      status: 'Prepared', isOpen: new Date(g.created_at).getTime() > freshCutoff,
      created_at: g.created_at, effective_date: g.effective_date, productLine: 'group_benefits', memberCount: g.member_count,
      quotesReceived: null, href: `/group-benefits/${g.id}`, caseId: null,
    })),
  ]
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at))
}

/** Cheap open-quote count for the list/pipeline roll-up (RFQ lines only need case ids). */
export async function countOpenRfqByCase(caseIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (caseIds.length === 0) return out
  const rows = await inChunks(caseIds, 100, c => sbTry<{ case_id: string; status: string }[]>(`rfq_requests?case_id=in.(${c.join(',')})&select=case_id,status`, []))
  for (const r of rows) if (RFQ_OPEN.has(r.status)) out.set(r.case_id, (out.get(r.case_id) ?? 0) + 1)
  return out
}
