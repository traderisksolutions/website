import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbHeaders } from '@/lib/sb'

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
