import { NextRequest, NextResponse } from 'next/server'
import { getRemainingBudget, recordUsage } from '@/lib/apollo-budget'
import { getActiveTargetIndustries } from '@/lib/active-campaign-industries'

export const maxDuration = 120

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
const DEFAULT_LOCATIONS = ['Singapore']

// GET /api/cron/daily-lead-discovery
// Called once daily. The automated version of the manual Apollo wizard
// (search → people → email-reveal, each step already auto-enrolling on email reveal — see
// src/lib/auto-enroll.ts) — but budget-capped and self-targeting instead of a human picking
// a sector each time.
//
// Deliberately conservative: runs ONE sector per day (rotated so every active campaign's
// target industry gets covered over time, not just the first alphabetically), spends only a
// few credits per run, and does nothing at all if there's no budget left or no active
// campaign to target — it never invents a sector to search on its own.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const remaining = await getRemainingBudget()
  if (remaining <= 0) {
    return NextResponse.json({ ran: false, reason: 'budget_exhausted' })
  }

  // Target industries come from active campaigns' segments — this cron only ever searches
  // for what a human has already told the system to target via an active, approved campaign.
  const industries = await getActiveTargetIndustries()
  if (industries.length === 0) {
    return NextResponse.json({ ran: false, reason: 'no_active_campaign_target' })
  }

  // Rotate by day-of-year so every industry gets a turn over time rather than always hitting
  // the first one — a fixed daily pick would starve every industry after the first.
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000)
  const sector = industries[dayOfYear % industries.length]

  const perPage = Math.min(3, remaining) // small, steady trickle within budget
  const cronHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRON_SECRET}` }

  let creditsThisRun = 0
  const summary: Record<string, unknown> = { ran: true, sector, at: new Date().toISOString() }

  try {
    // Step 1 — company discovery (reuses the same route the manual wizard's step 1 calls)
    const searchRes = await fetch(`${APP_ORIGIN}/api/outbound/apollo-search`, {
      method: 'POST', headers: cronHeaders,
      body: JSON.stringify({ sector, locations: DEFAULT_LOCATIONS, perPage }),
    })
    if (!searchRes.ok) {
      summary.step1_error = await searchRes.text()
      return NextResponse.json(summary)
    }
    const searchData = await searchRes.json() as { searchId: string; companies: { id: string }[]; creditsUsed: number }
    creditsThisRun += searchData.creditsUsed ?? 0
    summary.companies_found = searchData.companies?.length ?? 0

    if (!searchData.companies || searchData.companies.length === 0) {
      await recordUsage(creditsThisRun)
      return NextResponse.json({ ...summary, credits_used: creditsThisRun })
    }

    // Step 2 — people search for the newly discovered companies
    const peopleRes = await fetch(`${APP_ORIGIN}/api/outbound/apollo-people`, {
      method: 'POST', headers: cronHeaders,
      body: JSON.stringify({ searchId: searchData.searchId, companyIds: searchData.companies.map(c => c.id) }),
    })
    if (!peopleRes.ok) {
      summary.step2_error = await peopleRes.text()
      await recordUsage(creditsThisRun)
      return NextResponse.json({ ...summary, credits_used: creditsThisRun })
    }
    const peopleData = await peopleRes.json() as { people: { id: string }[] }
    const peopleFound = peopleData.people?.length ?? 0
    creditsThisRun += peopleFound // Apollo doesn't report a credit count for people search — approximate 1/person
    summary.people_found = peopleFound

    if (peopleFound === 0) {
      await recordUsage(creditsThisRun)
      return NextResponse.json({ ...summary, credits_used: creditsThisRun })
    }

    // Step 3 — email reveal (this is what actually triggers auto-enrollment, per apollo-email)
    const emailRes = await fetch(`${APP_ORIGIN}/api/outbound/apollo-email`, {
      method: 'POST', headers: cronHeaders,
      body: JSON.stringify({ personIds: peopleData.people.map(p => p.id) }),
    })
    if (!emailRes.ok) {
      summary.step3_error = await emailRes.text()
      await recordUsage(creditsThisRun)
      return NextResponse.json({ ...summary, credits_used: creditsThisRun })
    }
    const emailData = await emailRes.json() as { results: { email: string | null }[] }
    const emailsRevealed = emailData.results?.filter(r => r.email).length ?? 0
    creditsThisRun += emailsRevealed // same approximation as step 2
    summary.emails_revealed = emailsRevealed

    await recordUsage(creditsThisRun)
    return NextResponse.json({ ...summary, credits_used: creditsThisRun, budget_remaining_after: Math.max(0, remaining - creditsThisRun) })
  } catch (e) {
    await recordUsage(creditsThisRun) // record whatever was actually spent before the failure
    return NextResponse.json({ ...summary, error: e instanceof Error ? e.message : 'Server error', credits_used: creditsThisRun }, { status: 500 })
  }
}
