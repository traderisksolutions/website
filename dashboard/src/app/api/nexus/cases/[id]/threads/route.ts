import { NextRequest, NextResponse } from 'next/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbHeaders(prefer = 'return=representation') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

type Params = { params: { id: string } }

// POST /api/nexus/cases/[id]/threads — link a thread to this case
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { thread_id, party_type, party_label } =
      await req.json() as { thread_id: string; party_type: string; party_label?: string }

    if (!thread_id) return NextResponse.json({ error: 'thread_id required' }, { status: 400 })

    const validTypes = ['client', 'insurer', 'lawyer', 'regulator', 'other']
    const resolvedType = validTypes.includes(party_type) ? party_type : 'other'

    const res = await fetch(`${SB_URL}/rest/v1/case_threads?on_conflict=case_id,thread_id`, {
      method:  'POST',
      headers: sbHeaders('return=representation,resolution=merge-duplicates'),
      body:    JSON.stringify({
        case_id:     params.id,
        thread_id,
        party_type:  resolvedType,
        party_label: party_label?.trim() || null,
      }),
    })

    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status })
    const rows = await res.json()

    // Bump case updated_at
    await fetch(`${SB_URL}/rest/v1/cases?id=eq.${params.id}`, {
      method:  'PATCH',
      headers: sbHeaders('return=minimal'),
      body:    JSON.stringify({ updated_at: new Date().toISOString() }),
    }).catch(() => {})

    return NextResponse.json(Array.isArray(rows) ? rows[0] : rows)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// PATCH /api/nexus/cases/[id]/threads — update party_type or party_label for a linked thread
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { thread_id, party_type, party_label } =
      await req.json() as { thread_id: string; party_type?: string; party_label?: string }

    if (!thread_id) return NextResponse.json({ error: 'thread_id required' }, { status: 400 })

    const update: Record<string, unknown> = {}
    if (party_type)  update.party_type  = party_type
    if (party_label !== undefined) update.party_label = party_label?.trim() || null

    const res = await fetch(
      `${SB_URL}/rest/v1/case_threads?case_id=eq.${params.id}&thread_id=eq.${thread_id}`,
      { method: 'PATCH', headers: sbHeaders('return=representation'), body: JSON.stringify(update) }
    )
    const rows = res.ok ? await res.json() : []
    return NextResponse.json(Array.isArray(rows) ? rows[0] : rows)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// DELETE /api/nexus/cases/[id]/threads?thread_id=X — unlink a thread from this case
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const threadId = new URL(req.url).searchParams.get('thread_id')
    if (!threadId) return NextResponse.json({ error: 'thread_id required' }, { status: 400 })

    const res = await fetch(
      `${SB_URL}/rest/v1/case_threads?case_id=eq.${params.id}&thread_id=eq.${threadId}`,
      { method: 'DELETE', headers: sbHeaders('return=minimal') }
    )
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
