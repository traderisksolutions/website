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

// POST /api/outbound/instantly — Instantly webhook receiver
// Instantly sends events: reply, bounce, unsubscribe, open, click
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Validate webhook secret if configured
    const secret = process.env.INSTANTLY_WEBHOOK_SECRET
    if (secret) {
      const sig = req.headers.get('x-instantly-signature') ?? ''
      if (sig !== secret) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    }

    const { event_type, email, campaign_id } = body

    if (!email || !campaign_id) {
      return NextResponse.json({ ok: true }) // ignore malformed events
    }

    // Find the lead by email
    const leadRes = await fetch(
      `${SB_URL}/rest/v1/outbound_leads?email=eq.${encodeURIComponent(email)}&select=id`,
      { headers: sbHeaders() }
    )
    const leads: { id: string }[] = leadRes.ok ? await leadRes.json() : []
    if (!leads.length) return NextResponse.json({ ok: true })

    const leadId = leads[0].id

    // Find campaign
    const campRes = await fetch(
      `${SB_URL}/rest/v1/ob_campaigns?instantly_campaign_id=eq.${campaign_id}&select=id`,
      { headers: sbHeaders() }
    )
    const campaigns: { id: string }[] = campRes.ok ? await campRes.json() : []
    if (!campaigns.length) return NextResponse.json({ ok: true })

    const campaignId = campaigns[0].id

    if (event_type === 'reply') {
      // Update send record
      await fetch(
        `${SB_URL}/rest/v1/ob_campaign_sends?campaign_id=eq.${campaignId}&outbound_lead_id=eq.${leadId}`,
        {
          method:  'PATCH',
          headers: sbHeaders(),
          body:    JSON.stringify({ status: 'replied', replied_at: new Date().toISOString() }),
        }
      )
      // Increment campaign reply count
      const countRes = await fetch(
        `${SB_URL}/rest/v1/ob_campaigns?id=eq.${campaignId}&select=reply_count`,
        { headers: sbHeaders() }
      )
      const [camp] = countRes.ok ? await countRes.json() : [{ reply_count: 0 }]
      await fetch(`${SB_URL}/rest/v1/ob_campaigns?id=eq.${campaignId}`, {
        method:  'PATCH',
        headers: sbHeaders(),
        body:    JSON.stringify({ reply_count: (camp.reply_count ?? 0) + 1 }),
      })
      // Promote lead status to engaged
      await fetch(`${SB_URL}/rest/v1/outbound_leads?id=eq.${leadId}`, {
        method:  'PATCH',
        headers: sbHeaders(),
        body:    JSON.stringify({ status: 'engaged' }),
      })
    }

    if (event_type === 'bounce' || event_type === 'unsubscribe') {
      const newStatus = event_type === 'unsubscribe' ? 'unsubscribed' : 'bounced'
      await fetch(
        `${SB_URL}/rest/v1/ob_campaign_sends?campaign_id=eq.${campaignId}&outbound_lead_id=eq.${leadId}`,
        {
          method:  'PATCH',
          headers: sbHeaders(),
          body:    JSON.stringify({ status: newStatus }),
        }
      )
      if (event_type === 'unsubscribe') {
        await fetch(`${SB_URL}/rest/v1/outbound_leads?id=eq.${leadId}`, {
          method:  'PATCH',
          headers: sbHeaders(),
          body:    JSON.stringify({ opt_out: true, opt_out_at: new Date().toISOString() }),
        })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('Instantly webhook error:', e)
    return NextResponse.json({ ok: true }) // always 200 to Instantly
  }
}
