import { NextResponse } from 'next/server'
import { SB_URL, sbHeaders } from '@/lib/sb'

// GET /api/home/counts
// Returns 4 KPI counts for the homepage in a single server roundtrip.
// Uses PostgREST HEAD + Prefer: count=exact so no row data is transferred.
export async function GET() {
  async function headCount(path: string): Promise<number> {
    try {
      const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
        method:  'HEAD',
        headers: { ...sbHeaders(), Prefer: 'count=exact' },
        cache:   'no-store',
      })
      const range = res.headers.get('content-range') ?? ''
      const total = parseInt(range.split('/')[1] ?? '0', 10)
      return isNaN(total) ? 0 : total
    } catch { return 0 }
  }

  const [newLeads, activeThreads, pendingDrafts, activeCampaigns] = await Promise.all([
    // Inbound leads with status = 'new' (awaiting first reply)
    headCount('inbound_leads?status=eq.new'),
    // Non-deleted email threads (active conversations)
    headCount('email_threads?deleted_at=is.null'),
    // AI drafts waiting for human review
    // TODO: narrow to most-recent-per-thread if count feels inflated
    headCount('ai_drafts?status=eq.pending'),
    // Campaigns that are live or pending sequence review
    headCount('ob_campaigns?status=in.(active,review)'),
  ])

  return NextResponse.json({ newLeads, activeThreads, pendingDrafts, activeCampaigns })
}
