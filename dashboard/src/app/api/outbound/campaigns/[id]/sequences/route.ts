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

// PATCH /api/outbound/campaigns/[id]/sequences
// Body: { sequences: [{ id, subject, body, delay_days, status }] }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id }        = await params
    const { sequences } = await req.json()
    if (!Array.isArray(sequences)) return NextResponse.json({ error: 'sequences array required' }, { status: 400 })

    const results = await Promise.all(
      sequences.map(seq =>
        fetch(`${SB_URL}/rest/v1/ob_campaign_sequences?id=eq.${seq.id}&campaign_id=eq.${id}`, {
          method:  'PATCH',
          headers: sbHeaders('return=representation'),
          body:    JSON.stringify({
            subject:    seq.subject,
            body:       seq.body,
            delay_days: seq.delay_days,
            status:     seq.status ?? 'draft',
          }),
        }).then(r => r.json())
      )
    )

    return NextResponse.json({ sequences: results.flat() })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
