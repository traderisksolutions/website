import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rpConfigured, rpGet } from '@/lib/roadplus-db'

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

type Quote = { journey_id: string | null; visitor_id: string | null; session_id: string | null; status: string | null; geo_area: string | null; policy_type: string | null }
type Event = { journey_id: string | null; step: string | null; status: string | null }

const FUNNEL_STEPS = ['quote_open', 'premium', 'finalize', 'payment_redirect', 'policy_issued']

// GET /api/roadplus/analytics → no-login behaviour analytics from the roadplus DB.
export async function GET() {
  if (!(await requireUser()))
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!rpConfigured())
    return NextResponse.json({ configured: false })

  try {
    const [quotes, events] = await Promise.all([
      rpGet<Quote[]>('quotes?select=journey_id,visitor_id,session_id,status,geo_area,policy_type&order=created_at.desc&limit=8000'),
      rpGet<Event[]>('journey_events?select=journey_id,step,status&order=created_at.desc&limit=20000'),
    ])

    // ── funnel: distinct journeys reaching each step ────────────────────────
    const stepJourneys: Record<string, Set<string>> = {}
    FUNNEL_STEPS.forEach((s) => (stepJourneys[s] = new Set()))
    let failures = 0
    for (const e of events) {
      if (e.status === 'fail') failures++
      if (e.step && stepJourneys[e.step] && e.journey_id) stepJourneys[e.step].add(e.journey_id)
    }
    const funnel = FUNNEL_STEPS.map((s) => ({ step: s, journeys: stepJourneys[s].size }))

    // ── visitor / session / search aggregates ───────────────────────────────
    const visitors = new Set<string>()
    const sessions = new Set<string>()
    const searchesBySession: Record<string, number> = {}
    const sessionsByVisitor: Record<string, Set<string>> = {}
    const searchesByJourney: Record<string, number> = {}
    const regionSplit: Record<string, number> = {}
    const typeSplit: Record<string, number> = {}
    let searches = 0
    let purchaseIntent = 0

    for (const q of quotes) {
      if (q.visitor_id) visitors.add(q.visitor_id)
      if (q.session_id) sessions.add(q.session_id)
      if (q.visitor_id && q.session_id) (sessionsByVisitor[q.visitor_id] ??= new Set()).add(q.session_id)
      if (q.status === 'quoted') {
        searches++
        if (q.session_id) searchesBySession[q.session_id] = (searchesBySession[q.session_id] ?? 0) + 1
        if (q.journey_id) searchesByJourney[q.journey_id] = (searchesByJourney[q.journey_id] ?? 0) + 1
        if (q.geo_area) regionSplit[q.geo_area] = (regionSplit[q.geo_area] ?? 0) + 1
        if (q.policy_type) typeSplit[q.policy_type] = (typeSplit[q.policy_type] ?? 0) + 1
      }
      if (q.status === 'pending_payment') purchaseIntent++
    }

    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
    const sessionSearchVals = Object.values(searchesBySession).filter((v) => v > 0)
    const sessionsPerVisitorVals = Object.values(sessionsByVisitor).map((s) => s.size)
    const convertedSearchVals = Array.from(stepJourneys.payment_redirect)
      .map((j) => searchesByJourney[j] ?? 0)
      .filter((v) => v > 0)

    const opened = stepJourneys.quote_open.size || stepJourneys.premium.size
    const paid = stepJourneys.payment_redirect.size
    const issued = stepJourneys.policy_issued.size

    return NextResponse.json({
      configured: true,
      totals: {
        visitors: visitors.size,
        sessions: sessions.size,
        searches,
        purchaseIntent,
        issued,
      },
      rates: {
        conversion: opened ? paid / opened : 0,
        repeatVisitor: sessionsPerVisitorVals.length
          ? sessionsPerVisitorVals.filter((v) => v > 1).length / sessionsPerVisitorVals.length
          : 0,
        avgSearchesPerSession: avg(sessionSearchVals),
        avgSessionsPerVisitor: avg(sessionsPerVisitorVals),
        avgSearchesBeforePurchase: avg(convertedSearchVals),
      },
      funnel,
      regionSplit,
      typeSplit,
      failures,
    })
  } catch (e) {
    return NextResponse.json({ configured: true, error: String(e) }, { status: 502 })
  }
}
