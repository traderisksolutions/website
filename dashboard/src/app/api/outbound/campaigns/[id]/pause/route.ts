import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbHeaders, logEvent } from '@/lib/sb'

type Params = { params: Promise<{ id: string }> }

// POST /api/outbound/campaigns/[id]/pause
// Body: { action: 'pause' | 'resume', change_summary?: string }
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id }   = await params
    const { action, change_summary } = await req.json() as {
      action: 'pause' | 'resume'
      change_summary?: string
    }

    if (action !== 'pause' && action !== 'resume') {
      return NextResponse.json({ error: "action must be 'pause' or 'resume'" }, { status: 400 })
    }

    // Load campaign to verify state
    const campRes = await fetch(`${SB_URL}/rest/v1/ob_campaigns?id=eq.${id}&limit=1`, { headers: sbHeaders() })
    const [campaign] = campRes.ok ? await campRes.json() : [null]
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

    if (action === 'pause' && campaign.status !== 'active') {
      return NextResponse.json({ error: 'Campaign must be active to pause' }, { status: 409 })
    }
    if (action === 'resume' && campaign.status !== 'paused') {
      return NextResponse.json({ error: 'Campaign must be paused to resume' }, { status: 409 })
    }

    const newStatus = action === 'pause' ? 'paused' : 'active'

    // Update campaign status
    await fetch(`${SB_URL}/rest/v1/ob_campaigns?id=eq.${id}`, {
      method:  'PATCH',
      headers: sbHeaders(),
      body:    JSON.stringify({ status: newStatus }),
    })

    // On pause: create a version trail entry
    if (action === 'pause') {
      const versionsRes = await fetch(
        `${SB_URL}/rest/v1/ob_campaign_versions?campaign_id=eq.${id}&select=version_number&order=version_number.desc&limit=1`,
        { headers: sbHeaders() }
      )
      const versions = versionsRes.ok ? await versionsRes.json() : []
      const nextVersion = Array.isArray(versions) && versions[0] ? versions[0].version_number + 1 : 1

      await fetch(`${SB_URL}/rest/v1/ob_campaign_versions`, {
        method:  'POST',
        headers: sbHeaders(),
        body:    JSON.stringify({
          campaign_id:         id,
          version_number:      nextVersion,
          status:              'active',
          created_from_pause:  true,
          change_summary:      change_summary ?? 'Campaign paused',
        }),
      })
    }

    // Update sender mapping sync_status
    await fetch(
      `${SB_URL}/rest/v1/ob_sender_campaign_mappings?campaign_id=eq.${id}`,
      {
        method:  'PATCH',
        headers: sbHeaders(),
        body:    JSON.stringify({ sync_status: action === 'pause' ? 'paused' : 'active' }),
      }
    )

    await logEvent({
      event_type:  action === 'pause' ? 'campaign_paused' : 'campaign_resumed',
      entity_type: 'campaign',
      entity_id:   id,
      campaign_id: id,
      payload:     { change_summary: change_summary ?? null },
    })

    return NextResponse.json({ ok: true, status: newStatus })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
