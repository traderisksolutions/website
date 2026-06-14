import { NextResponse } from 'next/server'
import { SB_URL, sbHeaders } from '@/lib/sb'

// GET /api/outbound/ai-usage
// Returns AI draft usage summary from ob_outbound_events (event_type = 'ai_draft')
export async function GET() {
  const res = await fetch(
    `${SB_URL}/rest/v1/ob_outbound_events` +
    `?event_type=eq.ai_draft` +
    `&select=campaign_id,payload,created_at` +
    `&order=created_at.desc&limit=1000`,
    { headers: sbHeaders(), cache: 'no-store' }
  )
  const events: { campaign_id: string | null; payload: Record<string, unknown> | null; created_at: string }[] =
    res.ok ? await res.json() : []

  // Aggregate totals
  let totalCalls       = 0
  let totalPromptTok   = 0
  let totalOutputTok   = 0
  let totalTokens      = 0

  // Per-campaign map
  const bycamp: Record<string, { calls: number; prompt_tokens: number; output_tokens: number; total_tokens: number; last_at: string }> = {}

  for (const ev of events) {
    const p = ev.payload ?? {}
    const pt = Number(p.prompt_tokens  ?? 0)
    const ot = Number(p.output_tokens  ?? 0)
    const tt = Number(p.total_tokens   ?? 0)

    totalCalls++
    totalPromptTok += pt
    totalOutputTok += ot
    totalTokens    += tt

    const cid = ev.campaign_id ?? '__unknown__'
    if (!bycamp[cid]) bycamp[cid] = { calls: 0, prompt_tokens: 0, output_tokens: 0, total_tokens: 0, last_at: ev.created_at }
    bycamp[cid].calls         += 1
    bycamp[cid].prompt_tokens += pt
    bycamp[cid].output_tokens += ot
    bycamp[cid].total_tokens  += tt
    if (ev.created_at > bycamp[cid].last_at) bycamp[cid].last_at = ev.created_at
  }

  // Fetch campaign names for known IDs
  const knownIds = Object.keys(bycamp).filter(k => k !== '__unknown__')
  let campNames: Record<string, string> = {}
  if (knownIds.length > 0) {
    const cRes = await fetch(
      `${SB_URL}/rest/v1/ob_campaigns?id=in.(${knownIds.join(',')})&select=id,name`,
      { headers: sbHeaders() }
    )
    const cRows: { id: string; name: string }[] = cRes.ok ? await cRes.json() : []
    campNames = Object.fromEntries(cRows.map(c => [c.id, c.name]))
  }

  const perCampaign = Object.entries(bycamp).map(([cid, stats]) => ({
    campaign_id:   cid === '__unknown__' ? null : cid,
    campaign_name: cid === '__unknown__' ? 'Unknown' : (campNames[cid] ?? cid),
    ...stats,
  })).sort((a, b) => b.total_tokens - a.total_tokens)

  // Cost estimate: Gemini 2.5 Flash pricing ~$0.075 per 1M input tokens, $0.30 per 1M output tokens
  const costUsd = (totalPromptTok * 0.075 + totalOutputTok * 0.30) / 1_000_000

  return NextResponse.json({
    summary: {
      total_calls:        totalCalls,
      total_prompt_tokens: totalPromptTok,
      total_output_tokens: totalOutputTok,
      total_tokens:        totalTokens,
      estimated_cost_usd:  Math.round(costUsd * 10000) / 10000,
    },
    per_campaign: perCampaign,
  })
}
