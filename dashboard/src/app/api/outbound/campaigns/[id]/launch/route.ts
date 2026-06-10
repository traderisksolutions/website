import { NextRequest, NextResponse } from 'next/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const INSTANTLY_API = 'https://api.instantly.ai/api/v1'

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

function instantlyHeaders() {
  const k = process.env.INSTANTLY_API_KEY
  if (!k) throw new Error('INSTANTLY_API_KEY not configured')
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${k}` }
}

// POST /api/outbound/campaigns/[id]/launch
// Body: { leadIds: string[] }
// Pushes approved sequences + leads to Instantly, marks campaign active
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id }      = await params
    const { leadIds } = await req.json()

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: 'leadIds required' }, { status: 400 })
    }

    const instantlyKey = process.env.INSTANTLY_API_KEY
    if (!instantlyKey) {
      return NextResponse.json({
        error: 'INSTANTLY_API_KEY not configured. Add your Instantly API key to environment variables.',
        code:  'INSTANTLY_NOT_CONFIGURED',
      }, { status: 501 })
    }

    // Load campaign + approved sequences + leads
    const [campRes, seqRes, leadsRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/ob_campaigns?id=eq.${id}`, { headers: sbHeaders() }),
      fetch(`${SB_URL}/rest/v1/ob_campaign_sequences?campaign_id=eq.${id}&status=eq.approved&order=step_number.asc`, { headers: sbHeaders() }),
      fetch(`${SB_URL}/rest/v1/outbound_leads?id=in.(${leadIds.join(',')})&opt_out=eq.false&select=*`, { headers: sbHeaders() }),
    ])

    const [campaign] = campRes.ok ? await campRes.json() : [null]
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

    const sequences: { id: string; step_number: number; subject: string; body: string; delay_days: number }[]
      = seqRes.ok ? await seqRes.json() : []

    if (sequences.length === 0) {
      return NextResponse.json({ error: 'No approved sequences. Approve all steps before launching.' }, { status: 400 })
    }

    const leads: { id: string; email: string | null; full_name: string | null; first_name: string | null; current_company: string | null }[]
      = leadsRes.ok ? await leadsRes.json() : []

    const validLeads = leads.filter(l => l.email)
    if (validLeads.length === 0) {
      return NextResponse.json({ error: 'No leads with valid emails' }, { status: 400 })
    }

    // Create Instantly campaign
    const instCampRes = await fetch(`${INSTANTLY_API}/campaign/create`, {
      method:  'POST',
      headers: instantlyHeaders(),
      body:    JSON.stringify({
        name:          campaign.name,
        campaign_type: 'email',
        sequences:     sequences.map(s => ({
          steps: [{
            type:    'email',
            subject: s.subject,
            body:    s.body,
            delay:   s.delay_days * 24 * 60, // minutes
          }],
        })),
      }),
    })

    if (!instCampRes.ok) {
      const err = await instCampRes.text()
      return NextResponse.json({ error: `Instantly campaign creation failed: ${err}` }, { status: 502 })
    }

    const instCamp = await instCampRes.json()
    const instantlyCampaignId: string = instCamp.id

    // Add leads to Instantly campaign
    const contactsPayload = validLeads.map(l => ({
      email:        l.email,
      first_name:   l.first_name ?? l.full_name?.split(' ')[0] ?? '',
      company_name: l.current_company ?? '',
    }))

    await fetch(`${INSTANTLY_API}/lead/add`, {
      method:  'POST',
      headers: instantlyHeaders(),
      body:    JSON.stringify({ campaign_id: instantlyCampaignId, leads: contactsPayload }),
    })

    // Create ob_campaign_sends records for step 1
    const step1 = sequences[0]
    const sendRows = validLeads.map(l => ({
      campaign_id:      id,
      sequence_id:      step1.id,
      outbound_lead_id: l.id,
      status:           'pending',
    }))

    await fetch(`${SB_URL}/rest/v1/ob_campaign_sends`, {
      method:  'POST',
      headers: { ...sbHeaders(), Prefer: 'return=minimal,resolution=ignore-duplicates' },
      body:    JSON.stringify(sendRows),
    })

    // Update campaign status + Instantly ID
    await fetch(`${SB_URL}/rest/v1/ob_campaigns?id=eq.${id}`, {
      method:  'PATCH',
      headers: sbHeaders(),
      body:    JSON.stringify({
        status:                'active',
        instantly_campaign_id: instantlyCampaignId,
        sent_count:            validLeads.length,
      }),
    })

    return NextResponse.json({
      success:              true,
      instantlyCampaignId,
      leadsQueued:          validLeads.length,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
