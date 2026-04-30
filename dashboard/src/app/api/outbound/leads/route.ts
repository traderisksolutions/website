import { NextRequest, NextResponse } from 'next/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbHeaders(returnData = false) {
  const k = process.env.SUPABASE_SERVICE_KEY!
  return {
    apikey:         k,
    Authorization:  `Bearer ${k}`,
    'Content-Type': 'application/json',
    Prefer:         returnData ? 'return=representation' : 'return=minimal',
  }
}

// GET /api/outbound/leads — all leads ordered newest first
export async function GET() {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/outbound_leads?select=*&order=created_at.desc&limit=500`,
      { headers: sbHeaders(), cache: 'no-store' }
    )
    if (!res.ok) {
      const body = await res.text()
      return NextResponse.json({ error: body }, { status: res.status })
    }
    return NextResponse.json(await res.json())
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

// PATCH /api/outbound/leads — update status and/or notes
export async function PATCH(req: NextRequest) {
  try {
    const { id, status, notes } = await req.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const update: Record<string, string> = {}
    if (status !== undefined) update.status = status
    if (notes  !== undefined) update.notes  = notes

    const res = await fetch(
      `${SB_URL}/rest/v1/outbound_leads?id=eq.${id}`,
      { method: 'PATCH', headers: sbHeaders(), body: JSON.stringify(update) }
    )
    if (!res.ok) {
      const body = await res.text()
      return NextResponse.json({ error: body }, { status: res.status })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
