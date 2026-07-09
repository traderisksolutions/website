/**
 * GET /api/nexus/rfq/insurer-stats
 *
 * Insurer responsiveness scoreboard (Workstream 3), derived from rfq_dispatches +
 * rfq_quotes. Per insurer: requests sent, reply rate, quote rate, avg response
 * time, and recommended (win) count.
 */
import { NextResponse } from 'next/server'
import { createClient }  from '@/lib/supabase/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbH() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const [dRes, qRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/rfq_dispatches?select=id,insurer_name,status,created_at,updated_at&limit=5000`, { headers: sbH(), cache: 'no-store' }),
      fetch(`${SB_URL}/rest/v1/rfq_quotes?select=dispatch_id,insurer_name,premium,status&limit=5000`, { headers: sbH(), cache: 'no-store' }),
    ])
    const dispatches: { id: string; insurer_name: string | null; status: string; created_at: string; updated_at: string | null }[] = dRes.ok ? await dRes.json() : []
    const quotes:     { dispatch_id: string; insurer_name: string | null; premium: string | null; status: string }[] = qRes.ok ? await qRes.json() : []

    const quotedDispatch = new Set(quotes.filter(q => q.premium).map(q => q.dispatch_id))
    const recommendedDispatch = new Set(quotes.filter(q => q.status === 'recommended').map(q => q.dispatch_id))
    const wonDispatch = new Set(quotes.filter(q => q.status === 'won').map(q => q.dispatch_id))

    type Agg = { insurer: string; requested: number; replied: number; quoted: number; recommended: number; won: number; respDaysSum: number; respN: number }
    const map = new Map<string, Agg>()
    for (const d of dispatches) {
      const key = d.insurer_name || '(unknown)'
      if (!map.has(key)) map.set(key, { insurer: key, requested: 0, replied: 0, quoted: 0, recommended: 0, won: 0, respDaysSum: 0, respN: 0 })
      const a = map.get(key)!
      a.requested++
      if (d.status === 'replied') {
        a.replied++
        if (d.updated_at) { a.respDaysSum += (new Date(d.updated_at).getTime() - new Date(d.created_at).getTime()) / 86_400_000; a.respN++ }
      }
      if (quotedDispatch.has(d.id)) a.quoted++
      if (recommendedDispatch.has(d.id)) a.recommended++
      if (wonDispatch.has(d.id)) a.won++
    }

    const stats = Array.from(map.values())
      .map(a => ({
        insurer:        a.insurer,
        requested:      a.requested,
        replied:        a.replied,
        quoted:         a.quoted,
        recommended:    a.recommended,
        won:            a.won,
        quote_rate:     a.requested ? Math.round((a.quoted / a.requested) * 100) : 0,
        // Win rate = of the quotes this insurer gave, how many were bound.
        win_rate:       a.quoted ? Math.round((a.won / a.quoted) * 100) : 0,
        avg_response_days: a.respN ? Math.round((a.respDaysSum / a.respN) * 10) / 10 : null,
      }))
      .sort((x, y) => y.requested - x.requested)

    return NextResponse.json(stats)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
