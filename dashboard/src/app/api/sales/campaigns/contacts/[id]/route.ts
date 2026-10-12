import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/sales/auth'
import { isUuid, sb } from '@/lib/sales/db'
import { setOpening } from '@/lib/sales/campaigns'

export const dynamic = 'force-dynamic'

/** Edit the opening while awaiting approval, mark a contact replied (stops the sequence), or
 *  remove one who has not been emailed yet. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const id = params.id
  if (!isUuid(id)) return json({ error: 'Not found' }, 404)
  const { action, opening } = (await req.json().catch(() => ({}))) as { action?: string; opening?: unknown }

  if (action === 'opening') {
    if (typeof opening !== 'string') return json({ error: 'Opening must be text' }, 422)
    return (await setOpening(id, opening)) ? json({ ok: true }) : json({ error: 'Only editable while awaiting approval' }, 409)
  }
  if (action === 'replied') {
    const rows = await sb<{ sales_outreach_id: string | null }[]>(`sales_campaign_contacts?id=eq.${id}&status=in.(review,pending,active,completed)&select=sales_outreach_id`, { method: 'PATCH', body: JSON.stringify({ status: 'replied', next_send_at: null, updated_at: new Date().toISOString() }) })
    if (!rows.length) return json({ error: 'Contact not found or already stopped' }, 409)
    if (rows[0].sales_outreach_id) await sb(`sales_outreach?id=eq.${rows[0].sales_outreach_id}&status=eq.sent`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ status: 'replied' }) })
    return json({ ok: true })
  }
  if (action === 'remove') {
    const rows = await sb<{ id: string }[]>(`sales_campaign_contacts?id=eq.${id}&current_step=eq.0&select=id`, { method: 'DELETE' })
    if (!rows.length) return json({ error: 'Already emailed: mark replied instead' }, 409)
    return json({ ok: true })
  }
  return json({ error: 'Unknown action' }, 400)
}
