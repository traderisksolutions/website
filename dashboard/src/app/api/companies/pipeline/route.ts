/**
 * GET /api/companies/pipeline → the sales journey in four buckets:
 *   start      — leads that are not a company yet (website, WhatsApp, outbound discovery)
 *   sales      — companies at lead / prospect
 *   convert    — companies at quoting
 *   operations — companies at client / renewal due / lapsed
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { listCompanySummaries }      from '@/lib/crm/aggregates'
import { sbTry }                     from '@/lib/crm/db'
import type { CompanySummaryRow }    from '@/lib/crm/types'

export type PipelineLead = {
  origin: 'inbound' | 'outbound'
  id: string
  name: string
  email: string | null
  company: string | null
  topic: string | null
  source: string | null
  status: string
  created_at: string
  message: string | null
}

type InboundRow = { id: string; first_name: string | null; last_name: string | null; email: string | null; company: string | null; topic: string | null; product_line: string | null; source: string | null; status: string; created_at: string; message: string | null }
type OutboundRow = { id: string; full_name: string | null; first_name: string | null; last_name: string | null; email: string | null; current_company: string | null; current_industry: string | null; source: string | null; status: string; created_at: string; headline: string | null }

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const [rows, inbound, outbound] = await Promise.all([
      listCompanySummaries(),
      sbTry<InboundRow[]>(`inbound_leads?company_id=is.null&status=in.(new,contacted,engaged,qualified)&select=id,first_name,last_name,email,company,topic,product_line,source,status,created_at,message&order=created_at.desc&limit=100`, []),
      sbTry<OutboundRow[]>(`outbound_leads?status=in.(new,contacted,engaged,qualified,proposal)&opt_out=not.is.true&select=id,full_name,first_name,last_name,email,current_company,current_industry,source,status,created_at,headline&order=created_at.desc&limit=100`, []),
    ])
    const leads: PipelineLead[] = [
      ...inbound.map((l): PipelineLead => ({ origin: 'inbound', id: l.id, name: [l.first_name, l.last_name].filter(Boolean).join(' ') || l.email || 'Unknown', email: l.email, company: l.company, topic: l.topic ?? l.product_line, source: l.source, status: l.status, created_at: l.created_at, message: l.message })),
      ...outbound.map((l): PipelineLead => ({ origin: 'outbound', id: l.id, name: l.full_name || [l.first_name, l.last_name].filter(Boolean).join(' ') || l.email || 'Unknown', email: l.email, company: l.current_company, topic: l.current_industry, source: l.source, status: l.status, created_at: l.created_at, message: l.headline })),
    ].sort((a, b) => b.created_at.localeCompare(a.created_at))

    const by = (stages: string[]) => rows.filter(r => stages.includes(r.stage))
    const buckets: Record<'sales' | 'convert' | 'operations', CompanySummaryRow[]> = {
      sales: by(['lead', 'prospect']), convert: by(['quoting']), operations: by(['client', 'renewal_due', 'lapsed']),
    }
    return NextResponse.json({ leads, ...buckets, counts: { start: leads.length, sales: buckets.sales.length, convert: buckets.convert.length, operations: buckets.operations.length } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
