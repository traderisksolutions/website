import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbHeaders, logEvent } from '@/lib/sb'

type Params = { params: Promise<{ id: string }> }

// GET /api/outbound/campaigns/[id]/brief
// Returns the current active brief (draft or approved), plus approved signals snapshot
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params

    const [briefRes, signalsRes, productsRes, segmentsRes] = await Promise.all([
      fetch(
        `${SB_URL}/rest/v1/ob_campaign_briefs` +
        `?campaign_id=eq.${id}&status=in.(draft,approved)&order=created_at.desc&limit=1`,
        { headers: sbHeaders() }
      ),
      fetch(
        `${SB_URL}/rest/v1/ob_campaign_signals` +
        `?campaign_id=eq.${id}&order=created_at.desc`,
        { headers: sbHeaders() }
      ),
      fetch(
        `${SB_URL}/rest/v1/ob_campaign_products` +
        `?campaign_id=eq.${id}&is_active=eq.true&order=priority.asc`,
        { headers: sbHeaders() }
      ),
      fetch(
        `${SB_URL}/rest/v1/ob_campaign_segments` +
        `?campaign_id=eq.${id}&is_active=eq.true&order=created_at.asc`,
        { headers: sbHeaders() }
      ),
    ])

    const [briefs, signals, products, segments] = await Promise.all([
      briefRes.ok    ? briefRes.json()    : [],
      signalsRes.ok  ? signalsRes.json()  : [],
      productsRes.ok ? productsRes.json() : [],
      segmentsRes.ok ? segmentsRes.json() : [],
    ])

    const brief = Array.isArray(briefs) ? (briefs[0] ?? null) : null

    return NextResponse.json({ brief, signals, products, segments })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

// POST /api/outbound/campaigns/[id]/brief
// Creates a new brief draft.
// If an existing approved brief exists, it is marked 'superseded'.
// Body: { products, target_segments, approved_signal_ids, messaging_goals, constraints }
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id }  = await params
    const body    = await req.json()

    // Supersede any existing approved brief
    await fetch(
      `${SB_URL}/rest/v1/ob_campaign_briefs?campaign_id=eq.${id}&status=eq.approved`,
      {
        method:  'PATCH',
        headers: sbHeaders(),
        body:    JSON.stringify({ status: 'superseded', updated_at: new Date().toISOString() }),
      }
    )

    // Get current version number
    const existingRes = await fetch(
      `${SB_URL}/rest/v1/ob_campaign_briefs?campaign_id=eq.${id}&select=version_number&order=version_number.desc&limit=1`,
      { headers: sbHeaders() }
    )
    const existing = existingRes.ok ? await existingRes.json() : []
    const nextVersion = (Array.isArray(existing) && existing[0]?.version_number)
      ? existing[0].version_number + 1
      : 1

    const res = await fetch(`${SB_URL}/rest/v1/ob_campaign_briefs`, {
      method:  'POST',
      headers: sbHeaders('return=representation'),
      body:    JSON.stringify({
        campaign_id:         id,
        version_number:      nextVersion,
        products:            body.products            ?? [],
        target_segments:     body.target_segments     ?? [],
        approved_signal_ids: body.approved_signal_ids ?? [],
        messaging_goals:     body.messaging_goals     ?? {},
        constraints:         body.constraints         ?? {},
        status:              'draft',
      }),
    })

    if (!res.ok) return NextResponse.json({ error: 'Create brief failed' }, { status: 502 })
    const [brief] = await res.json()

    await logEvent({
      event_type:  'brief_generated',
      entity_type: 'brief',
      entity_id:   brief.id,
      campaign_id: id,
      payload:     { version_number: nextVersion },
    })

    return NextResponse.json(brief)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

// PATCH /api/outbound/campaigns/[id]/brief
// Update brief fields while in draft, OR approve (body: { approve: true })
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id }  = await params
    const body    = await req.json() as {
      brief_id?:           string
      approve?:            boolean
      products?:           unknown[]
      target_segments?:    unknown[]
      approved_signal_ids?: unknown[]
      messaging_goals?:    Record<string, unknown>
      constraints?:        Record<string, unknown>
    }

    // Resolve which brief to operate on
    let briefId = body.brief_id
    if (!briefId) {
      const res = await fetch(
        `${SB_URL}/rest/v1/ob_campaign_briefs?campaign_id=eq.${id}&status=eq.draft&select=id&order=created_at.desc&limit=1`,
        { headers: sbHeaders() }
      )
      const rows = res.ok ? await res.json() : []
      briefId = Array.isArray(rows) && rows[0] ? rows[0].id : undefined
    }

    if (!briefId) {
      return NextResponse.json({ error: 'No draft brief found' }, { status: 404 })
    }

    if (body.approve) {
      // Approve brief
      const res = await fetch(
        `${SB_URL}/rest/v1/ob_campaign_briefs?id=eq.${briefId}&campaign_id=eq.${id}`,
        {
          method:  'PATCH',
          headers: sbHeaders(),
          body:    JSON.stringify({
            status:      'approved',
            approved_at: new Date().toISOString(),
            updated_at:  new Date().toISOString(),
          }),
        }
      )

      if (!res.ok) return NextResponse.json({ error: 'Approve failed' }, { status: 502 })

      await logEvent({
        event_type:  'brief_approved',
        entity_type: 'brief',
        entity_id:   briefId,
        campaign_id: id,
        payload:     { brief_id: briefId },
      })

      return NextResponse.json({ ok: true, approved: true })
    }

    // Update draft fields
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.products            !== undefined) patch.products            = body.products
    if (body.target_segments     !== undefined) patch.target_segments     = body.target_segments
    if (body.approved_signal_ids !== undefined) patch.approved_signal_ids = body.approved_signal_ids
    if (body.messaging_goals     !== undefined) patch.messaging_goals     = body.messaging_goals
    if (body.constraints         !== undefined) patch.constraints         = body.constraints

    const res = await fetch(
      `${SB_URL}/rest/v1/ob_campaign_briefs?id=eq.${briefId}&campaign_id=eq.${id}`,
      { method: 'PATCH', headers: sbHeaders(), body: JSON.stringify(patch) }
    )

    if (!res.ok) return NextResponse.json({ error: 'Update failed' }, { status: 502 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
