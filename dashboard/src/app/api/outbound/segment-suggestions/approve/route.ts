import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbHeaders, logEvent } from '@/lib/sb'
import { requireStaffOrCron }        from '@/lib/api-auth'

/**
 * POST /api/outbound/segment-suggestions/approve
 * Body: { industry, employeeMin?, employeeMax?, locations?, suggestedTitles? }
 *
 * Turns an approved suggestion into a DRAFT campaign + its targeting segment — nothing here
 * sends a single email or bypasses the existing brief → sequence → activate review a human
 * already has to do for any campaign (see api/outbound/campaigns POST: brief_required: true).
 * Once the human finishes that review and flips the campaign to 'active', the segment created
 * here is what daily-lead-discovery / auto-enroll.ts pick up automatically — this endpoint's
 * only job is to seed that campaign with a data-backed target instead of a blank form.
 */
export async function POST(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized

  try {
    const { industry, employeeMin, employeeMax, locations, suggestedTitles } = await req.json() as {
      industry?: string; employeeMin?: number | null; employeeMax?: number | null
      locations?: string[]; suggestedTitles?: string[]
    }
    if (!industry?.trim()) return NextResponse.json({ error: 'industry required' }, { status: 400 })

    // Create the campaign shell via the existing endpoint — reuses its sequence/product seeding
    // and brief_required gate rather than duplicating that logic here.
    const campRes = await fetch(`${req.nextUrl.origin}/api/outbound/campaigns`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') ?? '', authorization: req.headers.get('authorization') ?? '' },
      body:    JSON.stringify({ name: `${industry.trim()} (AI-suggested)`, productType: 'General' }),
    })
    if (!campRes.ok) return NextResponse.json({ error: await campRes.text() }, { status: 500 })
    const { campaign } = await campRes.json()

    const segRes = await fetch(`${SB_URL}/rest/v1/ob_campaign_segments`, {
      method:  'POST',
      headers: sbHeaders('return=representation'),
      body:    JSON.stringify({
        campaign_id:  campaign.id,
        name:         `${industry.trim()} — AI-suggested target`,
        description:  'Seeded from Segment Suggestions based on your existing won customers in this industry.',
        industry:     [industry.trim()],
        employee_min: employeeMin ?? null,
        employee_max: employeeMax ?? null,
        geography:    { countries: (locations?.length ? locations : ['Singapore', 'Hong Kong']).map(l => l === 'Singapore' ? 'SG' : l === 'Hong Kong' ? 'HK' : l) },
        persona_rules: suggestedTitles?.length ? { suggested_titles: suggestedTitles } : null,
        is_active:    true,
      }),
    })
    if (!segRes.ok) return NextResponse.json({ error: await segRes.text() }, { status: 500 })
    const [segment] = await segRes.json()

    void logEvent({
      event_type:  'segment_suggestion_approved',
      entity_type: 'campaign',
      entity_id:   campaign.id,
      campaign_id: campaign.id,
      payload:     { industry, employee_min: employeeMin ?? null, employee_max: employeeMax ?? null },
    })

    return NextResponse.json({ campaign, segment })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
