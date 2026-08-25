import { NextRequest, NextResponse } from 'next/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbHeaders() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
}

// GET /api/analytics/error-log?limit=500&source=gemini&days=30
// days=30 is the default (last 30 days). Pass days=0 for all-time.
export async function GET(req: NextRequest) {
  try {
    const params      = req.nextUrl.searchParams
    const limit       = Math.min(parseInt(params.get('limit') ?? '500'), 1000)
    const filterSource = params.get('source')
    const daysParam    = params.get('days')
    const days         = daysParam !== null ? parseInt(daysParam) : 30

    let url = `${SB_URL}/rest/v1/error_logs?select=id,created_at,source,feature,status_code,message,thread_id,resource_type,resource_id,metadata&order=created_at.desc&limit=${limit}`
    if (filterSource) url += `&source=eq.${encodeURIComponent(filterSource)}`
    if (days > 0) {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
      url += `&created_at=gte.${encodeURIComponent(since)}`
    }

    const res = await fetch(url, { headers: sbHeaders(), cache: 'no-store' })
    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: err }, { status: res.status })
    }
    const rows = await res.json()
    return NextResponse.json(Array.isArray(rows) ? rows : [])
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
