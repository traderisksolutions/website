import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbHeaders, logEvent } from '@/lib/sb'

type Params = { params: Promise<{ id: string }> }

const VALID_CODES = ['assets', 'liabilities', 'workforce', 'api', 'general'] as const
type ProductCode = typeof VALID_CODES[number]

// GET /api/outbound/campaigns/[id]/products
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const res = await fetch(
      `${SB_URL}/rest/v1/ob_campaign_products?campaign_id=eq.${id}&order=priority.asc`,
      { headers: sbHeaders() }
    )
    const data = res.ok ? await res.json() : []
    return NextResponse.json(Array.isArray(data) ? data : [])
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

// POST /api/outbound/campaigns/[id]/products
// Body: { product_code, product_name, priority?, notes? }
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id }  = await params
    const body    = await req.json() as {
      product_code: ProductCode
      product_name: string
      priority?:    number
      notes?:       string
    }

    if (!VALID_CODES.includes(body.product_code)) {
      return NextResponse.json(
        { error: `product_code must be one of: ${VALID_CODES.join(', ')}` },
        { status: 400 }
      )
    }

    const res = await fetch(`${SB_URL}/rest/v1/ob_campaign_products`, {
      method:  'POST',
      headers: sbHeaders('return=representation,resolution=ignore-duplicates'),
      body:    JSON.stringify({
        campaign_id:  id,
        product_code: body.product_code,
        product_name: body.product_name,
        priority:     body.priority ?? 1,
        notes:        body.notes    ?? null,
        is_active:    true,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: err }, { status: 502 })
    }

    const rows = await res.json()
    return NextResponse.json(Array.isArray(rows) ? (rows[0] ?? null) : rows)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

// PATCH /api/outbound/campaigns/[id]/products
// Body: { product_code, notes?, priority?, is_active? }
// Used for product overrides while campaign is paused
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id }  = await params
    const body    = await req.json() as {
      product_code: ProductCode
      notes?:       string
      priority?:    number
      is_active?:   boolean
    }

    if (!body.product_code) return NextResponse.json({ error: 'product_code required' }, { status: 400 })

    const patch: Record<string, unknown> = {}
    if (body.notes     !== undefined) patch.notes     = body.notes
    if (body.priority  !== undefined) patch.priority  = body.priority
    if (body.is_active !== undefined) patch.is_active = body.is_active

    const res = await fetch(
      `${SB_URL}/rest/v1/ob_campaign_products?campaign_id=eq.${id}&product_code=eq.${body.product_code}`,
      { method: 'PATCH', headers: sbHeaders(), body: JSON.stringify(patch) }
    )

    if (!res.ok) return NextResponse.json({ error: 'Update failed' }, { status: 502 })

    await logEvent({
      event_type:  'product_override_applied',
      entity_type: 'campaign',
      entity_id:   id,
      campaign_id: id,
      payload:     { product_code: body.product_code, patch },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
