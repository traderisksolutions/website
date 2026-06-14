import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbHeaders, logEvent } from '@/lib/sb'

// GET /api/outbound/signals
// Query params: status (pending|active|rejected|archived), scope, sector, limit
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const status  = searchParams.get('status')
    const scope   = searchParams.get('scope')
    const sector  = searchParams.get('sector')
    const limit   = searchParams.get('limit') ?? '100'

    const filters: string[] = []
    if (status) filters.push(`status=eq.${status}`)
    if (scope)  filters.push(`scope=eq.${scope}`)
    if (sector) filters.push(`sector=eq.${encodeURIComponent(sector)}`)

    const qs = [
      ...filters,
      `order=discovered_at.desc`,
      `limit=${limit}`,
    ].join('&')

    const res = await fetch(`${SB_URL}/rest/v1/ob_signal_library?${qs}`, {
      headers: sbHeaders(),
    })
    const data = res.ok ? await res.json() : []
    return NextResponse.json(Array.isArray(data) ? data : [])
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

// POST /api/outbound/signals
// Creates a new signal. If corroboration_group_id is provided, increments count on peers.
// Body: { scope, sector?, signal_type, headline, summary?, source_url, source_domain?,
//         published_at?, relevance_notes?, corroboration_group_id?, created_by_agent? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      scope:                  'sector' | 'company'
      sector?:                string
      signal_type:            string
      headline:               string
      summary?:               string
      source_url:             string
      source_domain?:         string
      published_at?:          string
      relevance_notes?:       string
      corroboration_group_id?: string
      created_by_agent?:      boolean
      metadata?:              Record<string, unknown>
    }

    if (!body.scope || !body.signal_type || !body.headline || !body.source_url) {
      return NextResponse.json(
        { error: 'scope, signal_type, headline, and source_url are required' },
        { status: 400 }
      )
    }

    const res = await fetch(`${SB_URL}/rest/v1/ob_signal_library`, {
      method:  'POST',
      headers: sbHeaders('return=representation'),
      body:    JSON.stringify({
        scope:                  body.scope,
        sector:                 body.sector                 ?? null,
        signal_type:            body.signal_type,
        headline:               body.headline,
        summary:                body.summary                ?? null,
        source_url:             body.source_url,
        source_domain:          body.source_domain          ?? null,
        published_at:           body.published_at           ?? null,
        relevance_notes:        body.relevance_notes        ?? null,
        corroboration_group_id: body.corroboration_group_id ?? null,
        created_by_agent:       body.created_by_agent       ?? false,
        metadata:               body.metadata               ?? null,
        status:                 'pending',
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: err }, { status: 502 })
    }

    const [signal] = await res.json()

    // If this signal shares a corroboration group, bump the count on all peers
    if (body.corroboration_group_id) {
      const peersRes = await fetch(
        `${SB_URL}/rest/v1/ob_signal_library?corroboration_group_id=eq.${body.corroboration_group_id}&id=neq.${signal.id}`,
        { headers: sbHeaders() }
      )
      const peers: { id: string; corroboration_count: number }[] = peersRes.ok ? await peersRes.json() : []
      const newCount = peers.length + 1 // all peers + this signal

      if (peers.length > 0) {
        // Update count on existing peers
        await fetch(
          `${SB_URL}/rest/v1/ob_signal_library?corroboration_group_id=eq.${body.corroboration_group_id}&id=neq.${signal.id}`,
          {
            method:  'PATCH',
            headers: sbHeaders(),
            body:    JSON.stringify({ corroboration_count: newCount }),
          }
        )
        // Update count on the newly created signal
        await fetch(
          `${SB_URL}/rest/v1/ob_signal_library?id=eq.${signal.id}`,
          {
            method:  'PATCH',
            headers: sbHeaders(),
            body:    JSON.stringify({ corroboration_count: newCount }),
          }
        )
        signal.corroboration_count = newCount
      }
    }

    await logEvent({
      event_type:  'signal_created',
      entity_type: 'signal',
      entity_id:   signal.id,
      payload:     {
        signal_type: signal.signal_type,
        headline:    signal.headline,
        corroboration_group_id: body.corroboration_group_id ?? null,
      },
    })

    return NextResponse.json(signal)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
