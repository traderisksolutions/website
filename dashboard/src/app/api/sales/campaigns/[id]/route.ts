import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/sales/auth'
import { isUuid, sb } from '@/lib/sales/db'
import { activationProblems, getCampaign, type StepRow } from '@/lib/sales/campaigns'
import { workflowStatus } from '@/lib/sales/config'
import { cleanAudience, cleanUrl } from '../_shared'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const who = await actor(req)
  if (who instanceof Response) return who
  if (!isUuid(params.id)) return json({ error: 'Not found' }, 404)
  try {
    const data = await getCampaign(params.id)
    if (!data) return json({ error: 'Not found' }, 404)
    return json({ ...data, workflow: workflowStatus() })
  } catch (e) {
    console.error('campaign load failed', e instanceof Error ? e.message : e)
    return json({ error: 'Could not load the campaign' }, 500)
  }
}

type Body = {
  name?: string; fromName?: string; firstTouch?: string; demoUrl?: string | null; deckUrl?: string | null; bookingUrl?: string | null
  autoEnrol?: boolean; autoApprove?: boolean; dailyNew?: number; audience?: unknown; status?: string
  steps?: { stepNumber: number; subject: string; body: string; delayDays: number }[]
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const who = await actor(req)
  if (who instanceof Response) return who
  const id = params.id
  if (!isUuid(id)) return json({ error: 'Not found' }, 404)
  const current = (await sb<{ id: string; status: string; first_touch: 'template' | 'personal_draft'; demo_url: string | null; deck_url: string | null; booking_url: string | null }[]>(`sales_campaigns?id=eq.${id}&select=id,status,first_touch,demo_url,deck_url,booking_url&limit=1`))[0]
  if (!current) return json({ error: 'Not found' }, 404)

  const b = (await req.json().catch(() => ({}))) as Body
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof b.name === 'string' && b.name.trim()) patch.name = b.name.trim().slice(0, 120)
  if (typeof b.fromName === 'string' && b.fromName.trim()) patch.from_name = b.fromName.trim().slice(0, 80)
  if (b.firstTouch === 'template' || b.firstTouch === 'personal_draft') patch.first_touch = b.firstTouch
  for (const [key, col, label] of [['demoUrl', 'demo_url', 'Demo link'], ['deckUrl', 'deck_url', 'Deck link'], ['bookingUrl', 'booking_url', 'Booking link']] as const) {
    const v = cleanUrl(b[key])
    if (b[key] !== undefined && v === undefined) return json({ error: `${label} must be a web address` }, 422)
    if (v !== undefined) patch[col] = v
  }
  if (b.audience !== undefined) patch.audience = cleanAudience(b.audience)
  if (typeof b.autoEnrol === 'boolean') patch.auto_enrol = b.autoEnrol
  if (typeof b.autoApprove === 'boolean') patch.auto_approve = b.autoApprove
  if (b.dailyNew !== undefined) {
    const d = Math.floor(Number(b.dailyNew))
    if (!Number.isFinite(d) || d < 0 || d > 100) return json({ error: 'New per day must be 0 to 100' }, 422)
    patch.daily_new = d
  }

  // Steps: replace the set. Blank steps are dropped.
  let steps: StepRow[] | null = null
  if (Array.isArray(b.steps)) {
    steps = b.steps.filter(s => Number.isInteger(s.stepNumber) && s.stepNumber >= 1 && s.stepNumber <= 5)
      .map(s => ({ step_number: s.stepNumber, subject: String(s.subject ?? '').slice(0, 200), body: String(s.body ?? '').slice(0, 10_000), delay_days: Math.max(0, Math.min(60, Math.floor(Number(s.delayDays) || 0))) }))
      .filter(s => s.body.trim() || s.subject.trim())
    try {
      await sb(`sales_campaign_steps?campaign_id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' })
      if (steps.length) await sb('sales_campaign_steps', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify(steps.map(s => ({ ...s, campaign_id: id }))) })
    } catch { return json({ error: 'Could not save the emails' }, 500) }
  }

  if (b.status && ['draft', 'active', 'paused', 'completed'].includes(b.status)) {
    if (b.status === 'active') {
      const s = steps ?? (await sb<StepRow[]>(`sales_campaign_steps?campaign_id=eq.${id}&select=step_number,subject,body,delay_days`))
      const merged = {
        first_touch: (patch.first_touch ?? current.first_touch) as 'template' | 'personal_draft',
        demo_url: (patch.demo_url !== undefined ? patch.demo_url : current.demo_url) as string | null,
        deck_url: (patch.deck_url !== undefined ? patch.deck_url : current.deck_url) as string | null,
        booking_url: (patch.booking_url !== undefined ? patch.booking_url : current.booking_url) as string | null,
      }
      const problems = activationProblems(merged, s)
      if (problems.length) return json({ error: problems.join('. ') }, 422)
    }
    patch.status = b.status
    if (b.status === 'active') patch.paused_reason = null
  }

  try { await sb(`sales_campaigns?id=eq.${id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify(patch) }) }
  catch { return json({ error: 'Could not save the campaign' }, 500) }

  // Activation arms everyone waiting: their first email is due now.
  if (patch.status === 'active' && current.status !== 'active') {
    try { await sb(`sales_campaign_contacts?campaign_id=eq.${id}&status=eq.pending`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ status: 'active', next_send_at: new Date().toISOString() }) }) }
    catch { return json({ error: 'Saved, but contacts were not armed' }, 500) }
  }
  console.info('campaign saved', JSON.stringify({ id, by: who.email, status: patch.status ?? null }))
  return json({ ok: true })
}
