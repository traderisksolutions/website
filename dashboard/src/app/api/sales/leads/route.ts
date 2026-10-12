import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/sales/auth'
import { parseFilters } from '@/lib/sales/filters'
import { getKpis, listLeads } from '@/lib/sales/leads'
import { workflowStatus } from '@/lib/sales/config'

export const dynamic = 'force-dynamic'

/** GET /api/sales/leads?location=SG&outreach=...&page=1 → one page of leads_unified plus the
 *  per-market counts the header shows. */
export async function GET(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const f = parseFilters(req.nextUrl.searchParams)
  try {
    const [list, kpis] = await Promise.all([listLeads(f), getKpis()])
    return json({ filters: f, rows: list.rows, total: list.total, kpis, workflow: workflowStatus() })
  } catch (e) {
    console.error('sales leads list failed', e instanceof Error ? e.message : e)
    return json({ error: 'Could not load leads' }, 500)
  }
}
