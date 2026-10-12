import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/sales/auth'
import { sb } from '@/lib/sales/db'
import { listCampaigns } from '@/lib/sales/campaigns'
import { workflowStatus } from '@/lib/sales/config'
import { senderAliasState } from '@/lib/sales/gmail'

export const dynamic = 'force-dynamic'

/** GET → every campaign with its counts, and whether the system can send. */
export async function GET(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  try {
    const wf = workflowStatus()
    const [campaigns, alias] = await Promise.all([listCampaigns(), wf.gmail ? senderAliasState(wf.sender) : Promise.resolve(null)])
    return json({ campaigns, workflow: wf, alias })
  } catch (e) {
    console.error('campaigns list failed', e instanceof Error ? e.message : e)
    return json({ error: 'Could not load campaigns' }, 500)
  }
}

/** POST → a new draft campaign. Sends nothing until activated and sending is on. */
export async function POST(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const body = (await req.json().catch(() => ({}))) as { name?: string }
  const name = (body.name ?? '').trim().slice(0, 120) || 'New campaign'
  try {
    const rows = await sb<{ id: string }[]>('sales_campaigns?select=id', { method: 'POST', body: JSON.stringify({
      name, status: 'draft', from_name: 'Trade Risk Solutions', first_touch: 'template', audience: { relationships: ['prospect'], verifiedOnly: true, namedOnly: true }, created_by: who.email,
    }) })
    return json({ id: rows[0].id })
  } catch (e) {
    console.error('campaign create failed', e instanceof Error ? e.message : e)
    return json({ error: 'Could not create the campaign' }, 500)
  }
}
