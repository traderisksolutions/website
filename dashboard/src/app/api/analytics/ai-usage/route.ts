import { NextRequest, NextResponse } from 'next/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbHeaders() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
}

// GET /api/analytics/ai-usage?since=ISO_DATE
export async function GET(req: NextRequest) {
  try {
    const since = req.nextUrl.searchParams.get('since')
    const filter = since ? `&created_at=gte.${encodeURIComponent(since)}` : ''

    const res = await fetch(
      `${SB_URL}/rest/v1/gemini_usage_log?select=id,created_at,feature,input_tokens,output_tokens,cost_usd&order=created_at.asc${filter}&limit=5000`,
      { headers: sbHeaders() }
    )
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
