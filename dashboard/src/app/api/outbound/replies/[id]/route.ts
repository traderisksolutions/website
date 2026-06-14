import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbHeaders, logEvent } from '@/lib/sb'

type Params = { params: Promise<{ id: string }> }

type ReplyLabel =
  | 'positive' | 'neutral' | 'negative' | 'unsubscribe'
  | 'out_of_office' | 'wrong_person' | 'meeting_intent' | 'question'

// PATCH /api/outbound/replies/[id]
// [id] is the reply_event_id
// Body: { human_label: ReplyLabel, human_note?: string }
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id }  = await params
    const { human_label, human_note } = await req.json() as {
      human_label: ReplyLabel
      human_note?: string
    }

    const validLabels: ReplyLabel[] = [
      'positive','neutral','negative','unsubscribe',
      'out_of_office','wrong_person','meeting_intent','question',
    ]
    if (!validLabels.includes(human_label)) {
      return NextResponse.json({ error: 'Invalid human_label' }, { status: 400 })
    }

    // Check if classification row exists
    const existingRes = await fetch(
      `${SB_URL}/rest/v1/ob_reply_classifications?reply_event_id=eq.${id}&select=id,campaign_id,lead_id&limit=1`,
      { headers: sbHeaders() }
    )
    const existing = existingRes.ok ? await existingRes.json() : []
    const classRow = Array.isArray(existing) ? (existing[0] ?? null) : null

    if (classRow) {
      // Update existing classification
      await fetch(
        `${SB_URL}/rest/v1/ob_reply_classifications?reply_event_id=eq.${id}`,
        {
          method:  'PATCH',
          headers: sbHeaders(),
          body:    JSON.stringify({
            human_label,
            human_reviewed_at: new Date().toISOString(),
          }),
        }
      )
    } else {
      // Classification doesn't exist yet — get event data to create it
      const eventRes = await fetch(
        `${SB_URL}/rest/v1/ob_reply_events?id=eq.${id}&select=campaign_id,lead_id&limit=1`,
        { headers: sbHeaders() }
      )
      const events = eventRes.ok ? await eventRes.json() : []
      const event  = Array.isArray(events) ? (events[0] ?? null) : null

      await fetch(`${SB_URL}/rest/v1/ob_reply_classifications`, {
        method:  'POST',
        headers: sbHeaders(),
        body:    JSON.stringify({
          reply_event_id:    id,
          campaign_id:       event?.campaign_id ?? null,
          lead_id:           event?.lead_id     ?? null,
          human_label,
          human_reviewed_at: new Date().toISOString(),
        }),
      })
    }

    await logEvent({
      event_type:  'human_review_completed',
      entity_type: 'reply',
      entity_id:   id,
      campaign_id: classRow?.campaign_id ?? undefined,
      lead_id:     classRow?.lead_id     ?? undefined,
      payload:     { human_label, human_note: human_note ?? null },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
