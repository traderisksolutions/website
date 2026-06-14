import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbHeaders, logEvent } from '@/lib/sb'

interface Lead {
  full_name: string | null
  current_title: string | null
  current_company: string | null
  first_name: string | null
}

// POST /api/outbound/campaigns/[id]/draft
// Drafts 3-step email sequences using Gemini, saves to ob_campaign_sequences
// Body: { leadIds: string[] } — sample leads used for personalisation context
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id }      = await params
    const { leadIds } = await req.json()

    const geminiKey = process.env.GEMINI_API_KEY_DRAFT_EMAIL
    if (!geminiKey) return NextResponse.json({ error: 'GEMINI_API_KEY_DRAFT_EMAIL not configured' }, { status: 500 })

    // Load campaign + sequences
    const [campRes, seqRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/ob_campaigns?id=eq.${id}`, { headers: sbHeaders() }),
      fetch(`${SB_URL}/rest/v1/ob_campaign_sequences?campaign_id=eq.${id}&order=step_number.asc`, { headers: sbHeaders() }),
    ])
    const [campaign] = campRes.ok ? await campRes.json() : [null]
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

    // Brief gate: new campaigns require an approved brief before drafting
    if (campaign.brief_required) {
      const briefRes = await fetch(
        `${SB_URL}/rest/v1/ob_campaign_briefs?campaign_id=eq.${id}&status=eq.approved&select=id&limit=1`,
        { headers: sbHeaders() }
      )
      const briefs = briefRes.ok ? await briefRes.json() : []
      if (!Array.isArray(briefs) || briefs.length === 0) {
        return NextResponse.json(
          { error: 'Brief approval required. Create and approve a campaign brief before generating drafts.', code: 'BRIEF_REQUIRED' },
          { status: 403 }
        )
      }
    }

    const sequences: { id: string; step_number: number }[] = seqRes.ok ? await seqRes.json() : []

    // Load sample leads for context (up to 3)
    let sampleLeads: Lead[] = []
    if (Array.isArray(leadIds) && leadIds.length > 0) {
      const leadsRes = await fetch(
        `${SB_URL}/rest/v1/outbound_leads?id=in.(${leadIds.slice(0, 3).join(',')})&select=full_name,current_title,current_company,first_name`,
        { headers: sbHeaders() }
      )
      sampleLeads = leadsRes.ok ? await leadsRes.json() : []
    }

    // Fetch product knowledge for this campaign's product type + General entries
    let knowledgeContext = ''
    try {
      const productType = campaign.product_type ?? 'General'
      const ptFilter    = productType === 'General'
        ? `product_type=eq.General`
        : `product_type=in.(${encodeURIComponent(productType)},General)`
      const kbRes = await fetch(
        `${SB_URL}/rest/v1/ob_knowledge_base?${ptFilter}&is_active=eq.true&order=sort_order.asc&limit=10`,
        { headers: sbHeaders() }
      )
      const kbEntries: { title: string; content: string }[] = kbRes.ok ? await kbRes.json() : []
      if (kbEntries.length > 0) {
        knowledgeContext = '\n\nProduct knowledge to draw from:\n' +
          kbEntries.map(e => `### ${e.title}\n${e.content}`).join('\n\n')
      }
    } catch { /* non-fatal — proceed without knowledge */ }

    const newsContext = campaign.news_headline
      ? `\nNews hook to weave in naturally: "${campaign.news_headline}"\nNews context: ${campaign.news_summary ?? ''}`
      : ''

    const sampleContext = sampleLeads.length > 0
      ? `\nSample recipients: ${sampleLeads.map(l => `${l.full_name ?? 'Name'} (${l.current_title ?? 'Title'} at ${l.current_company ?? 'Company'})`).join('; ')}`
      : ''

    const prompt = `You are writing a 3-step cold email outbound sequence for Trade Risk Solutions (TRS), a B2B insurance brokerage in Singapore.

TRS sells: business property insurance, liability, cyber, workmen compensation, trade credit, and marine cargo insurance.
Campaign name / target audience: "${campaign.name}"
Product focus: ${campaign.product_type ?? 'General'}${newsContext}${sampleContext}${knowledgeContext}

Write a 3-email sequence. Each email must:
- Be professional but conversational, not salesy
- Reference the recipient's role and industry naturally
- Be concise (email 1: 80–100 words, email 2: 60–80 words, email 3: 50–70 words)
- Include ONE clear call to action (a 15-min call or reply to express interest)
- Email 1: Lead with the news hook if available, connect it to an insurance risk relevant to their business
- Email 2: Follow-up, add a different angle or specific risk scenario for their industry
- Email 3: Final soft close — acknowledge they're busy, keep door open

Use {{first_name}} and {{company}} as personalisation tokens.

Return ONLY valid JSON — no markdown, no extra text:
{
  "sequences": [
    { "step": 1, "subject": "...", "body": "..." },
    { "step": 2, "subject": "...", "body": "..." },
    { "step": 3, "subject": "...", "body": "..." }
  ]
}`

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            maxOutputTokens:  2048,
            thinkingConfig:   { thinkingBudget: 0 },
          },
        }),
      }
    )

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      return NextResponse.json({ error: `AI drafting failed (${geminiRes.status}): ${errText.slice(0, 200)}` }, { status: 502 })
    }

    const geminiData = await geminiRes.json()

    // Gemini 2.5 Flash may return thinking in parts[0] and JSON in a later part.
    // Find the first part whose text looks like JSON.
    const parts: Array<{ text?: string }> = geminiData.candidates?.[0]?.content?.parts ?? []
    let rawText = ''
    for (const part of parts) {
      const candidate = (part?.text ?? '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      if (candidate.startsWith('{')) { rawText = candidate; break }
    }
    if (!rawText) {
      rawText = (parts[parts.length - 1]?.text ?? '{}')
        .replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    }
    // Extract the outermost JSON object in case there is surrounding text
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (jsonMatch) rawText = jsonMatch[0]

    let drafted: { sequences: { step: number; subject: string; body: string }[] }
    try {
      drafted = JSON.parse(rawText)
    } catch {
      return NextResponse.json(
        { error: 'AI returned malformed JSON', raw: rawText.slice(0, 300) },
        { status: 502 }
      )
    }

    // Save drafted content to sequences
    const updates = await Promise.all(
      drafted.sequences.map(d => {
        const seq = sequences.find(s => s.step_number === d.step)
        if (!seq) return null
        return fetch(`${SB_URL}/rest/v1/ob_campaign_sequences?id=eq.${seq.id}`, {
          method:  'PATCH',
          headers: sbHeaders('return=representation'),
          body:    JSON.stringify({ subject: d.subject, body: d.body, status: 'draft' }),
        }).then(r => r.json())
      })
    )

    const updatedSequences = updates.filter(Boolean).flat()

    await logEvent({
      event_type:  'draft_generated',
      entity_type: 'campaign',
      entity_id:   id,
      campaign_id: id,
      payload:     { step_count: updatedSequences.length },
    })

    return NextResponse.json({ sequences: updatedSequences })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
