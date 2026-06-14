import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbHeaders, logEvent } from '@/lib/sb'

type Params = { params: Promise<{ id: string }> }

async function syncLeadCount(campaignId: string) {
  try {
    const countRes = await fetch(
      `${SB_URL}/rest/v1/ob_campaign_leads?campaign_id=eq.${campaignId}&approval_status=eq.included&select=id`,
      { method: 'HEAD', headers: { ...sbHeaders(), Prefer: 'count=exact' } }
    )
    const range = countRes.headers.get('content-range') ?? ''
    const total = parseInt(range.split('/')[1] ?? '0', 10)
    if (!isNaN(total)) {
      await fetch(`${SB_URL}/rest/v1/ob_campaigns?id=eq.${campaignId}`, {
        method:  'PATCH',
        headers: sbHeaders(),
        body:    JSON.stringify({ lead_count: total }),
      })
    }
  } catch { /* non-fatal */ }
}

// GET /api/outbound/campaigns/[id]/leads
// Returns all ob_campaign_leads for this campaign, joined with lead + segment + score data
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params

    // PostgREST embedded select: campaign_leads → outbound_leads → segment
    const [clRes, scoreRes] = await Promise.all([
      fetch(
        `${SB_URL}/rest/v1/ob_campaign_leads` +
        `?campaign_id=eq.${id}` +
        `&select=*,outbound_leads(*),ob_campaign_segments(id,name)` +
        `&order=created_at.asc`,
        { headers: sbHeaders() }
      ),
      // Latest score per lead for this campaign (we'll index by lead_id client-side)
      fetch(
        `${SB_URL}/rest/v1/ob_lead_scores` +
        `?campaign_id=eq.${id}` +
        `&select=lead_id,overall_score,company_fit_score,seniority_fit_score,title_fit_score,data_confidence_score,score_reasoning` +
        `&order=scored_at.desc`,
        { headers: sbHeaders() }
      ),
    ])

    const [rawLeads, rawScores] = await Promise.all([
      clRes.ok    ? clRes.json()    : [],
      scoreRes.ok ? scoreRes.json() : [],
    ])

    // Index scores by lead_id (take most recent)
    const scoreMap = new Map<string, Record<string, unknown>>()
    if (Array.isArray(rawScores)) {
      for (const s of rawScores) {
        if (!scoreMap.has(s.lead_id)) scoreMap.set(s.lead_id, s)
      }
    }

    // Merge score into each campaign lead row
    const leads = Array.isArray(rawLeads)
      ? rawLeads.map((cl: Record<string, unknown>) => ({
          ...cl,
          score: scoreMap.get(cl.lead_id as string) ?? null,
        }))
      : []

    return NextResponse.json(leads)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

// POST /api/outbound/campaigns/[id]/leads
// Body: { lead_ids: string[], segment_id?: string, source_type?: string }
// Adds leads to the campaign (idempotent — ignores duplicates)
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const body = await req.json() as { lead_ids: string[]; segment_id?: string; source_type?: string }

    if (!Array.isArray(body.lead_ids) || body.lead_ids.length === 0) {
      return NextResponse.json({ error: 'lead_ids array required' }, { status: 400 })
    }

    const rows = body.lead_ids.map(lead_id => ({
      campaign_id:     id,
      lead_id,
      segment_id:      body.segment_id  ?? null,
      source_type:     body.source_type ?? 'manual',
      approval_status: 'included',
      send_status:     'unsent',
    }))

    const res = await fetch(`${SB_URL}/rest/v1/ob_campaign_leads`, {
      method:  'POST',
      headers: sbHeaders('return=representation,resolution=ignore-duplicates'),
      body:    JSON.stringify(rows),
    })

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: err }, { status: 502 })
    }

    const inserted = await res.json().catch(() => [])
    const count = Array.isArray(inserted) ? inserted.length : 0

    await Promise.all([
      syncLeadCount(id),
      logEvent({
        event_type:  'ae_lead_added',
        entity_type: 'campaign',
        entity_id:   id,
        campaign_id: id,
        payload:     { lead_ids: body.lead_ids, segment_id: body.segment_id ?? null, count },
      }),
    ])

    return NextResponse.json({ added: count, skipped: body.lead_ids.length - count })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

// PATCH /api/outbound/campaigns/[id]/leads
// Body: { lead_id: string, segment_id?: string, approval_status?: string, send_status?: string }
// Update a specific campaign lead membership row
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const body = await req.json() as {
      lead_id:          string
      segment_id?:      string | null
      approval_status?: string
      send_status?:     string
    }

    if (!body.lead_id) {
      return NextResponse.json({ error: 'lead_id required' }, { status: 400 })
    }

    const patch: Record<string, unknown> = {}
    if (body.segment_id      !== undefined) patch.segment_id      = body.segment_id
    if (body.approval_status !== undefined) patch.approval_status = body.approval_status
    if (body.send_status     !== undefined) patch.send_status     = body.send_status

    const res = await fetch(
      `${SB_URL}/rest/v1/ob_campaign_leads?campaign_id=eq.${id}&lead_id=eq.${body.lead_id}`,
      { method: 'PATCH', headers: sbHeaders(), body: JSON.stringify(patch) }
    )

    if (!res.ok) return NextResponse.json({ error: 'Update failed' }, { status: 502 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

// DELETE /api/outbound/campaigns/[id]/leads
// Body: { lead_id: string }
// Soft-removes a lead from the campaign (sets approval_status = 'excluded', removed_at = now)
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const { lead_id } = await req.json() as { lead_id: string }

    if (!lead_id) return NextResponse.json({ error: 'lead_id required' }, { status: 400 })

    const res = await fetch(
      `${SB_URL}/rest/v1/ob_campaign_leads?campaign_id=eq.${id}&lead_id=eq.${lead_id}`,
      {
        method:  'PATCH',
        headers: sbHeaders(),
        body:    JSON.stringify({
          approval_status: 'excluded',
          removed_at:      new Date().toISOString(),
        }),
      }
    )

    if (!res.ok) return NextResponse.json({ error: 'Remove failed' }, { status: 502 })

    await Promise.all([
      syncLeadCount(id),
      logEvent({
        event_type:  'ae_lead_removed',
        entity_type: 'campaign',
        entity_id:   id,
        campaign_id: id,
        lead_id,
        payload:     { lead_id },
      }),
    ])

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
