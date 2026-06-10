import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

const SB = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

// GET /api/cron/outbound
// Called by Vercel cron. Runs all active ob_search_log schedules whose next_run_at has passed.
// Triggers apollo-search for each due schedule.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const k = process.env.SUPABASE_SERVICE_KEY!
  const h = { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }

  const now = new Date().toISOString()

  // Fetch active schedules due to run
  const res = await fetch(
    `${SB}/rest/v1/ob_search_log?cron_preference=neq.null&status=eq.scheduled&select=*&order=created_at.desc&limit=10`,
    { headers: h, cache: 'no-store' }
  )
  const schedules: Array<{
    id: string; sector: string; location: string; locations: string[]
    headcount_ranges: string[]; product_type: string
  }> = res.ok ? await res.json() : []

  let ran = 0
  for (const s of schedules) {
    try {
      const origin = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
      await fetch(`${origin}/api/outbound/apollo-search`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRON_SECRET}` },
        body:    JSON.stringify({
          sector:          s.sector,
          locations:       s.locations ?? [s.location],
          headcountRanges: s.headcount_ranges ?? [],
          productType:     s.product_type,
          cronPreference:  null,
        }),
      })

      await fetch(`${SB}/rest/v1/ob_search_log?id=eq.${s.id}`, {
        method:  'PATCH',
        headers: { ...h, Prefer: 'return=minimal' },
        body:    JSON.stringify({ status: 'completed', cron_last_run: now }),
      })
      ran++
    } catch { /* continue other schedules */ }
  }

  return NextResponse.json({ ran, total: schedules.length, at: now })
}
