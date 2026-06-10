import { NextRequest, NextResponse } from 'next/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbHeaders(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return {
    apikey:        k,
    Authorization: `Bearer ${k}`,
    'Content-Type': 'application/json',
    Prefer:        prefer,
  }
}

// GET /api/outbound/campaigns/[id] — campaign + sequences + sends summary
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const [campRes, seqRes, sendsRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/ob_campaigns?id=eq.${id}`, { headers: sbHeaders() }),
      fetch(`${SB_URL}/rest/v1/ob_campaign_sequences?campaign_id=eq.${id}&order=step_number.asc`, { headers: sbHeaders() }),
      fetch(`${SB_URL}/rest/v1/ob_campaign_sends?campaign_id=eq.${id}&select=status`, { headers: sbHeaders() }),
    ])

    const [campaign] = campRes.ok ? await campRes.json() : [null]
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

    const sequences = seqRes.ok  ? await seqRes.json()  : []
    const sends     = sendsRes.ok ? await sendsRes.json() : []

    return NextResponse.json({ campaign, sequences, sends })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

// PATCH /api/outbound/campaigns/[id] — update campaign fields
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id }  = await params
    const updates = await req.json()

    const res = await fetch(`${SB_URL}/rest/v1/ob_campaigns?id=eq.${id}`, {
      method:  'PATCH',
      headers: sbHeaders('return=representation'),
      body:    JSON.stringify(updates),
    })
    if (!res.ok) return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    const [updated] = await res.json()
    return NextResponse.json({ campaign: updated })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
