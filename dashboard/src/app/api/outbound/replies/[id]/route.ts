import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbHeaders, logEvent } from '@/lib/sb'

const PIPELINE_LABELS = new Set(['positive', 'meeting_intent'])

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

    // Promote to Active Contacts when human marks as positive or meeting_intent
    if (PIPELINE_LABELS.has(human_label)) {
      try {
        const resolvedLeadId    = classRow?.lead_id     ?? null
        const resolvedCampaignId = classRow?.campaign_id ?? null

        // Get event to find lead_email
        const evRes = await fetch(
          `${SB_URL}/rest/v1/ob_reply_events?id=eq.${id}&select=lead_email&limit=1`,
          { headers: sbHeaders() }
        )
        const evRows   = evRes.ok ? await evRes.json() : []
        const leadEmail = Array.isArray(evRows) ? evRows[0]?.lead_email : null
        if (!leadEmail) throw new Error('no lead_email')

        // Load lead name/company
        let leadName = null, leadCompany = null
        if (resolvedLeadId) {
          const lRes = await fetch(
            `${SB_URL}/rest/v1/outbound_leads?id=eq.${resolvedLeadId}&select=full_name,current_company&limit=1`,
            { headers: sbHeaders() }
          )
          const lRows  = lRes.ok ? await lRes.json() : []
          const lRow   = Array.isArray(lRows) ? lRows[0] : null
          leadName     = lRow?.full_name       ?? null
          leadCompany  = lRow?.current_company ?? null
        }

        // Find-or-create contact
        const encoded  = encodeURIComponent(leadEmail)
        const exRes    = await fetch(`${SB_URL}/rest/v1/contacts?email=eq.${encoded}&select=id,engagement_stage&limit=1`, { headers: sbHeaders() })
        const exRows   = exRes.ok ? await exRes.json() : []
        const existing = Array.isArray(exRows) ? exRows[0] : null

        if (existing) {
          const patch: Record<string, unknown> = {}
          if (resolvedLeadId)    patch.outbound_lead_id = resolvedLeadId
          if (resolvedCampaignId) patch.campaign_id     = resolvedCampaignId
          if (!existing.engagement_stage) patch.engagement_stage = 'engaged'
          if (Object.keys(patch).length > 0) {
            await fetch(`${SB_URL}/rest/v1/contacts?id=eq.${existing.id}`, { method: 'PATCH', headers: sbHeaders(), body: JSON.stringify(patch) })
          }
        } else {
          const nameParts   = (leadName ?? '').trim().split(/\s+/)
          const firstName   = nameParts[0] || null
          const lastName    = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null
          await fetch(`${SB_URL}/rest/v1/contacts`, {
            method: 'POST', headers: sbHeaders('return=minimal'),
            body: JSON.stringify({
              first_name: firstName, last_name: lastName,
              email: leadEmail, company: leadCompany,
              source: 'outbound_campaign', engagement_stage: 'engaged',
              outbound_lead_id: resolvedLeadId, campaign_id: resolvedCampaignId,
            }),
          })
        }
      } catch { /* non-fatal */ }
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
