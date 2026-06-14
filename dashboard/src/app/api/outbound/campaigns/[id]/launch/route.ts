import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbHeaders, logEvent } from '@/lib/sb'

const DEFAULT_OPS_EMAIL = 'operations@trade-risksol.com'

async function getOpsEmail(): Promise<string> {
  try {
    const k = process.env.SUPABASE_SERVICE_KEY
    if (!k) return DEFAULT_OPS_EMAIL
    const res = await fetch(
      `${SB_URL}/rest/v1/app_settings?key=eq.reply_from_email&select=value&limit=1`,
      { headers: { apikey: k, Authorization: `Bearer ${k}` }, cache: 'no-store' }
    )
    const rows = res.ok ? await res.json() : []
    const val  = Array.isArray(rows) ? rows[0]?.value : null
    return (typeof val === 'string' && val.includes('@')) ? val : DEFAULT_OPS_EMAIL
  } catch {
    return DEFAULT_OPS_EMAIL
  }
}

// POST /api/outbound/campaigns/[id]/launch
// Body: { leadIds: string[] }
// Queues approved leads for staggered Gmail delivery via the hourly cron.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id }      = await params
    const { leadIds } = await req.json()

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: 'leadIds required' }, { status: 400 })
    }

    // Load campaign
    const campRes = await fetch(`${SB_URL}/rest/v1/ob_campaigns?id=eq.${id}`, { headers: sbHeaders() })
    const [campaign] = campRes.ok ? await campRes.json() : [null]
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

    // Load valid leads (must have email and not opted out)
    const leadsRes = await fetch(
      `${SB_URL}/rest/v1/outbound_leads?id=in.(${leadIds.join(',')})&opt_out=eq.false&select=id,email,first_name,full_name,current_company`,
      { headers: sbHeaders() }
    )
    const allLeads: { id: string; email: string | null }[] = leadsRes.ok ? await leadsRes.json() : []
    const validLeads = allLeads.filter(l => l.email)

    if (validLeads.length === 0) {
      return NextResponse.json({ error: 'No leads with valid emails. Add emails before launching.' }, { status: 400 })
    }

    // Load approved sequence steps
    let steps: { subject: string; body: string; delay_days: number }[]

    if (campaign.variant_mode) {
      const varRes = await fetch(
        `${SB_URL}/rest/v1/ob_sequence_variants?campaign_id=eq.${id}&status=eq.approved&order=created_at.asc&limit=1`,
        { headers: sbHeaders() }
      )
      const variants: { id: string }[] = varRes.ok ? await varRes.json() : []
      if (!Array.isArray(variants) || variants.length === 0) {
        return NextResponse.json({
          error: 'No approved variants. Approve at least one variant in the Variants tab before launching.',
        }, { status: 400 })
      }
      const stepsRes = await fetch(
        `${SB_URL}/rest/v1/ob_sequence_variant_steps?variant_id=eq.${variants[0].id}&order=step_number.asc`,
        { headers: sbHeaders() }
      )
      steps = stepsRes.ok ? await stepsRes.json() : []
    } else {
      const seqRes = await fetch(
        `${SB_URL}/rest/v1/ob_campaign_sequences?campaign_id=eq.${id}&status=eq.approved&order=step_number.asc`,
        { headers: sbHeaders() }
      )
      steps = seqRes.ok ? await seqRes.json() : []
    }

    if (!Array.isArray(steps) || steps.length === 0) {
      return NextResponse.json({ error: 'No approved sequence steps. Approve all steps before launching.' }, { status: 400 })
    }

    const fromEmail  = await getOpsEmail()
    const now        = new Date().toISOString()
    const validIds   = validLeads.map(l => l.id)

    // Queue all leads: cron picks up 30/hour, providing natural stagger
    await fetch(
      `${SB_URL}/rest/v1/ob_campaign_leads?campaign_id=eq.${id}&lead_id=in.(${validIds.join(',')})&approval_status=eq.included`,
      {
        method:  'PATCH',
        headers: sbHeaders(),
        body:    JSON.stringify({
          send_status:       'queued',
          current_step:      0,
          send_scheduled_at: now,
          from_email:        fromEmail,
          metadata:          { steps },
          last_synced_at:    now,
        }),
      }
    )

    await fetch(`${SB_URL}/rest/v1/ob_campaigns?id=eq.${id}`, {
      method:  'PATCH',
      headers: sbHeaders(),
      body:    JSON.stringify({ status: 'active', sent_count: validLeads.length }),
    })

    await logEvent({
      event_type:  'launch_started',
      entity_type: 'campaign',
      entity_id:   id,
      campaign_id: id,
      payload: {
        leads_queued: validLeads.length,
        variant_mode: campaign.variant_mode ?? false,
        sender:       'gmail',
        from_email:   fromEmail,
      },
    })

    return NextResponse.json({ success: true, leadsQueued: validLeads.length })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
