import { NextResponse } from 'next/server'
import { syncAllSites } from '@/lib/marketing/gsc/sync'
import { withCron } from '@/lib/auth/guard'

// Daily Search Console pull for every connected site. Google's data lags 2 to 3 days.
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export const GET = withCron(async () => {
  try {
    const results = await syncAllSites()
    console.info('gsc-sync', JSON.stringify(results))
    return NextResponse.json({ results })
  } catch (e) {
    console.error('gsc-sync failed', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
})
