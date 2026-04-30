import { NextRequest, NextResponse } from 'next/server'
import { runOutboundAgent } from '@/lib/outbound-agent'

export const maxDuration = 60

const SB = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

// GET /api/cron/outbound
// Called by Vercel cron daily at 07:00 SGT (23:00 UTC).
// Runs all active schedules whose next_run_at has passed.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const k = process.env.SUPABASE_SERVICE_KEY!
  const h = { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }

  const now = new Date().toISOString()
  const res = await fetch(
    `${SB}/rest/v1/outbound_schedules?is_active=eq.true&next_run_at=lte.${now}&select=*`,
    { headers: h, cache: 'no-store' }
  )
  const schedules: Array<{
    id: string; query: string; roles: string[]; max_companies: number;
    frequency: string; runs_count: number
  }> = await res.json()

  let ran = 0
  for (const s of schedules) {
    const result = await runOutboundAgent({
      query:        s.query,
      roles:        s.roles,
      maxCompanies: Math.min(s.max_companies ?? 5, 5), // keep cron runs lean
    })

    const nextRun = new Date(
      Date.now() + (s.frequency === 'weekly' ? 7 : 1) * 86400 * 1000
    ).toISOString()

    await fetch(`${SB}/rest/v1/outbound_schedules?id=eq.${s.id}`, {
      method: 'PATCH',
      headers: { ...h, Prefer: 'return=minimal' },
      body: JSON.stringify({
        last_run_at: now,
        next_run_at: nextRun,
        runs_count:  (s.runs_count ?? 0) + 1,
        leads_last:  result.leadsTotal,
      }),
    })
    ran++
  }

  return NextResponse.json({ ran, total: schedules.length, at: now })
}
