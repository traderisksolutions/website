import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbHeaders, logEvent } from '@/lib/sb'

type Params = { params: Promise<{ id: string }> }

type AbDimension = 'subject_line' | 'opening_hook' | 'cta' | 'product_angle'

interface VariantStep {
  step: number
  subject: string
  body: string
  delay_days: number
}

interface GeneratedVariant {
  variant_label: string
  steps: VariantStep[]
}

// GET /api/outbound/campaigns/[id]/variants
// Returns all sequence variants with their steps
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params

    // Fetch variants first, then steps by variant IDs (PostgREST has no subquery support)
    const varRes  = await fetch(
      `${SB_URL}/rest/v1/ob_sequence_variants?campaign_id=eq.${id}&order=created_at.asc`,
      { headers: sbHeaders() }
    )
    const variants = varRes.ok ? await varRes.json() : []

    if (!Array.isArray(variants) || variants.length === 0) {
      return NextResponse.json([])
    }

    const variantIds = variants.map((v: { id: string }) => v.id).join(',')
    const stepRes = await fetch(
      `${SB_URL}/rest/v1/ob_sequence_variant_steps?variant_id=in.(${variantIds})&order=step_number.asc`,
      { headers: sbHeaders() }
    )
    const stepsRaw = stepRes.ok ? await stepRes.json() : []

    // Group steps by variant_id
    const stepsByVariant = new Map<string, unknown[]>()
    if (Array.isArray(stepsRaw)) {
      for (const s of stepsRaw) {
        const arr = stepsByVariant.get(s.variant_id) ?? []
        arr.push(s)
        stepsByVariant.set(s.variant_id, arr)
      }
    }

    const result = Array.isArray(variants)
      ? variants.map((v: Record<string, unknown>) => ({
          ...v,
          steps: stepsByVariant.get(v.id as string) ?? [],
        }))
      : []

    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

// POST /api/outbound/campaigns/[id]/variants
// Generates sequence variant(s) using Gemini and saves to ob_sequence_variants + steps
// Body: { variant_count?: 1|2, ab_dimension?: AbDimension, segment_id?: string }
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id }  = await params
    const body    = await req.json() as {
      variant_count?: number
      ab_dimension?:  AbDimension
      segment_id?:    string
    }

    const geminiKey = process.env.GEMINI_API_KEY_DRAFT_EMAIL
    if (!geminiKey) return NextResponse.json({ error: 'GEMINI_API_KEY_DRAFT_EMAIL not configured' }, { status: 500 })

    const variantCount = Math.min(body.variant_count ?? 1, 2)
    const abDimension  = body.ab_dimension ?? null

    // Load campaign + brief + products
    const [campRes, briefRes, productsRes, kbRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/ob_campaigns?id=eq.${id}&limit=1`, { headers: sbHeaders() }),
      fetch(
        `${SB_URL}/rest/v1/ob_campaign_briefs?campaign_id=eq.${id}&status=eq.approved&order=created_at.desc&limit=1`,
        { headers: sbHeaders() }
      ),
      fetch(
        `${SB_URL}/rest/v1/ob_campaign_products?campaign_id=eq.${id}&is_active=eq.true&order=priority.asc`,
        { headers: sbHeaders() }
      ),
      fetch(
        `${SB_URL}/rest/v1/ob_knowledge_base?is_active=eq.true&order=sort_order.asc&limit=8`,
        { headers: sbHeaders() }
      ),
    ])

    const [campaign] = campRes.ok ? await campRes.json() : [null]
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

    if (campaign.brief_required) {
      const briefs = briefRes.ok ? await briefRes.json() : []
      if (!Array.isArray(briefs) || briefs.length === 0) {
        return NextResponse.json(
          { error: 'Approved brief required before generating variants.', code: 'BRIEF_REQUIRED' },
          { status: 403 }
        )
      }
    }

    const briefs   = briefRes.ok   ? await briefRes.json()   : []
    const brief    = Array.isArray(briefs) ? (briefs[0] ?? null) : null
    const products = productsRes.ok ? await productsRes.json() : []
    const kbEntries: { title: string; content: string }[] = kbRes.ok ? await kbRes.json() : []

    const briefContext = brief
      ? `\n\nApproved campaign brief:\n- Messaging goals: ${JSON.stringify(brief.messaging_goals)}\n- Constraints: ${JSON.stringify(brief.constraints)}`
      : ''

    const productContext = Array.isArray(products) && products.length > 0
      ? `\nProduct focus: ${products.map((p: { product_name: string }) => p.product_name).join(', ')}`
      : `\nProduct focus: ${campaign.product_type ?? 'General insurance'}`

    const knowledgeContext = kbEntries.length > 0
      ? '\n\nProduct knowledge:\n' + kbEntries.map(e => `### ${e.title}\n${e.content}`).join('\n\n')
      : ''

    const newsContext = campaign.news_headline
      ? `\nNews hook: "${campaign.news_headline}" — ${campaign.news_summary ?? ''}`
      : ''

    const abInstruction = abDimension
      ? `\nA/B TEST: Generate exactly ${variantCount} variants. Only the "${abDimension.replace('_', ' ')}" should differ between variants — all other content must be identical. Label them A and B.`
      : variantCount > 1
      ? `\nGenerate ${variantCount} variants with different overall approaches. Label them A and B.`
      : '\nGenerate 1 variant (label it A).'

    const prompt = `You are writing outbound email sequences for Trade Risk Solutions (TRS), a B2B insurance brokerage in Singapore.

Campaign: "${campaign.name}"${productContext}${newsContext}${briefContext}${knowledgeContext}
${abInstruction}

Each variant is a 3-step email sequence. Each step:
- Step 1: 80–100 words. Lead with news hook if available. Connect to an insurance risk for their industry.
- Step 2: 60–80 words. Different angle, specific risk scenario.
- Step 3: 50–70 words. Soft close.
- All steps: professional but conversational, ONE clear CTA (15-min call or reply to express interest).
- Use {{first_name}} and {{company}} as personalisation tokens.
- delay_days: step 1 = 0, step 2 = 3, step 3 = 7.

Return ONLY valid JSON:
{
  "variants": [
    {
      "variant_label": "A",
      "steps": [
        { "step": 1, "subject": "...", "body": "...", "delay_days": 0 },
        { "step": 2, "subject": "...", "body": "...", "delay_days": 3 },
        { "step": 3, "subject": "...", "body": "...", "delay_days": 7 }
      ]
    }
  ]
}`

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 4096 },
        }),
      }
    )

    if (!geminiRes.ok) return NextResponse.json({ error: 'AI generation failed' }, { status: 502 })

    const geminiData = await geminiRes.json()
    const rawText    = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'

    let parsed: { variants: GeneratedVariant[] }
    try {
      parsed = JSON.parse(rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())
    } catch {
      return NextResponse.json({ error: 'AI returned malformed JSON' }, { status: 502 })
    }

    const savedVariants = []
    for (const v of (parsed.variants ?? [])) {
      // Create variant record
      const vRes = await fetch(`${SB_URL}/rest/v1/ob_sequence_variants`, {
        method:  'POST',
        headers: sbHeaders('return=representation'),
        body:    JSON.stringify({
          campaign_id:      id,
          segment_id:       body.segment_id    ?? null,
          brief_id:         brief?.id          ?? null,
          variant_label:    v.variant_label,
          ab_dimension:     abDimension,
          ab_group:         v.variant_label === 'A' ? 'control' : 'variant',
          audience_split_pct: variantCount > 1 ? 50 : 100,
          step_count:       3,
          status:           'draft',
          created_by_model: 'gemini-2.5-flash',
        }),
      })

      if (!vRes.ok) continue
      const [variant] = await vRes.json()

      // Create steps
      const stepRows = v.steps.map(s => ({
        variant_id:  variant.id,
        step_number: s.step,
        subject:     s.subject,
        body:        s.body,
        delay_days:  s.delay_days,
        status:      'draft',
      }))

      await fetch(`${SB_URL}/rest/v1/ob_sequence_variant_steps`, {
        method:  'POST',
        headers: sbHeaders('return=minimal,resolution=ignore-duplicates'),
        body:    JSON.stringify(stepRows),
      })

      savedVariants.push({ ...variant, steps: stepRows })
    }

    await logEvent({
      event_type:  'variant_generated',
      entity_type: 'campaign',
      entity_id:   id,
      campaign_id: id,
      payload:     { variant_count: savedVariants.length, ab_dimension: abDimension },
    })

    return NextResponse.json({ variants: savedVariants })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

// PATCH /api/outbound/campaigns/[id]/variants
// Body: { variant_id, action: 'approve'|'archive' }
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id }   = await params
    const { variant_id, action } = await req.json() as { variant_id: string; action: 'approve' | 'archive' }

    if (!variant_id || !action) return NextResponse.json({ error: 'variant_id and action required' }, { status: 400 })

    const statusMap = { approve: 'approved', archive: 'archived' } as const
    const patch: Record<string, unknown> = {
      status:     statusMap[action],
      updated_at: new Date().toISOString(),
    }
    if (action === 'approve') {
      patch.approved_at = new Date().toISOString()
    }

    const res = await fetch(
      `${SB_URL}/rest/v1/ob_sequence_variants?id=eq.${variant_id}&campaign_id=eq.${id}`,
      { method: 'PATCH', headers: sbHeaders(), body: JSON.stringify(patch) }
    )

    if (!res.ok) return NextResponse.json({ error: 'Update failed' }, { status: 502 })

    await logEvent({
      event_type:  action === 'approve' ? 'sequence_approved' : 'variant_archived',
      entity_type: 'variant',
      entity_id:   variant_id,
      campaign_id: id,
      payload:     { action },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
