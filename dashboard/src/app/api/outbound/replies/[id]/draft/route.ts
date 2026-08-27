import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbHeaders }         from '@/lib/sb'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { logAiUsage }                from '@/lib/gemini-usage'
import { logError }                  from '@/lib/error-log'

type Params = { params: Promise<{ id: string }> }

// POST /api/outbound/replies/[id]/draft
// Generates (or regenerates) an AI-drafted response to one reply — saved to
// ob_reply_events.draft_body for a human to review, edit, and send via the /send route below.
// Never sends anything itself.
export async function POST(req: NextRequest, { params }: Params) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized

  try {
    const { id } = await params

    const [eventRes, classRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/ob_reply_events?id=eq.${id}&select=id,campaign_id,lead_id,lead_email,subject,body_preview&limit=1`, { headers: sbHeaders() }),
      fetch(`${SB_URL}/rest/v1/ob_reply_classifications?reply_event_id=eq.${id}&select=ai_label,human_label,ai_reasoning&limit=1`, { headers: sbHeaders() }),
    ])
    const events = eventRes.ok ? await eventRes.json() : []
    const event  = Array.isArray(events) ? events[0] : null
    if (!event) return NextResponse.json({ error: 'Reply not found' }, { status: 404 })

    const classifications = classRes.ok ? await classRes.json() : []
    const classification  = Array.isArray(classifications) ? classifications[0] : null
    const label = classification?.human_label ?? classification?.ai_label ?? null

    const [leadRes, campaignRes] = await Promise.all([
      event.lead_id
        ? fetch(`${SB_URL}/rest/v1/outbound_leads?id=eq.${event.lead_id}&select=full_name,current_title,current_company&limit=1`, { headers: sbHeaders() })
        : Promise.resolve(null),
      event.campaign_id
        ? fetch(`${SB_URL}/rest/v1/ob_campaigns?id=eq.${event.campaign_id}&select=name&limit=1`, { headers: sbHeaders() })
        : Promise.resolve(null),
    ])
    const leadRows = leadRes && leadRes.ok ? await leadRes.json() : []
    const lead     = Array.isArray(leadRows) ? leadRows[0] : null
    const campRows = campaignRes && campaignRes.ok ? await campaignRes.json() : []
    const campaign = Array.isArray(campRows) ? campRows[0] : null

    const geminiKey = process.env.GEMINI_API_KEY_DRAFT_EMAIL
    if (!geminiKey) return NextResponse.json({ error: 'GEMINI_API_KEY_DRAFT_EMAIL not configured' }, { status: 500 })

    const leadName = lead?.full_name?.trim() || event.lead_email
    const prompt = `You are "Alex" from Trade Risk Solutions (TRS), a Singapore insurance brokerage, replying to a prospect who responded to one of our cold outreach emails.

Prospect: ${leadName}${lead?.current_title ? `, ${lead.current_title}` : ''}${lead?.current_company ? ` at ${lead.current_company}` : ''}
Campaign context: ${campaign?.name ?? 'unknown'}
Their reply was classified as: ${label ?? 'unclassified'}${classification?.ai_reasoning ? ` (${classification.ai_reasoning})` : ''}

Their reply:
"""
${(event.body_preview ?? '').slice(0, 1500)}
"""

Write a short, warm, professional reply as Alex. Rules:
- Plain text only, no markdown, no subject line — body text only.
- 3-6 sentences. No generic filler ("I hope this email finds you well").
- If they showed interest or asked for a meeting: propose a concrete next step (a short call) without being pushy.
- If they asked a question: answer it directly and briefly, then offer to discuss further.
- If they said they're the wrong contact: thank them and ask if they can point to the right person.
- Sign off as "Alex" only — no surname, no title block (a signature is appended separately).
- Never invent specific facts, pricing, or commitments you don't have — keep it general and offer a call to go deeper.`

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${geminiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 400 },
        }),
      }
    )

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      void logError({ source: 'gemini', feature: 'outbound_reply_draft', statusCode: geminiRes.status, message: errText, resourceType: 'ob_reply_event', resourceId: id })
      return NextResponse.json({ error: `AI drafting failed (${geminiRes.status}): ${errText.slice(0, 200)}` }, { status: 502 })
    }

    const geminiData = await geminiRes.json()
    const draftBody: string = (geminiData.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: string }) => p.text ?? '').join('').trim()
    if (!draftBody) return NextResponse.json({ error: 'AI returned an empty draft' }, { status: 502 })

    const usage = geminiData.usageMetadata ?? {}
    void logAiUsage({
      provider: 'gemini', model: 'gemini-3.1-flash-lite', feature: 'outbound_reply_draft',
      inputTokens: usage.promptTokenCount ?? 0, outputTokens: usage.candidatesTokenCount ?? 0,
      metadata: { reply_event_id: id },
    })

    await fetch(`${SB_URL}/rest/v1/ob_reply_events?id=eq.${id}`, {
      method:  'PATCH',
      headers: sbHeaders('return=minimal'),
      body:    JSON.stringify({ draft_body: draftBody, draft_status: 'drafted', draft_generated_at: new Date().toISOString() }),
    })

    return NextResponse.json({ draft_body: draftBody })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
