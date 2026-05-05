import { NextResponse } from 'next/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbHeaders() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return {
    apikey:        k,
    Authorization: `Bearer ${k}`,
    'Content-Type': 'application/json',
  }
}

// GET /api/outbound/history           → search log (last 30 days)
// GET /api/outbound/history?id=<uuid> → companies + people for that search
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (id) {
      const [compRes, peopleRes] = await Promise.all([
        fetch(`${SB_URL}/rest/v1/ob_company_dump?search_id=eq.${id}&order=source_rank.asc`, { headers: sbHeaders() }),
        fetch(`${SB_URL}/rest/v1/ob_people_dump?search_id=eq.${id}&order=created_at.asc`,   { headers: sbHeaders() }),
      ])
      const companies = compRes.ok   ? await compRes.json()   : []
      const people    = peopleRes.ok ? await peopleRes.json() : []
      return NextResponse.json({
        companies: Array.isArray(companies) ? companies : [],
        people:    Array.isArray(people)    ? people    : [],
      })
    }

    // Return last 30 days of searches
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const res = await fetch(
      `${SB_URL}/rest/v1/ob_search_log?created_at=gte.${cutoff}&order=created_at.desc&limit=100`,
      { headers: sbHeaders() }
    )
    const rows = res.ok ? await res.json() : []
    return NextResponse.json(Array.isArray(rows) ? rows : [])
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
