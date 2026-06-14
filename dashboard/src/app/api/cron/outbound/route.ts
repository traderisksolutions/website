import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

const SB = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

// GET /api/cron/outbound
// Called by Vercel cron. Two passes:
// 1. Re-runs ob_search_log entries flagged for cron (one-shot repeats from the agent flow)
// 2. Runs active outbound_schedules whose next_run_at has passed (recurring scheduled searches)
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const k = process.env.SUPABASE_SERVICE_KEY!
  const h = { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }

  const now    = new Date().toISOString()
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  const cronHeaders = {
    'Content-Type':  'application/json',
    Authorization:   `Bearer ${process.env.CRON_SECRET}`,
  }

  let ran = 0

  // ── Pass 1: ob_search_log one-shot re-runs ──────────────────────────────────
  const logRes = await fetch(
    `${SB}/rest/v1/ob_search_log?cron_preference=neq.null&status=eq.scheduled&select=*&order=created_at.desc&limit=10`,
    { headers: h, cache: 'no-store' }
  )
  const logSchedules: Array<{
    id: string; sector: string; location: string; locations: string[]
    headcount_ranges: string[]; product_type: string
  }> = logRes.ok ? await logRes.json() : []

  for (const s of logSchedules) {
    try {
      await fetch(`${origin}/api/outbound/apollo-search`, {
        method:  'POST',
        headers: cronHeaders,
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

  // ── Pass 2: outbound_schedules recurring runs ───────────────────────────────
  const schedRes = await fetch(
    `${SB}/rest/v1/outbound_schedules?is_active=eq.true&next_run_at=lte.${now}&select=*&order=next_run_at.asc&limit=5`,
    { headers: h, cache: 'no-store' }
  )
  const outboundSchedules: Array<{
    id: string; sector: string; locations: string[]
    headcount_ranges: string[]; product_type: string; frequency: string
  }> = schedRes.ok ? await schedRes.json() : []

  for (const s of outboundSchedules) {
    try {
      await fetch(`${origin}/api/outbound/apollo-search`, {
        method:  'POST',
        headers: cronHeaders,
        body:    JSON.stringify({
          sector:          s.sector,
          locations:       Array.isArray(s.locations) && s.locations.length > 0 ? s.locations : ['Singapore'],
          headcountRanges: s.headcount_ranges ?? [],
          productType:     s.product_type     ?? 'General',
          cronPreference:  null,
        }),
      })

      // Advance next_run_at based on frequency
      const next = new Date()
      if (s.frequency === 'weekly') {
        next.setDate(next.getDate() + 7)
      } else {
        next.setDate(next.getDate() + 1)
      }

      await fetch(`${SB}/rest/v1/outbound_schedules?id=eq.${s.id}`, {
        method:  'PATCH',
        headers: { ...h, Prefer: 'return=minimal' },
        body:    JSON.stringify({ next_run_at: next.toISOString() }),
      })
      ran++
    } catch { /* continue other schedules */ }
  }

  return NextResponse.json({ ran, log_ran: logSchedules.length, schedule_ran: outboundSchedules.length, at: now })
}
