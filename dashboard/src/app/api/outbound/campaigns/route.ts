import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbHeaders, logEvent } from '@/lib/sb'

// GET /api/outbound/campaigns — list all campaigns
export async function GET() {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/ob_campaigns?order=created_at.desc&limit=100`,
      { headers: sbHeaders() }
    )
    const data = res.ok ? await res.json() : []
    return NextResponse.json(Array.isArray(data) ? data : [])
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

const PRODUCT_CODE_MAP: Record<string, string> = {
  'Business Assets':      'assets',
  'Business Liabilities': 'liabilities',
  'Workforce':            'workforce',
  'API':                  'api',
  'General':              'general',
}

// POST /api/outbound/campaigns — create a new campaign
// Body: { name, leadIds?: string[], searchId?, newsUrl?, productType?, variant_mode? }
export async function POST(req: NextRequest) {
  try {
    const { name, leadIds, searchId, newsUrl, productType, variant_mode } = await req.json()
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Campaign name is required' }, { status: 400 })
    }

    const geminiKey = process.env.GEMINI_API_KEY_NEWS

    let newsHeadline: string | null = null
    let newsSummary:  string | null = null
    let resolvedUrl:  string | null = newsUrl ?? null

    // Fetch news hook if we have a Gemini key
    if (geminiKey && newsUrl) {
      try {
        const appOrigin = process.env.NEXT_PUBLIC_APP_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
        const newsRes = await fetch(`${appOrigin}/api/outbound/news-fetch`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ industry: name, locations: [], newsUrl }),
        })
        if (newsRes.ok) {
          const newsData = await newsRes.json()
          newsHeadline = newsData.headline ?? null
          newsSummary  = newsData.summary  ?? null
          resolvedUrl  = newsData.url ?? newsUrl
        }
      } catch { /* non-fatal */ }
    }

    const resolvedProductType = productType ?? 'General'
    const initialLeadIds: string[] = Array.isArray(leadIds) ? leadIds : []

    // Create campaign record — new campaigns require brief approval before drafting
    const campRes = await fetch(`${SB_URL}/rest/v1/ob_campaigns`, {
      method:  'POST',
      headers: sbHeaders('return=representation'),
      body:    JSON.stringify({
        name:            name.trim(),
        product_type:    resolvedProductType,
        search_id:       searchId ?? null,
        status:          'draft',
        brief_required:  true,
        variant_mode:    variant_mode === true,
        news_url:        resolvedUrl,
        news_headline:   newsHeadline,
        news_summary:    newsSummary,
        news_fetched_at: newsHeadline ? new Date().toISOString() : null,
        lead_count:      initialLeadIds.length,
      }),
    })

    if (!campRes.ok) return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 })
    const [campaign] = await campRes.json()

    // Create 3 default sequence steps (draft) — kept for backward compat
    const sequenceRows = [
      { campaign_id: campaign.id, step_number: 1, subject: '', body: '', delay_days: 0, status: 'draft' },
      { campaign_id: campaign.id, step_number: 2, subject: '', body: '', delay_days: 3, status: 'draft' },
      { campaign_id: campaign.id, step_number: 3, subject: '', body: '', delay_days: 7, status: 'draft' },
    ]

    // Seed ob_campaign_products from product_type
    const productRow = {
      campaign_id:  campaign.id,
      product_code: PRODUCT_CODE_MAP[resolvedProductType] ?? 'general',
      product_name: resolvedProductType,
      priority:     1,
    }

    await Promise.all([
      fetch(`${SB_URL}/rest/v1/ob_campaign_sequences`, {
        method: 'POST', headers: sbHeaders(),
        body:   JSON.stringify(sequenceRows),
      }),
      fetch(`${SB_URL}/rest/v1/ob_campaign_products`, {
        method: 'POST', headers: sbHeaders('return=minimal,resolution=ignore-duplicates'),
        body:   JSON.stringify(productRow),
      }),
      // If leads passed at creation time, add them to ob_campaign_leads
      initialLeadIds.length > 0
        ? fetch(`${SB_URL}/rest/v1/ob_campaign_leads`, {
            method: 'POST',
            headers: sbHeaders('return=minimal,resolution=ignore-duplicates'),
            body:    JSON.stringify(initialLeadIds.map(lead_id => ({
              campaign_id: campaign.id, lead_id, source_type: 'imported',
            }))),
          })
        : Promise.resolve(),
    ])

    await logEvent({
      event_type:  'campaign_created',
      entity_type: 'campaign',
      entity_id:   campaign.id,
      campaign_id: campaign.id,
      payload:     { name: campaign.name, product_type: resolvedProductType, initial_lead_count: initialLeadIds.length },
    })

    return NextResponse.json({ campaign })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
