/**
 * GET /api/eb/policies?lifecycle= → { policies: EbPolicyRow[] }
 * Every employment-benefits policy across companies, for the Employment Benefits page: who it is
 * for, where it stands, the insurer and premium once bound, lives covered, engine prices on file.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { enc, inChunks, sbTry } from '@/lib/crm/db'
import { isPolicyLifecycle, LIFECYCLE_LABEL, type PolicyLifecycle, type PolicyRow } from '@/lib/policies/types'
import { fail, gate } from '@/lib/placement/api'

export const dynamic = 'force-dynamic'

export type EbPolicyRow = {
  id: string
  company_id: string | null
  company_name: string
  label: string
  product_line: string | null
  lifecycle: PolicyLifecycle
  lifecycle_label: string
  insurer: string | null
  premium: number | null
  currency: string
  start_date: string | null
  end_date: string | null
  placement_line_id: string | null
  members_active: number | null
  engine_quotes: number
  insurer_quotes: number
  updated_at: string
}

type LineRow = { id: string; placement_id: string; label: string | null; census_submission_id: string | null; updated_at: string }
type QuoteRow = { line_id: string; source: 'insurer' | 'rate_table'; status: string; created_at: string }

export async function GET(req: NextRequest) {
  const { unauthorized } = await gate(req)
  if (unauthorized) return unauthorized
  const lifecycle = req.nextUrl.searchParams.get('lifecycle')
  if (lifecycle && !isPolicyLifecycle(lifecycle)) return fail('lifecycle is not valid')

  const where = lifecycle ? `&lifecycle=eq.${enc(lifecycle)}` : ''
  const policies = await sbTry<PolicyRow[]>(`policies?is_eb=eq.true${where}&order=updated_at.desc.nullslast,created_at.desc&limit=1000`, [])
  if (policies.length === 0) return NextResponse.json({ policies: [] })

  const companyIds = [...new Set(policies.map(p => p.company_id).filter((x): x is string => !!x))]
  const policyIds = policies.map(p => p.id)
  const lineIds = [...new Set(policies.map(p => p.placement_line_id).filter((x): x is string => !!x))]
  const [companies, members, lines, quotes] = await Promise.all([
    inChunks(companyIds, 100, ids => sbTry<{ id: string; company_name: string }[]>(`companies?id=in.(${ids.join(',')})&select=id,company_name`, [])),
    inChunks(policyIds, 100, ids => sbTry<{ policy_id: string }[]>(`policy_members?policy_id=in.(${ids.join(',')})&status=eq.active&select=policy_id&limit=50000`, [])),
    inChunks(lineIds, 100, ids => sbTry<LineRow[]>(`placement_lines?id=in.(${ids.join(',')})&select=id,placement_id,label,census_submission_id,updated_at`, [])),
    inChunks(lineIds, 100, ids => sbTry<QuoteRow[]>(`placement_quotes?line_id=in.(${ids.join(',')})&status=neq.superseded&select=line_id,source,status,created_at`, [])),
  ])
  const companyName = new Map(companies.map(c => [c.id, c.company_name]))
  const activeCount = new Map<string, number>()
  for (const m of members) activeCount.set(m.policy_id, (activeCount.get(m.policy_id) ?? 0) + 1)
  const lineById = new Map(lines.map(l => [l.id, l]))

  const rows: EbPolicyRow[] = policies.map(p => {
    const line = p.placement_line_id ? lineById.get(p.placement_line_id) : undefined
    const qs = quotes.filter(q => q.line_id === p.placement_line_id)
    const latestQuote = qs.map(q => q.created_at).sort().at(-1) ?? ''
    const updated = [p.updated_at ?? '', p.created_at, line?.updated_at ?? '', latestQuote].sort().at(-1) || p.created_at
    const afterBind = p.lifecycle === 'bound' || p.lifecycle === 'live' || p.lifecycle === 'renewal_due' || p.lifecycle === 'lapsed'
    return {
      id: p.id, company_id: p.company_id,
      company_name: (p.company_id && companyName.get(p.company_id)) || '—',
      label: p.label || line?.label || p.class_of_insurance || 'Employment benefits',
      product_line: p.product_line, lifecycle: p.lifecycle, lifecycle_label: LIFECYCLE_LABEL[p.lifecycle] ?? p.lifecycle,
      insurer: p.insurer, premium: p.bound_premium ?? p.premium ?? null, currency: p.currency || 'SGD',
      start_date: p.start_date, end_date: p.end_date, placement_line_id: p.placement_line_id,
      members_active: afterBind ? (activeCount.get(p.id) ?? 0) : null,
      engine_quotes: qs.filter(q => q.source === 'rate_table').length,
      insurer_quotes: qs.filter(q => q.source !== 'rate_table').length,
      updated_at: updated,
    }
  }).sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  return NextResponse.json({ policies: rows })
}
