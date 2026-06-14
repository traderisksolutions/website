import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbHeaders } from '@/lib/sb'

type Params = { params: Promise<{ id: string }> }

// GET /api/outbound/campaigns/[id]/segments
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const res = await fetch(
      `${SB_URL}/rest/v1/ob_campaign_segments?campaign_id=eq.${id}&order=created_at.asc`,
      { headers: sbHeaders() }
    )
    const data = res.ok ? await res.json() : []
    return NextResponse.json(Array.isArray(data) ? data : [])
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

// POST /api/outbound/campaigns/[id]/segments
// Body: segment fields
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id }  = await params
    const body    = await req.json()

    const res = await fetch(`${SB_URL}/rest/v1/ob_campaign_segments`, {
      method:  'POST',
      headers: sbHeaders('return=representation'),
      body:    JSON.stringify({ ...body, campaign_id: id }),
    })

    if (!res.ok) return NextResponse.json({ error: 'Create failed' }, { status: 502 })
    const [seg] = await res.json()
    return NextResponse.json(seg)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

// PATCH /api/outbound/campaigns/[id]/segments
// Body: { segment_id, ...fields }
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id }        = await params
    const { segment_id, ...rest } = await req.json() as { segment_id: string; [k: string]: unknown }

    if (!segment_id) return NextResponse.json({ error: 'segment_id required' }, { status: 400 })

    const res = await fetch(
      `${SB_URL}/rest/v1/ob_campaign_segments?id=eq.${segment_id}&campaign_id=eq.${id}`,
      {
        method:  'PATCH',
        headers: sbHeaders(),
        body:    JSON.stringify({ ...rest, updated_at: new Date().toISOString() }),
      }
    )

    if (!res.ok) return NextResponse.json({ error: 'Update failed' }, { status: 502 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

// DELETE /api/outbound/campaigns/[id]/segments
// Body: { segment_id }
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { id }        = await params
    const { segment_id } = await req.json() as { segment_id: string }

    if (!segment_id) return NextResponse.json({ error: 'segment_id required' }, { status: 400 })

    // Soft-delete: set is_active = false
    const res = await fetch(
      `${SB_URL}/rest/v1/ob_campaign_segments?id=eq.${segment_id}&campaign_id=eq.${id}`,
      {
        method:  'PATCH',
        headers: sbHeaders(),
        body:    JSON.stringify({ is_active: false, updated_at: new Date().toISOString() }),
      }
    )

    if (!res.ok) return NextResponse.json({ error: 'Delete failed' }, { status: 502 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
