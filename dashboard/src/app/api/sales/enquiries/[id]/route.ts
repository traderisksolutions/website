import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/sales/auth'
import { getIntake, updateIntake } from '@/lib/intake/store'
import { logSalesEvent } from '@/lib/sales/events'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const who = await actor(req)
  if (who instanceof Response) return who
  try {
    const intake = await getIntake(params.id)
    if (!intake) return json({ error: 'Not found' }, 404)
    return json({ intake })
  } catch (e) {
    console.error('enquiry detail failed', e instanceof Error ? e.message : e)
    return json({ error: 'Could not load this enquiry' }, 500)
  }
}

/** PATCH { status?, owner_email?, note? } */
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const who = await actor(req)
  if (who instanceof Response) return who
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'Body must be JSON' }, 400) }
  try {
    const err = await updateIntake(params.id, body)
    if (err) return json({ error: err }, err === 'not found' ? 404 : 422)
    await logSalesEvent({ kind: 'edited', actor: who.email, detail: { enquiry: params.id, ...body } })
    return json({ ok: true })
  } catch (e) {
    console.error('enquiry update failed', e instanceof Error ? e.message : e)
    return json({ error: 'Could not save' }, 500)
  }
}
