import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbHeaders } from '@/lib/sb'
import { requireStaffOrCron } from '@/lib/api-auth'
import { fetchAllRows } from '@/lib/postgrest-all'
import { approve, approvedSteps, exclude, getCampaign } from '@/lib/outreach/queue'
import { actorEmail } from '@/lib/outreach/actor'
import { EMAIL_STATUSES, MARKETS, nextSendRun, substituteTokens, type CampaignAudience } from '@/lib/outreach/prospects'

export type QueueRow = {
  id: string; leadId: string; name: string; company: string | null; email: string | null; title: string | null
  approval: 'pending' | 'included' | 'excluded'; send: string; step: number; totalSteps: number
  scheduledAt: string | null; lastSentAt: string | null
  /** The next email this person receives, rendered exactly as the sender will merge it. */
  preview: { step: number; subject: string; body: string } | null
}
export type QueuePayload = {
  campaign: { id: string; name: string; status: string; audience: CampaignAudience | null; dailyNew: number; autoApprove: boolean; bouncePausedAt: string | null }
  stepsApproved: number
  nextRun: string
  rows: QueueRow[]
  ready: boolean
}

type Member = { id: string; lead_id: string; approval_status: QueueRow['approval']; send_status: string; current_step: number | null; send_scheduled_at: string | null; step1_sent_at: string | null; step2_sent_at: string | null; step3_sent_at: string | null; metadata: { steps?: { subject: string; body: string; delay_days: number }[] } | null }
type Lead = { id: string; full_name: string | null; first_name: string | null; current_company: string | null; current_title: string | null; email: string | null }

// GET /api/outbound/campaigns/[id]/queue: everyone in the campaign with their next email rendered.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const { id } = await params
    let c
    try { c = await getCampaign(id) } catch (e) {
      // 42703: the migration's new columns are not there yet.
      if (/42703/.test(String(e))) return NextResponse.json({ ready: false }, { status: 409 })
      throw e
    }
    if (!c) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    const steps = await approvedSteps(c)
    const members = await fetchAllRows<Member>(`${SB_URL}/rest/v1/ob_campaign_leads?campaign_id=eq.${id}&approval_status=neq.excluded&select=id,lead_id,approval_status,send_status,current_step,send_scheduled_at,step1_sent_at,step2_sent_at,step3_sent_at,metadata`, sbHeaders())
    const leads = new Map<string, Lead>()
    const ids = Array.from(new Set(members.map(m => m.lead_id)))
    for (let i = 0; i < ids.length; i += 100) {
      const res = await fetch(`${SB_URL}/rest/v1/outbound_leads?id=in.(${ids.slice(i, i + 100).join(',')})&select=id,full_name,first_name,current_company,current_title,email`, { headers: sbHeaders(), cache: 'no-store' })
      if (!res.ok) throw new Error(`Lead read failed: ${res.status}`)
      ;(await res.json() as Lead[]).forEach(l => leads.set(l.id, l))
    }
    const rows: QueueRow[] = members.map(m => {
      const l = leads.get(m.lead_id)
      // Pending rows preview the campaign's current steps; queued rows send what was frozen at approval.
      const own = m.approval_status === 'pending' ? steps : (m.metadata?.steps ?? steps)
      const at = m.current_step ?? 0
      const done = ['replied', 'bounced', 'unsubscribed', 'opted_out'].includes(m.send_status) || at >= own.length
      const s = done ? null : own[at]
      const first = l?.first_name ?? l?.full_name?.split(' ')[0] ?? ''
      return {
        id: m.id, leadId: m.lead_id, name: l?.full_name ?? l?.email ?? 'Unknown', company: l?.current_company ?? null, email: l?.email ?? null, title: l?.current_title ?? null,
        approval: m.approval_status, send: m.send_status, step: at, totalSteps: own.length,
        scheduledAt: done ? null : m.send_scheduled_at, lastSentAt: m.step3_sent_at ?? m.step2_sent_at ?? m.step1_sent_at,
        preview: s ? { step: at + 1, subject: substituteTokens(s.subject, first, l?.current_company ?? ''), body: substituteTokens(s.body, first, l?.current_company ?? '') } : null,
      }
    })
    return NextResponse.json({
      campaign: { id: c.id, name: c.name, status: c.status, audience: c.audience, dailyNew: c.daily_new, autoApprove: c.auto_approve, bouncePausedAt: c.bounce_paused_at },
      stepsApproved: steps.length, nextRun: nextSendRun().toISOString(), rows, ready: true,
    } satisfies QueuePayload)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

// POST /api/outbound/campaigns/[id]/queue
//   { action: 'approve', ids?: string[], all?: true }
//   { action: 'exclude', ids: string[] }
//   { action: 'settings', markets?: string[], emailStatuses?: string[], dailyNew?: number, autoApprove?: boolean }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const { id } = await params
    const b = await req.json().catch(() => ({})) as Record<string, unknown>
    const ids = Array.isArray(b.ids) ? b.ids.filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)) : []
    const by = await actorEmail()

    if (b.action === 'approve') {
      if (b.all !== true && !ids.length) return NextResponse.json({ error: 'ids or all required' }, { status: 400 })
      return NextResponse.json(await approve(id, b.all === true ? { all: true } : { ids }, by))
    }
    if (b.action === 'exclude') {
      if (!ids.length) return NextResponse.json({ error: 'ids required' }, { status: 400 })
      return NextResponse.json(await exclude(id, ids))
    }
    if (b.action === 'settings') {
      const markets = Array.isArray(b.markets) ? b.markets.filter((m): m is string => (MARKETS as readonly string[]).includes(m as string)) : undefined
      const statuses = Array.isArray(b.emailStatuses) ? b.emailStatuses.filter((s): s is string => (EMAIL_STATUSES as readonly string[]).includes(s as string) && s !== 'invalid') : undefined
      const dailyNew = b.dailyNew === undefined ? undefined : Number(b.dailyNew)
      if (dailyNew !== undefined && (!Number.isInteger(dailyNew) || dailyNew < 0 || dailyNew > 200)) return NextResponse.json({ error: 'Daily new must be 0 to 200' }, { status: 400 })
      const c = await getCampaign(id)
      if (!c) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (markets || statuses) patch.audience = { markets: markets ?? c.audience?.markets ?? [], emailStatuses: statuses ?? c.audience?.emailStatuses ?? ['verified', 'published'] }
      if (dailyNew !== undefined) patch.daily_new = dailyNew
      if (typeof b.autoApprove === 'boolean') patch.auto_approve = b.autoApprove
      const res = await fetch(`${SB_URL}/rest/v1/ob_campaigns?id=eq.${id}`, { method: 'PATCH', headers: sbHeaders(), body: JSON.stringify(patch) })
      if (!res.ok) return NextResponse.json({ error: `Save failed: ${res.status}` }, { status: 500 })
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
