import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbHeaders } from '@/lib/sb'

type Params = { params: Promise<{ id: string }> }

// GET /api/outbound/campaigns/[id]/analytics
// Returns aggregated performance data for the campaign
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params

    const [sendsRes, replyRes, bounceRes, variantRes, leadCountRes] = await Promise.all([
      // Send statuses from campaign leads
      fetch(
        `${SB_URL}/rest/v1/ob_campaign_leads?campaign_id=eq.${id}&select=send_status,approval_status`,
        { headers: sbHeaders() }
      ),
      // Reply events for this campaign
      fetch(
        `${SB_URL}/rest/v1/ob_reply_events?campaign_id=eq.${id}&select=event_type,received_at`,
        { headers: sbHeaders() }
      ),
      // Classifications (positive outcomes)
      fetch(
        `${SB_URL}/rest/v1/ob_reply_classifications?campaign_id=eq.${id}&select=ai_label,human_label,ai_confidence`,
        { headers: sbHeaders() }
      ),
      // Variant performance
      fetch(
        `${SB_URL}/rest/v1/ob_sequence_variants?campaign_id=eq.${id}&select=id,variant_label,ab_dimension,status,is_winner,audience_split_pct`,
        { headers: sbHeaders() }
      ),
      // Total lead count breakdown by segment
      fetch(
        `${SB_URL}/rest/v1/ob_campaign_leads?campaign_id=eq.${id}&select=segment_id,approval_status,send_status,ob_campaign_segments(id,name)`,
        { headers: sbHeaders() }
      ),
    ])

    const [sends, replies, classifications, variants, leadsWithSegment] = await Promise.all([
      sendsRes.ok    ? sendsRes.json()    : [],
      replyRes.ok    ? replyRes.json()    : [],
      bounceRes.ok   ? bounceRes.json()   : [],
      variantRes.ok  ? variantRes.json()  : [],
      leadCountRes.ok ? leadCountRes.json() : [],
    ])

    // Send status breakdown
    const sendBreakdown: Record<string, number> = {}
    for (const s of (Array.isArray(sends) ? sends : [])) {
      if (s.approval_status === 'excluded') continue
      sendBreakdown[s.send_status] = (sendBreakdown[s.send_status] ?? 0) + 1
    }

    // Reply event type breakdown
    const replyBreakdown: Record<string, number> = {}
    for (const r of (Array.isArray(replies) ? replies : [])) {
      replyBreakdown[r.event_type] = (replyBreakdown[r.event_type] ?? 0) + 1
    }

    // Classification label breakdown (use human label if set, else AI label)
    const labelBreakdown: Record<string, number> = {}
    for (const c of (Array.isArray(classifications) ? classifications : [])) {
      const label = c.human_label ?? c.ai_label
      if (label) labelBreakdown[label] = (labelBreakdown[label] ?? 0) + 1
    }

    // Segment breakdown
    const segmentMap = new Map<string, { name: string; total: number; sent: number; replied: number }>()
    for (const l of (Array.isArray(leadsWithSegment) ? leadsWithSegment : [])) {
      const seg = l.ob_campaign_segments
      const key = seg?.id ?? '__unassigned__'
      const name = seg?.name ?? 'Unassigned'
      const existing = segmentMap.get(key) ?? { name, total: 0, sent: 0, replied: 0 }
      existing.total += 1
      if (l.send_status === 'sent' || l.send_status === 'replied') existing.sent += 1
      if (l.send_status === 'replied') existing.replied += 1
      segmentMap.set(key, existing)
    }

    const totalActive = (Array.isArray(sends) ? sends : []).filter(
      (s: { approval_status: string }) => s.approval_status !== 'excluded'
    ).length
    // Use ob_campaign_leads.send_status as the primary source (works for both Gmail and legacy sends)
    const totalSent    = (sendBreakdown['sent']    ?? 0) + (sendBreakdown['replied'] ?? 0)
    const totalReplied = sendBreakdown['replied']  ?? 0
    const totalBounced = sendBreakdown['bounced']  ?? 0

    const positiveLabels = ['positive', 'meeting_intent']
    const positiveReplies = positiveLabels.reduce((acc, l) => acc + (labelBreakdown[l] ?? 0), 0)

    return NextResponse.json({
      summary: {
        total_active:     totalActive,
        total_sent:       totalSent,
        total_replied:    totalReplied,
        total_bounced:    totalBounced,
        positive_replies: positiveReplies,
        reply_rate_pct:   totalSent > 0 ? Math.round((totalReplied / totalSent) * 1000) / 10 : 0,
        positive_rate_pct: totalReplied > 0 ? Math.round((positiveReplies / totalReplied) * 1000) / 10 : 0,
      },
      send_breakdown:   sendBreakdown,
      reply_breakdown:  replyBreakdown,
      label_breakdown:  labelBreakdown,
      segments:         Array.from(segmentMap.entries()).map(([id, v]) => ({ segment_id: id, ...v })),
      variants:         Array.isArray(variants) ? variants : [],
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
