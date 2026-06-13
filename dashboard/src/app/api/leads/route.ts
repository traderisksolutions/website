import { NextRequest, NextResponse } from 'next/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function key() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return k
}

function headers() {
  return {
    apikey:        key(),
    Authorization: `Bearer ${key()}`,
    'Content-Type': 'application/json',
    Prefer:        'return=minimal',
  }
}

// GET /api/leads — fetch all leads ordered by created_at desc
export async function GET() {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/inbound_leads?select=*&order=created_at.desc&limit=200`,
      { headers: headers(), cache: 'no-store' }
    )
    if (!res.ok) {
      const body = await res.text()
      return NextResponse.json({ error: body }, { status: res.status })
    }
    const data = await res.json()
    return NextResponse.json(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// PATCH /api/leads — update status and/or notes for one lead
export async function PATCH(req: NextRequest) {
  try {
    const { id, status, notes } = await req.json() as { id?: string; status?: string; notes?: string }
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const patch: Record<string, unknown> = {}
    if (status !== undefined) patch.status = status
    if (notes  !== undefined) patch.notes  = notes
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })

    const res = await fetch(
      `${SB_URL}/rest/v1/inbound_leads?id=eq.${id}`,
      { method: 'PATCH', headers: headers(), body: JSON.stringify(patch) }
    )
    if (!res.ok) {
      const body = await res.text()
      return NextResponse.json({ error: body }, { status: res.status })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
