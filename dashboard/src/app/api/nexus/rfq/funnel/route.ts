/**
 * GET /api/nexus/rfq/funnel — RFQ pipeline funnel + win metrics (#4).
 *
 * Per line of insurance (rfq_requests) across all cases:
 *   requested → dispatched → quoted → recommended → won  (+ lost)
 * plus win rate, lines in flight, and average time-to-quote.
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

    const [reqRes, dispRes, quoteRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/rfq_requests?select=id,status,decided_at,created_at&limit=5000`, { headers: sbH(), cache: 'no-store' }),
      fetch(`${SB_URL}/rest/v1/rfq_dispatches?select=rfq_request_id,status,created_at,updated_at&limit=5000`, { headers: sbH(), cache: 'no-store' }),
      fetch(`${SB_URL}/rest/v1/rfq_quotes?select=rfq_request_id,premium,status&limit=5000`, { headers: sbH(), cache: 'no-store' }),
    ])
    const requests:   { id: string; status: string; decided_at: string | null; created_at: string }[] = reqRes.ok ? await reqRes.json() : []
    const dispatches: { rfq_request_id: string; status: string; created_at: string; updated_at: string | null }[] = dispRes.ok ? await dispRes.json() : []
    const quotes:     { rfq_request_id: string | null; premium: string | null; status: string }[] = quoteRes.ok ? await quoteRes.json() : []

    const dispatchedLines = new Set(dispatches.map(d => d.rfq_request_id))
    const quotedLines      = new Set(quotes.filter(q => q.premium && q.rfq_request_id).map(q => q.rfq_request_id as string))
    const recommendedLines = new Set(quotes.filter(q => q.status === 'recommended' && q.rfq_request_id).map(q => q.rfq_request_id as string))

    const total       = requests.length
    const dispatched  = requests.filter(r => dispatchedLines.has(r.id)).length
    const quoted      = requests.filter(r => quotedLines.has(r.id)).length
    const recommended = requests.filter(r => recommendedLines.has(r.id) || r.status === 'won').length
    const won         = requests.filter(r => r.status === 'won').length
    const lost        = requests.filter(r => r.status === 'lost').length
    const inFlight    = requests.filter(r => !['won', 'lost', 'closed'].includes(r.status)).length

    // Win rate = won / decided lines (won + lost).
    const decided  = won + lost
    const winRate  = decided ? Math.round((won / decided) * 100) : 0
    // Quote conversion = quoted / dispatched.
    const quoteConv = dispatched ? Math.round((quoted / dispatched) * 100) : 0

    // Avg time-to-quote (days): dispatch created → first replied dispatch on the line.
    let ttqSum = 0, ttqN = 0
    const firstReplyByLine = new Map<string, number>()
    for (const d of dispatches) {
      if (d.status === 'replied' && d.updated_at) {
        const t = new Date(d.updated_at).getTime() - new Date(d.created_at).getTime()
        const prev = firstReplyByLine.get(d.rfq_request_id)
        if (prev === undefined || t < prev) firstReplyByLine.set(d.rfq_request_id, t)
      }
    }
    for (const ms of Array.from(firstReplyByLine.values())) { ttqSum += ms / 86_400_000; ttqN++ }
    const avgTimeToQuoteDays = ttqN ? Math.round((ttqSum / ttqN) * 10) / 10 : null

    // Avg time-to-decision (days): line created → decided_at.
    let ttdSum = 0, ttdN = 0
    for (const r of requests) {
      if (r.decided_at) { ttdSum += (new Date(r.decided_at).getTime() - new Date(r.created_at).getTime()) / 86_400_000; ttdN++ }
    }
    const avgTimeToDecisionDays = ttdN ? Math.round((ttdSum / ttdN) * 10) / 10 : null

    return NextResponse.json({
      funnel: { requested: total, dispatched, quoted, recommended, won, lost },
      win_rate: winRate,
      quote_conversion: quoteConv,
      in_flight: inFlight,
      avg_time_to_quote_days: avgTimeToQuoteDays,
      avg_time_to_decision_days: avgTimeToDecisionDays,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
