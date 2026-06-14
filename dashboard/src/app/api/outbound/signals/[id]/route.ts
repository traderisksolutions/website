import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbHeaders, logEvent } from '@/lib/sb'

type Params = { params: Promise<{ id: string }> }

// GET /api/outbound/signals/[id]
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const res = await fetch(
      `${SB_URL}/rest/v1/ob_signal_library?id=eq.${id}&limit=1`,
      { headers: sbHeaders() }
    )
    const data = res.ok ? await res.json() : []
    const signal = Array.isArray(data) ? (data[0] ?? null) : null
    if (!signal) return NextResponse.json({ error: 'Signal not found' }, { status: 404 })
    return NextResponse.json(signal)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

// PATCH /api/outbound/signals/[id]
// Update status (approve → 'active', reject → 'rejected', archive → 'archived')
// or edit editable fields (relevance_notes, summary, sector)
// Body: { action?: 'approve'|'reject'|'archive', relevance_notes?, summary?, sector? }
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id }  = await params
    const body    = await req.json() as {
      action?:          'approve' | 'reject' | 'archive'
      relevance_notes?: string
      summary?:         string
      sector?:          string
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (body.action === 'approve') {
      patch.status = 'active'
    } else if (body.action === 'reject') {
      patch.status = 'rejected'
    } else if (body.action === 'archive') {
      patch.status = 'archived'
    }

    if (body.relevance_notes !== undefined) patch.relevance_notes = body.relevance_notes
    if (body.summary         !== undefined) patch.summary         = body.summary
    if (body.sector          !== undefined) patch.sector          = body.sector

    const res = await fetch(
      `${SB_URL}/rest/v1/ob_signal_library?id=eq.${id}`,
      { method: 'PATCH', headers: sbHeaders(), body: JSON.stringify(patch) }
    )

    if (!res.ok) return NextResponse.json({ error: 'Update failed' }, { status: 502 })

    if (body.action) {
      const eventMap = {
        approve: 'signal_approved',
        reject:  'signal_rejected',
        archive: 'signal_archived',
      }
      await logEvent({
        event_type:  eventMap[body.action],
        entity_type: 'signal',
        entity_id:   id,
        payload:     { action: body.action },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
