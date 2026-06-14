import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbHeaders, logEvent } from '@/lib/sb'

type Params = { params: Promise<{ id: string }> }

// GET /api/outbound/campaigns/[id]/signals
// Returns all signals attached to this campaign, joined with signal library details
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params

    const res = await fetch(
      `${SB_URL}/rest/v1/ob_campaign_signals` +
      `?campaign_id=eq.${id}` +
      `&select=*,ob_signal_library(id,signal_name,signal_type,scope,sector,corroboration_count,status,source_url,source_summary)` +
      `&order=created_at.asc`,
      { headers: sbHeaders() }
    )

    const data = res.ok ? await res.json() : []
    return NextResponse.json(Array.isArray(data) ? data : [])
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

// POST /api/outbound/campaigns/[id]/signals
// Body: { signal_id: string, notes?: string }
// Attaches a signal from the library to this campaign
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const { signal_id, notes } = await req.json() as { signal_id: string; notes?: string }

    if (!signal_id) return NextResponse.json({ error: 'signal_id required' }, { status: 400 })

    const res = await fetch(`${SB_URL}/rest/v1/ob_campaign_signals`, {
      method:  'POST',
      headers: sbHeaders('return=representation,resolution=ignore-duplicates'),
      body:    JSON.stringify({ campaign_id: id, signal_id, notes: notes ?? null }),
    })

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: err }, { status: 502 })
    }

    const [row] = await res.json().catch(() => [null])

    await logEvent({
      event_type:  'campaign_signal_added',
      entity_type: 'campaign',
      entity_id:   id,
      campaign_id: id,
      payload:     { signal_id, notes: notes ?? null },
    })

    return NextResponse.json(row ?? { ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

// DELETE /api/outbound/campaigns/[id]/signals
// Body: { signal_id: string }
// Detaches a signal from this campaign
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const { signal_id } = await req.json() as { signal_id: string }

    if (!signal_id) return NextResponse.json({ error: 'signal_id required' }, { status: 400 })

    const res = await fetch(
      `${SB_URL}/rest/v1/ob_campaign_signals?campaign_id=eq.${id}&signal_id=eq.${signal_id}`,
      { method: 'DELETE', headers: sbHeaders() }
    )

    if (!res.ok) return NextResponse.json({ error: 'Delete failed' }, { status: 502 })

    await logEvent({
      event_type:  'campaign_signal_removed',
      entity_type: 'campaign',
      entity_id:   id,
      campaign_id: id,
      payload:     { signal_id },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
