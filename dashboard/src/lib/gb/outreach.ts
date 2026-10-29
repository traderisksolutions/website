/**
 * Employment Benefits beyond Tier A: the insurers a broker can ask by email, and asking them.
 *
 * Tier A is priced by the engine and never emailed. Tier B (Cigna Care Connect 2.0, April MyHEALTH)
 * and Tier C (every other insurer with an employee-benefits product on the Insurers page) are asked
 * only when the broker selects them. The ask runs through the client's placement: the quotation's
 * Tier A prices are filed on the Employment Benefits line, a round opens with one draft per
 * underwriter (approved in Drafts to approve), and the placement's chasers follow up.
 */
import { sb, sbTry } from '@/lib/crm/db'
import { listProducts } from '@/lib/insurer-products'
import { attachQuotation, openTierC } from '@/lib/placement/eb'
import { createPlacement } from '@/lib/placement/workflow'
import { EB_PRODUCT_LINE } from '@/lib/placement/auto'
import { insurerKey, requirementText, TIER_A, type CategoryInput } from './ladder'
import { normCompany } from './intake'

export type OutreachInsurer = { insurer: string; insurer_company_id: string; tier: 'B' | 'C'; contacts: { contact_id: string; name: string | null; email: string }[] }

const TIER_B = /cigna|april/i

/** Every insurer with an employee-benefits product that is not priced here, with its contacts. */
export async function outreachInsurers(): Promise<OutreachInsurer[]> {
  const products = await listProducts({ productLines: ['employee_benefits', 'group_health'], activeOnly: true })
  const by = new Map<string, OutreachInsurer>()
  for (const p of products) {
    const key = insurerKey(p.insurer_name)
    if (key && TIER_A.includes(key)) continue
    const cur = by.get(p.insurer_company_id) ?? { insurer: p.insurer_name, insurer_company_id: p.insurer_company_id, tier: TIER_B.test(p.insurer_name) ? 'B' as const : 'C' as const, contacts: [] }
    for (const c of p.contacts) if (!cur.contacts.some(x => x.contact_id === c.contact_id)) cur.contacts.push({ contact_id: c.contact_id, name: c.name, email: c.email })
    by.set(p.insurer_company_id, cur)
  }
  return [...by.values()].sort((a, b) => a.tier.localeCompare(b.tier) || a.insurer.localeCompare(b.insurer))
}

type QuoteRow = { id: string; company_name: string | null; effective_date: string | null; member_count: number; requirement: { categories?: CategoryInput[] } | null }

async function companyFor(name: string): Promise<{ id: string; company_name: string } | null> {
  const key = normCompany(name)
  if (key.length < 3) return null
  const word = name.trim().split(/\s+/)[0].replace(/[^A-Za-z0-9]/g, '')
  const rows = await sbTry<{ id: string; company_name: string; kind: string | null }[]>(`companies?company_name=ilike.*${encodeURIComponent(word)}*&select=id,company_name,kind&limit=50`, [])
  return rows.filter(r => r.kind !== 'insurer').find(r => normCompany(r.company_name) === key) ?? null
}

/** The client's open Employment Benefits line, opening a placement for it when there is none. */
async function lineFor(q: QuoteRow, actor: string): Promise<{ lineId: string; placementId: string; opened: boolean }> {
  const linked = await sbTry<{ line_id: string; placement_id: string }[]>(`placement_quotes?engine_run_id=eq.${q.id}&select=line_id,placement_id&limit=1`, [])
  if (linked[0]) return { lineId: linked[0].line_id, placementId: linked[0].placement_id, opened: false }
  const company = await companyFor(q.company_name ?? '')
  if (!company) throw new Error(`No client company named “${q.company_name ?? ''}”. Add the company on the Companies page, then try again.`)
  const placements = await sbTry<{ id: string }[]>(`placements?company_id=eq.${company.id}&status=neq.closed&select=id&order=created_at.desc`, [])
  if (placements.length) {
    const lines = await sbTry<{ id: string; placement_id: string }[]>(`placement_lines?placement_id=in.(${placements.map(p => p.id).join(',')})&product_line=eq.${EB_PRODUCT_LINE}&status=neq.closed&select=id,placement_id&order=created_at.desc&limit=1`, [])
    if (lines[0]) return { lineId: lines[0].id, placementId: lines[0].placement_id, opened: false }
  }
  const scope = requirementText(q.requirement?.categories ?? [])
  const r = await createPlacement({
    company_id: company.id, title: `Employment Benefits for ${company.company_name}`, inception_date: q.effective_date, actor, dispatch: false,
    lines: [{ product_line: EB_PRODUCT_LINE, label: 'Employment Benefits', contact_ids: [], spec: {
      insured: `${company.company_name}, ${q.member_count} lives`, period: q.effective_date ? `12 months from ${q.effective_date}` : undefined, scope: scope || undefined,
    } }],
  })
  return { lineId: r.lines[0].id, placementId: r.placement.id, opened: true }
}

/**
 * Asks the chosen Tier B and C underwriters to quote this quotation. Drafts only; a person sends.
 * Returns where the round lives so the page can link to it.
 */
export async function askInsurers(quotationId: string, contactIds: string[], actor: string) {
  if (!contactIds.length) throw new Error('Choose at least one underwriter')
  const [q] = await sb<QuoteRow[]>(`gb_quotations?id=eq.${quotationId}&select=id,company_name,effective_date,member_count,requirement&limit=1`)
  if (!q) throw new Error('Quotation not found')
  if (!q.member_count) throw new Error('Add the employee list before asking insurers')
  const { lineId, placementId, opened } = await lineFor(q, actor)
  await attachQuotation(lineId, quotationId, actor)
  const r = await openTierC(lineId, actor, contactIds, requirementText(q.requirement?.categories ?? []) || undefined)
  const [p] = await sbTry<{ company_id: string }[]>(`placements?id=eq.${placementId}&select=company_id&limit=1`, [])
  return { placement_id: placementId, company_id: p?.company_id ?? null, line_id: lineId, placement_opened: opened, drafts: r.drafts, unrouted: r.unrouted, lives: r.lives }
}
