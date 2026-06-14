import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbHeaders, logEvent } from '@/lib/sb'

// POST /api/outbound/webhooks/instantly
// Receives Instantly.ai webhook events, saves to ob_reply_events, classifies replies with Gemini
export async function POST(req: NextRequest) {
  // Verify shared secret if configured (prevents spoofed webhooks)
  const webhookSecret = process.env.INSTANTLY_WEBHOOK_SECRET
  if (webhookSecret) {
    const incoming = req.headers.get('x-webhook-secret') ?? req.headers.get('x-instantly-secret') ?? ''
    if (incoming !== webhookSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const payload = await req.json() as Record<string, unknown>

    const eventType      = (payload.event_type ?? payload.type ?? 'reply') as string
    const providerEventId = (payload.id ?? payload.event_id ?? null) as string | null
    const instCampaignId = (payload.campaign_id ?? null) as string | null
    const leadEmail      = (payload.lead_email ?? payload.email ?? null) as string | null
    const subject        = (payload.subject ?? null) as string | null
    const bodyText       = (payload.reply_text ?? payload.body ?? payload.text ?? null) as string | null

    // Map Instantly event_type to our schema's CHECK constraint values
    const typeMap: Record<string, string> = {
      reply_received:   'reply',
      email_bounced:    'bounce',
      unsubscribed:     'unsubscribe',
      email_opened:     'open',
      link_clicked:     'click',
      sending_limit:    'sending_limit',
      // direct names
      reply:       'reply',
      bounce:      'bounce',
      unsubscribe: 'unsubscribe',
      open:        'open',
      click:       'click',
    }
    const mappedType = typeMap[eventType] ?? 'reply'

    // Resolve campaign_id from instantly_campaign_id
    let campaignId: string | null = null
    let leadId:     string | null = null

    if (instCampaignId) {
      // Try ob_sender_campaign_mappings first (Phase 9 forward)
      const mappingRes = await fetch(
        `${SB_URL}/rest/v1/ob_sender_campaign_mappings?provider_campaign_id=eq.${instCampaignId}&select=campaign_id&limit=1`,
        { headers: sbHeaders() }
      )
      const mappings = mappingRes.ok ? await mappingRes.json() : []
      if (Array.isArray(mappings) && mappings[0]) {
        campaignId = mappings[0].campaign_id
      } else {
        // Fallback to ob_campaigns.instantly_campaign_id (backward compat)
        const campRes = await fetch(
          `${SB_URL}/rest/v1/ob_campaigns?instantly_campaign_id=eq.${instCampaignId}&select=id&limit=1`,
          { headers: sbHeaders() }
        )
        const camps = campRes.ok ? await campRes.json() : []
        if (Array.isArray(camps) && camps[0]) campaignId = camps[0].id
      }
    }

    // Resolve lead by email
    if (leadEmail) {
      const leadRes = await fetch(
        `${SB_URL}/rest/v1/outbound_leads?email=eq.${encodeURIComponent(leadEmail)}&select=id&limit=1`,
        { headers: sbHeaders() }
      )
      const leads = leadRes.ok ? await leadRes.json() : []
      if (Array.isArray(leads) && leads[0]) leadId = leads[0].id
    }

    // Save raw event to ob_reply_events
    const eventRes = await fetch(`${SB_URL}/rest/v1/ob_reply_events`, {
      method:  'POST',
      headers: sbHeaders('return=representation,resolution=ignore-duplicates'),
      body:    JSON.stringify({
        provider_code:     'instantly',
        provider_event_id: providerEventId,
        campaign_id:       campaignId,
        lead_id:           leadId,
        event_type:        mappedType,
        lead_email:        leadEmail,
        subject:           subject,
        body_preview:      bodyText ? bodyText.slice(0, 500) : null,
        raw_payload:       payload,
      }),
    })

    const savedEvents = eventRes.ok ? await eventRes.json() : []
    const replyEvent  = Array.isArray(savedEvents) ? (savedEvents[0] ?? null) : null

    // Only classify actual replies
    if (mappedType === 'reply' && replyEvent && bodyText) {
      await classifyReply({ replyEvent, bodyText, campaignId, leadId })
    }

    // Update lead send_status if resolved
    if (leadId && campaignId) {
      const statusMap: Record<string, string> = {
        reply:       'replied',
        bounce:      'bounced',
        unsubscribe: 'unsubscribed',
      }
      const newSendStatus = statusMap[mappedType]
      if (newSendStatus) {
        await fetch(
          `${SB_URL}/rest/v1/ob_campaign_leads?campaign_id=eq.${campaignId}&lead_id=eq.${leadId}`,
          {
            method:  'PATCH',
            headers: sbHeaders(),
            body:    JSON.stringify({ send_status: newSendStatus, last_synced_at: new Date().toISOString() }),
          }
        )
      }
    }

    // Promote outbound lead to Active Contacts when they reply
    if (mappedType === 'reply' && leadEmail) {
      try {
        await promoteOutboundToContact({ leadId, leadEmail, campaignId })
      } catch { /* non-fatal — contact promotion must never break webhook ACK */ }
    }

    await logEvent({
      event_type:  'reply_synced',
      entity_type: 'lead',
      entity_id:   leadId ?? undefined,
      campaign_id: campaignId ?? undefined,
      lead_id:     leadId ?? undefined,
      payload:     { event_type: mappedType, lead_email: leadEmail },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    // Always 200 to Instantly — never let webhook processing cause retries
    console.error('[instantly-webhook]', e)
    return NextResponse.json({ ok: true })
  }
}

async function classifyReply({
  replyEvent,
  bodyText,
  campaignId,
  leadId,
}: {
  replyEvent: { id: string }
  bodyText:   string
  campaignId: string | null
  leadId:     string | null
}) {
  const geminiKey = process.env.GEMINI_API_KEY_DRAFT_EMAIL
  if (!geminiKey) return

  try {
    const prompt = `Classify this cold email reply. Reply only with valid JSON.

Reply text:
"""
${bodyText.slice(0, 800)}
"""

Classify as one of:
- positive: genuinely interested, wants to learn more
- meeting_intent: explicitly asks for a meeting or call
- question: asks a question about the product/offer
- neutral: non-committal, vague, or just acknowledging
- negative: not interested, decline
- unsubscribe: wants to be removed from list
- out_of_office: automated out-of-office reply
- wrong_person: not the right contact / wrong company

Return: { "label": "<one of the above>", "confidence": <0.0–1.0>, "reasoning": "<1 sentence>" }`

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 256 },
        }),
      }
    )

    if (!res.ok) return

    const data    = await res.json()
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
    const parsed  = JSON.parse(rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())

    await fetch(`${SB_URL}/rest/v1/ob_reply_classifications`, {
      method:  'POST',
      headers: sbHeaders('return=minimal,resolution=ignore-duplicates'),
      body:    JSON.stringify({
        reply_event_id:   replyEvent.id,
        campaign_id:      campaignId,
        lead_id:          leadId,
        ai_label:         parsed.label      ?? null,
        ai_confidence:    parsed.confidence ?? null,
        ai_reasoning:     parsed.reasoning  ?? null,
        ai_classified_at: new Date().toISOString(),
        ai_model_used:    'gemini-2.5-flash',
      }),
    })

    await logEvent({
      event_type:  'ai_reply_classified',
      entity_type: 'lead',
      entity_id:   leadId ?? undefined,
      campaign_id: campaignId ?? undefined,
      lead_id:     leadId ?? undefined,
      payload:     { label: parsed.label, confidence: parsed.confidence },
    })
  } catch { /* non-fatal — classification failure must not break webhook ACK */ }
}

// Promotes an outbound lead to the contacts pipeline when they reply.
// Uses find-then-act to avoid downgrading an existing pipeline stage.
async function promoteOutboundToContact({
  leadId, leadEmail, campaignId,
}: {
  leadId:     string | null
  leadEmail:  string
  campaignId: string | null
}) {
  // Load lead details if we have an ID
  let leadName:    string | null = null
  let leadCompany: string | null = null
  if (leadId) {
    const res = await fetch(
      `${SB_URL}/rest/v1/outbound_leads?id=eq.${leadId}&select=full_name,current_company&limit=1`,
      { headers: sbHeaders() }
    )
    const rows = res.ok ? await res.json() : []
    const row  = Array.isArray(rows) ? rows[0] : null
    leadName    = row?.full_name      ?? null
    leadCompany = row?.current_company ?? null

    // Mark outbound_leads.status = 'replied'
    await fetch(`${SB_URL}/rest/v1/outbound_leads?id=eq.${leadId}`, {
      method:  'PATCH',
      headers: sbHeaders(),
      body:    JSON.stringify({ status: 'replied' }),
    })
  }

  // Check if contact already exists by email
  const encoded    = encodeURIComponent(leadEmail)
  const existRes   = await fetch(
    `${SB_URL}/rest/v1/contacts?email=eq.${encoded}&select=id,engagement_stage&limit=1`,
    { headers: sbHeaders() }
  )
  const existRows  = existRes.ok ? await existRes.json() : []
  const existing   = Array.isArray(existRows) ? existRows[0] : null

  if (existing) {
    // Only add FK linkage — never downgrade an existing pipeline stage
    const patch: Record<string, unknown> = {}
    if (leadId && !existing.outbound_lead_id) patch.outbound_lead_id = leadId
    if (campaignId)                           patch.campaign_id      = campaignId
    if (!existing.engagement_stage)           patch.engagement_stage = 'engaged'
    if (Object.keys(patch).length > 0) {
      await fetch(`${SB_URL}/rest/v1/contacts?id=eq.${existing.id}`, {
        method:  'PATCH',
        headers: sbHeaders(),
        body:    JSON.stringify(patch),
      })
    }
  } else {
    // New contact — create with engaged stage
    await fetch(`${SB_URL}/rest/v1/contacts`, {
      method:  'POST',
      headers: sbHeaders('return=minimal'),
      body:    JSON.stringify({
        email:            leadEmail,
        full_name:        leadName,
        company:          leadCompany,
        source:           'outbound_campaign',
        engagement_stage: 'engaged',
        outbound_lead_id: leadId,
        campaign_id:      campaignId,
      }),
    })
  }
}
