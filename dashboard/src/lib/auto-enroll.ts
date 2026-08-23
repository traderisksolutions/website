// Auto-enrollment: when a lead is promoted into outbound_leads (Apollo reveal, Netrows
// fallback, or a future automated discovery source), automatically slot it into an
// already-active, already-approved campaign whose segment criteria it matches — instead of
// requiring a human to build/approve/launch a campaign per batch.
//
// Deliberately conservative: this NEVER creates a new campaign. A lead with no matching
// active campaign is simply left unassigned in outbound_leads (visible on the unified
// Pipeline view) for a human to route manually or approve a new campaign for. The existing
// human-approval gate on net-new campaign creation is untouched.
import { SB_URL, sbHeaders, logEvent } from '@/lib/sb'
import { getAppSetting } from '@/lib/app-settings'

interface SequenceStep { subject: string; body: string; delay_days: number }

interface Segment {
  id: string
  campaign_id: string
  industry: string[] | null
  employee_min: number | null
  employee_max: number | null
  is_active: boolean
}

interface Campaign {
  id: string
  status: string
  variant_mode: boolean
  created_at: string
}

interface OutboundLead {
  id: string
  current_industry: string | null
  employee_count: number | null
  opt_out: boolean | null
}

export type AutoEnrollResult =
  | { enrolled: true; campaignId: string; segmentId: string | null }
  | { enrolled: false; reason: 'opted_out' | 'already_enrolled' | 'no_matching_campaign' | 'no_approved_sequence' | 'lead_not_found' }

export async function autoEnrollLead(leadId: string): Promise<AutoEnrollResult> {
  const leadRes = await fetch(
    `${SB_URL}/rest/v1/outbound_leads?id=eq.${leadId}&select=id,current_industry,employee_count,opt_out&limit=1`,
    { headers: sbHeaders() }
  )
  const leads: OutboundLead[] = leadRes.ok ? await leadRes.json() : []
  const lead = leads[0]
  if (!lead) return { enrolled: false, reason: 'lead_not_found' }
  if (lead.opt_out) return { enrolled: false, reason: 'opted_out' }

  // Already enrolled anywhere (any campaign, any status)? ob_campaign_leads has a
  // UNIQUE(campaign_id, lead_id) constraint that guards per-campaign duplicates at the DB
  // level, but says nothing about a lead already running in a *different* campaign — check
  // that ourselves so we never double up on outreach to the same person.
  const existingRes = await fetch(
    `${SB_URL}/rest/v1/ob_campaign_leads?lead_id=eq.${leadId}&select=id&limit=1`,
    { headers: sbHeaders() }
  )
  const existing: { id: string }[] = existingRes.ok ? await existingRes.json() : []
  if (existing.length > 0) return { enrolled: false, reason: 'already_enrolled' }

  // Active campaigns + their active segments
  const campRes = await fetch(
    `${SB_URL}/rest/v1/ob_campaigns?status=eq.active&select=id,status,variant_mode,created_at&order=created_at.desc`,
    { headers: sbHeaders() }
  )
  const campaigns: Campaign[] = campRes.ok ? await campRes.json() : []
  if (campaigns.length === 0) return { enrolled: false, reason: 'no_matching_campaign' }

  const campaignIds = campaigns.map(c => c.id)
  const segRes = await fetch(
    `${SB_URL}/rest/v1/ob_campaign_segments?campaign_id=in.(${campaignIds.join(',')})&is_active=eq.true` +
    `&select=id,campaign_id,industry,employee_min,employee_max,is_active`,
    { headers: sbHeaders() }
  )
  const segments: Segment[] = segRes.ok ? await segRes.json() : []

  const matches = (seg: Segment): boolean => {
    if (Array.isArray(seg.industry) && seg.industry.length > 0) {
      if (!lead.current_industry) return false
      const industryLower = lead.current_industry.toLowerCase()
      if (!seg.industry.some(i => i.toLowerCase() === industryLower)) return false
    }
    if (seg.employee_min != null || seg.employee_max != null) {
      if (lead.employee_count == null) return false // range constrained but lead has no data — don't guess
      if (seg.employee_min != null && lead.employee_count < seg.employee_min) return false
      if (seg.employee_max != null && lead.employee_count > seg.employee_max) return false
    }
    return true
  }

  // First match wins, campaigns already ordered most-recently-created first.
  let matchedCampaign: Campaign | null = null
  let matchedSegment: Segment | null = null
  for (const camp of campaigns) {
    const campSegments = segments.filter(s => s.campaign_id === camp.id)
    // A campaign with no segments defined at all has no targeting criteria to check against —
    // treat as unconstrained (matches everyone) rather than un-matchable.
    if (campSegments.length === 0) { matchedCampaign = camp; matchedSegment = null; break }
    const hit = campSegments.find(matches)
    if (hit) { matchedCampaign = camp; matchedSegment = hit; break }
  }
  if (!matchedCampaign) return { enrolled: false, reason: 'no_matching_campaign' }

  // Resolve approved sequence steps — identical resolution order to campaigns/[id]/launch.
  let steps: SequenceStep[] = []
  if (matchedCampaign.variant_mode) {
    const varRes = await fetch(
      `${SB_URL}/rest/v1/ob_sequence_variants?campaign_id=eq.${matchedCampaign.id}&status=eq.approved&order=created_at.asc&limit=1`,
      { headers: sbHeaders() }
    )
    const variants: { id: string }[] = varRes.ok ? await varRes.json() : []
    if (variants.length > 0) {
      const stepsRes = await fetch(
        `${SB_URL}/rest/v1/ob_sequence_variant_steps?variant_id=eq.${variants[0].id}&order=step_number.asc`,
        { headers: sbHeaders() }
      )
      steps = stepsRes.ok ? await stepsRes.json() : []
    }
  } else {
    const seqRes = await fetch(
      `${SB_URL}/rest/v1/ob_campaign_sequences?campaign_id=eq.${matchedCampaign.id}&status=eq.approved&order=step_number.asc`,
      { headers: sbHeaders() }
    )
    steps = seqRes.ok ? await seqRes.json() : []
  }
  if (steps.length === 0) return { enrolled: false, reason: 'no_approved_sequence' }

  const fromEmail = await getAppSetting('reply_from_email', 'operations@trade-risksol.com')
  const now = new Date().toISOString()

  await fetch(`${SB_URL}/rest/v1/ob_campaign_leads`, {
    method:  'POST',
    // Falls back to a no-op instead of erroring if a race already inserted this
    // (campaign_id, lead_id) pair between our check above and this insert.
    headers: sbHeaders('return=minimal,resolution=ignore-duplicates'),
    body: JSON.stringify({
      campaign_id:        matchedCampaign.id,
      lead_id:             leadId,
      segment_id:          matchedSegment?.id ?? null,
      source_type:         'agent_discovery',
      approval_status:     'included',
      send_status:         'queued',
      current_step:        0,
      send_scheduled_at:   now,
      from_email:          fromEmail,
      metadata:            { steps },
      last_synced_at:      now,
    }),
  })

  await logEvent({
    event_type:  'auto_enrolled',
    entity_type: 'lead',
    entity_id:   leadId,
    campaign_id: matchedCampaign.id,
    lead_id:     leadId,
    payload:     { segment_id: matchedSegment?.id ?? null, matched_by: matchedSegment ? 'segment' : 'unconstrained_campaign' },
  })

  return { enrolled: true, campaignId: matchedCampaign.id, segmentId: matchedSegment?.id ?? null }
}
