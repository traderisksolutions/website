import { NextRequest, NextResponse } from 'next/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbHeaders(prefer = 'return=representation') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return {
    apikey:         k,
    Authorization:  `Bearer ${k}`,
    'Content-Type': 'application/json',
    Prefer:         prefer,
  }
}

// GET /api/signatures — list all active signatures
export async function GET() {
  try {
    const res  = await fetch(
      `${SB_URL}/rest/v1/user_signatures?select=id,name,title,phone,is_active&order=created_at.asc`,
      { headers: sbHeaders(), cache: 'no-store' }
    )
    const rows = res.ok ? await res.json() : []
    return NextResponse.json(Array.isArray(rows) ? rows : [])
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

// POST /api/signatures — create a signature
export async function POST(req: NextRequest) {
  try {
    const { name, title, phone } = await req.json() as { name?: string; title?: string; phone?: string }
    if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })

    const res = await fetch(`${SB_URL}/rest/v1/user_signatures`, {
      method:  'POST',
      headers: sbHeaders(),
      body:    JSON.stringify({ name: name.trim(), title: title?.trim() ?? null, phone: phone?.trim() ?? null }),
    })
    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: 'Failed to create signature' }, { status: 500 })
    return NextResponse.json(Array.isArray(data) ? data[0] : data)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
