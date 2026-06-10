import { NextRequest, NextResponse } from 'next/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbHeaders(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return {
    apikey:         k,
    Authorization:  `Bearer ${k}`,
    'Content-Type': 'application/json',
    Prefer:         prefer,
  }
}

// GET /api/outbound/knowledge?product_type=Business+Assets
// Returns all active knowledge entries, optionally filtered by product_type.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const pt = searchParams.get('product_type')

    let url = `${SB_URL}/rest/v1/ob_knowledge_base?order=product_type.asc,sort_order.asc,created_at.asc`
    if (pt) url += `&product_type=eq.${encodeURIComponent(pt)}`

    const res  = await fetch(url, { headers: sbHeaders(), cache: 'no-store' })
    const data = res.ok ? await res.json() : []
    return NextResponse.json(Array.isArray(data) ? data : [])
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

// POST /api/outbound/knowledge — create manual entry
// Body: { product_type, title, content, sort_order? }
export async function POST(req: NextRequest) {
  try {
    const { product_type, title, content, sort_order } = await req.json()

    if (!product_type || !title) {
      return NextResponse.json({ error: 'product_type and title are required' }, { status: 400 })
    }

    const row = {
      product_type,
      title:      title.trim(),
      content:    (content ?? '').trim(),
      source:     'manual',
      is_active:  true,
      sort_order: sort_order ?? 0,
    }

    const res = await fetch(`${SB_URL}/rest/v1/ob_knowledge_base`, {
      method:  'POST',
      headers: sbHeaders('return=representation'),
      body:    JSON.stringify(row),
    })

    if (!res.ok) return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 })
    const [entry] = await res.json()
    return NextResponse.json({ entry })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
