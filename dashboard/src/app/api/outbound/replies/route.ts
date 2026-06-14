import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbHeaders } from '@/lib/sb'

// GET /api/outbound/replies
// Returns reply events with AI classifications, for human review queue
// Query: campaign_id?, needs_review=true, limit?
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const campaignId   = searchParams.get('campaign_id')
    const needsReview  = searchParams.get('needs_review') === 'true'
    const limit        = searchParams.get('limit') ?? '100'

    const filters: string[] = ['event_type=eq.reply']
    if (campaignId) filters.push(`campaign_id=eq.${campaignId}`)

    const qs = [...filters, `order=received_at.desc`, `limit=${limit}`].join('&')

    const [eventsRes, classRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/ob_reply_events?${qs}`, { headers: sbHeaders() }),
      // Get all classifications (we'll index client-side)
      fetch(
        `${SB_URL}/rest/v1/ob_reply_classifications` +
        (campaignId ? `?campaign_id=eq.${campaignId}&` : '?') +
        `order=ai_classified_at.desc`,
        { headers: sbHeaders() }
      ),
    ])

    const events        = eventsRes.ok ? await eventsRes.json() : []
    const classifications = classRes.ok ? await classRes.json() : []

    // Index classifications by reply_event_id
    const classMap = new Map<string, Record<string, unknown>>()
    if (Array.isArray(classifications)) {
      for (const c of classifications) {
        classMap.set(c.reply_event_id, c)
      }
    }

    // Merge
    const result = Array.isArray(events)
      ? events
          .map((e: Record<string, unknown>) => ({
            ...e,
            classification: classMap.get(e.id as string) ?? null,
          }))
          .filter(e =>
            needsReview
              ? e.classification && !(e.classification as Record<string, unknown>).human_label
              : true
          )
      : []

    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
