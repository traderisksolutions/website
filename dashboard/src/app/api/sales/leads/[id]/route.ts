import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/sales/auth'
import { isUuid } from '@/lib/sales/db'
import { getLeadDetail } from '@/lib/sales/leads'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const who = await actor(req)
  if (who instanceof Response) return who
  if (!isUuid(params.id)) return json({ error: 'Not found' }, 404)
  try {
    const lead = await getLeadDetail(params.id)
    if (!lead) return json({ error: 'Not found' }, 404)
    return json({ lead })
  } catch (e) {
    console.error('sales lead detail failed', e instanceof Error ? e.message : e)
    return json({ error: 'Could not load this lead' }, 500)
  }
}
