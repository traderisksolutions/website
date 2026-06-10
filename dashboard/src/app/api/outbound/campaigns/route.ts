import { NextRequest, NextResponse } from 'next/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbHeaders(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return {
    apikey:        k,
    Authorization: `Bearer ${k}`,
    'Content-Type': 'application/json',
    Prefer:        prefer,
  }
}

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

// POST /api/outbound/campaigns — create a new campaign
// Body: { name, leadIds: string[], searchId?, newsUrl? }
export async function POST(req: NextRequest) {
  try {
    const { name, leadIds, searchId, newsUrl, productType } = await req.json()
    if (!name || !Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: 'name and leadIds are required' }, { status: 400 })
    }

    const geminiKey = process.env.GEMINI_API_KEY_NEWS

    let newsHeadline: string | null = null
    let newsSummary:  string | null = null
    let resolvedUrl:  string | null = newsUrl ?? null

    // Fetch news hook if we have a Gemini key
    if (geminiKey && newsUrl) {
      try {
        const newsRes = await fetch(`${SB_URL.replace('ctjapwjpwkvxubdmzbqg.supabase.co', '')}/api/outbound/news-fetch`, {
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

    // Create campaign record
    const campRes = await fetch(`${SB_URL}/rest/v1/ob_campaigns`, {
      method:  'POST',
      headers: sbHeaders('return=representation'),
      body:    JSON.stringify({
        name,
        product_type:   productType ?? 'General',
        search_id:      searchId ?? null,
        status:         'draft',
        news_url:       resolvedUrl,
        news_headline:  newsHeadline,
        news_summary:   newsSummary,
        news_fetched_at: newsHeadline ? new Date().toISOString() : null,
        lead_count:     leadIds.length,
      }),
    })

    if (!campRes.ok) return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 })
    const [campaign] = await campRes.json()

    // Create 3 default sequence steps (draft)
    const sequenceRows = [
      { campaign_id: campaign.id, step_number: 1, subject: '', body: '', delay_days: 0,  status: 'draft' },
      { campaign_id: campaign.id, step_number: 2, subject: '', body: '', delay_days: 3,  status: 'draft' },
      { campaign_id: campaign.id, step_number: 3, subject: '', body: '', delay_days: 7,  status: 'draft' },
    ]
    await fetch(`${SB_URL}/rest/v1/ob_campaign_sequences`, {
      method:  'POST',
      headers: sbHeaders(),
      body:    JSON.stringify(sequenceRows),
    })

    return NextResponse.json({ campaign })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
