import { NextRequest, NextResponse } from 'next/server'
import { runEnrichment } from '@/lib/sales/enrich'

// Hourly email lookup for pending drafts (Netrows). Counts only, until NETROWS_API_KEY is set.
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const result = await runEnrichment({ maxLookups: 10 })
    console.info('sales-enrich', JSON.stringify(result))
    return NextResponse.json(result)
  } catch (e) {
    console.error('sales-enrich failed', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
