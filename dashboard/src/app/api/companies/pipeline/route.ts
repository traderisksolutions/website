/**
 * GET /api/companies/pipeline → every client company grouped by stage, plus inbound leads that
 * have not been turned into a company yet (so the board shows the whole funnel).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { listCompanySummaries }      from '@/lib/crm/aggregates'
import { sbTry }                     from '@/lib/crm/db'
import { STAGES }                    from '@/lib/crm/types'
import type { CompanySummaryRow, Stage } from '@/lib/crm/types'

export type PipelineLead = {
  id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null
  company: string | null; topic: string | null; product_line: string | null; source: string | null; status: string; created_at: string; message: string | null
}

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const [rows, leads] = await Promise.all([
      listCompanySummaries(),
      sbTry<PipelineLead[]>(`inbound_leads?company_id=is.null&status=in.(new,contacted,engaged,qualified)&select=id,first_name,last_name,email,phone,company,topic,product_line,source,status,created_at,message&order=created_at.desc&limit=100`, []),
    ])
    const columns = Object.fromEntries(STAGES.map(s => [s, [] as CompanySummaryRow[]])) as Record<Stage, CompanySummaryRow[]>
    for (const r of rows) columns[r.stage].push(r)
    return NextResponse.json({ columns, leads })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
