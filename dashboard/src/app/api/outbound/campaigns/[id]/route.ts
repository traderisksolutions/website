import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbHeaders } from '@/lib/sb'

// GET /api/outbound/campaigns/[id] — campaign + sequences
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const [campRes, seqRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/ob_campaigns?id=eq.${id}`, { headers: sbHeaders() }),
      fetch(`${SB_URL}/rest/v1/ob_campaign_sequences?campaign_id=eq.${id}&order=step_number.asc`, { headers: sbHeaders() }),
    ])

    const [campaign] = campRes.ok ? await campRes.json() : [null]
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

    const sequences = seqRes.ok ? await seqRes.json() : []

    return NextResponse.json({ campaign, sequences })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

// PATCH /api/outbound/campaigns/[id] — update campaign fields
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id }  = await params
    const updates = await req.json()

    const res = await fetch(`${SB_URL}/rest/v1/ob_campaigns?id=eq.${id}`, {
      method:  'PATCH',
      headers: sbHeaders('return=representation'),
      body:    JSON.stringify(updates),
    })
    if (!res.ok) return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    const [updated] = await res.json()
    return NextResponse.json({ campaign: updated })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
