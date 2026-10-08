import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbHeaders } from '@/lib/sb'
import { requireStaffOrCron } from '@/lib/api-auth'
import { fetchAllRows } from '@/lib/postgrest-all'
import { enrol } from '@/lib/outreach/queue'
import { actorEmail } from '@/lib/outreach/actor'
import type { ProspectAccount, ProspectContact } from '@/lib/outreach/prospects'

export type ProspectEnrolment = { campaignId: string; campaignName: string; approval: string; send: string }
export type ProspectsPayload = {
  accounts: ProspectAccount[]
  contacts: (ProspectContact & { enrolments: ProspectEnrolment[] })[]
  campaigns: { id: string; name: string; status: string }[]
  /** False until supabase/migrations/20261008_prospects.sql is applied. */
  ready: boolean
}

// GET /api/outbound/prospects: every prospect company and named contact, with campaign membership.
export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const h = sbHeaders()
    let accounts: ProspectAccount[], contacts: ProspectContact[]
    try {
      [accounts, contacts] = await Promise.all([
        fetchAllRows<ProspectAccount>(`${SB_URL}/rest/v1/prospect_accounts?select=*&order=created_at.desc`, h),
        fetchAllRows<ProspectContact>(`${SB_URL}/rest/v1/prospect_contacts?select=*&order=created_at.desc`, h),
      ])
    } catch (e) {
      // 404 / 42P01: the tables do not exist yet.
      if (/\b(404|42P01|PGRST205)\b/.test(String(e))) return NextResponse.json({ accounts: [], contacts: [], campaigns: [], ready: false } satisfies ProspectsPayload)
      throw e
    }
    const [campaigns, members] = await Promise.all([
      fetchAllRows<{ id: string; name: string; status: string }>(`${SB_URL}/rest/v1/ob_campaigns?select=id,name,status&status=neq.archived`, h),
      fetchAllRows<{ id: string; campaign_id: string; lead_id: string; approval_status: string; send_status: string }>(`${SB_URL}/rest/v1/ob_campaign_leads?select=id,campaign_id,lead_id,approval_status,send_status`, h),
    ])
    const name = new Map(campaigns.map(c => [c.id, c.name]))
    const byLead = new Map<string, ProspectEnrolment[]>()
    for (const m of members) {
      const list = byLead.get(m.lead_id) ?? []
      list.push({ campaignId: m.campaign_id, campaignName: name.get(m.campaign_id) ?? 'Archived campaign', approval: m.approval_status, send: m.send_status })
      byLead.set(m.lead_id, list)
    }
    return NextResponse.json({
      accounts,
      contacts: contacts.map(c => ({ ...c, enrolments: c.outbound_lead_id ? byLead.get(c.outbound_lead_id) ?? [] : [] })),
      campaigns,
      ready: true,
    } satisfies ProspectsPayload)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

// POST /api/outbound/prospects  { campaignId, contactIds }: add named contacts to a campaign's review queue.
export async function POST(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const body = await req.json().catch(() => ({})) as { campaignId?: unknown; contactIds?: unknown }
    const uuid = /^[0-9a-f-]{36}$/i
    if (typeof body.campaignId !== 'string' || !uuid.test(body.campaignId)) return NextResponse.json({ error: 'campaignId required' }, { status: 400 })
    if (!Array.isArray(body.contactIds) || !body.contactIds.length || body.contactIds.length > 2000 || !body.contactIds.every(x => typeof x === 'string' && uuid.test(x))) {
      return NextResponse.json({ error: 'contactIds must be 1 to 2,000 ids' }, { status: 400 })
    }
    return NextResponse.json(await enrol(body.campaignId, body.contactIds as string[], await actorEmail()))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
