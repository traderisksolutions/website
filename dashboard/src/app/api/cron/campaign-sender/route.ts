import { NextRequest, NextResponse } from 'next/server'
import { runCampaigns } from '@/lib/sales/runner'

// Campaign runner: top up auto-enrol campaigns, enrol approved drafts, record replies and
// bounces, send due emails. Called every 20 minutes in office hours (Cloud Scheduler on
// trs-ai-project; see scripts/sales-scheduler.sh). Sends nothing until
// CAMPAIGN_SENDING_ENABLED=true.
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const result = await runCampaigns()
    console.info('campaign-sender', JSON.stringify(result))
    return NextResponse.json(result)
  } catch (e) {
    console.error('campaign-sender failed', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
