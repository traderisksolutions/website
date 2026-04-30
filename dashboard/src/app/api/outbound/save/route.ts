import { NextRequest, NextResponse } from 'next/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbHeaders() {
  const k = process.env.SUPABASE_SERVICE_KEY!
  return {
    apikey:         k,
    Authorization:  `Bearer ${k}`,
    'Content-Type': 'application/json',
    Prefer:         'return=representation,resolution=merge-duplicates',
  }
}

// POST /api/outbound/save  { record: object }
// Upserts a lead (from search results) into outbound_leads.
// On conflict of linkedin_url, updates the existing row.
export async function POST(req: NextRequest) {
  try {
    const { record } = await req.json()
    if (!record) return NextResponse.json({ error: 'record required' }, { status: 400 })

    const res = await fetch(
      `${SB_URL}/rest/v1/outbound_leads?on_conflict=linkedin_url`,
      { method: 'POST', headers: sbHeaders(), body: JSON.stringify(record) }
    )
    if (!res.ok) {
      const body = await res.text()
      return NextResponse.json({ error: body }, { status: res.status })
    }
    const data = await res.json()
    return NextResponse.json({ lead: Array.isArray(data) ? data[0] : record })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
