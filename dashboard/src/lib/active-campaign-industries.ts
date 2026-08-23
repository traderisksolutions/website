import { SB_URL, sbHeaders } from '@/lib/sb'

// Shared by the two Phase-2 automation crons (daily-lead-discovery, daily-signal-scan) — both
// only ever act on industries a human has already told the system to target via an active,
// approved campaign's segments. Neither cron invents a target on its own.
export async function getActiveTargetIndustries(): Promise<string[]> {
  const campRes = await fetch(`${SB_URL}/rest/v1/ob_campaigns?status=eq.active&select=id`, { headers: sbHeaders(), cache: 'no-store' })
  const activeCampaigns: { id: string }[] = campRes.ok ? await campRes.json() : []
  if (activeCampaigns.length === 0) return []

  const campaignIds = activeCampaigns.map(c => c.id)
  const segRes = await fetch(
    `${SB_URL}/rest/v1/ob_campaign_segments?campaign_id=in.(${campaignIds.join(',')})&is_active=eq.true&select=industry`,
    { headers: sbHeaders(), cache: 'no-store' }
  )
  const segments: { industry: string[] | null }[] = segRes.ok ? await segRes.json() : []
  return Array.from(new Set(segments.flatMap(s => s.industry ?? []).filter(Boolean)))
}
