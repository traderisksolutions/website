import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbHeaders } from '@/lib/sb'
import { getActiveTargetIndustries } from '@/lib/active-campaign-industries'

export const maxDuration = 120

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent'
const MAX_INDUSTRIES_PER_RUN = 5 // bounds run time/token spend, not a hard budget like Apollo's

interface SignalHit {
  found:        boolean
  headline?:    string
  summary?:     string
  url?:         string
  source?:      string
  signal_type?: string
  company_name?: string | null
}

const VALID_SIGNAL_TYPES = new Set([
  'incident', 'regulatory', 'market_event', 'merger_acquisition',
  'leadership_change', 'financial_event', 'sector_trend', 'competitor_news',
])

async function scanIndustry(industry: string, geminiKey: string): Promise<SignalHit | null> {
  const prompt = `Search Google News for real news published in the last 7 days about companies in the "${industry}" industry in Singapore or the broader Southeast Asia region.

Find ONE story a trade-credit and commercial insurance broker would care about — something that changes a company's risk profile or buying need. Good examples: a company facing financial distress, insolvency, or a credit downgrade; an acquisition, merger, or major expansion; a regulatory change affecting the sector; a change in senior leadership at a named company; a major operational incident (fire, cyber breach, supply chain disruption).

If you find a genuinely relevant, specific, named-company story, return:
{"found": true, "headline": "...", "summary": "2-3 sentences", "url": "...", "source": "publication name", "signal_type": "one of: incident|regulatory|market_event|merger_acquisition|leadership_change|financial_event|sector_trend|competitor_news", "company_name": "the specific company named, or null if sector-wide"}

If nothing genuinely relevant and recent exists, return {"found": false}. Do not invent or guess at a story — false negatives are fine, fabricated stories are not.`

  const res = await fetch(`${GEMINI_URL}?key=${geminiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ googleSearch: {} }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  })
  if (!res.ok) return null
  const data = await res.json()
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
  try {
    const parsed = JSON.parse(rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()) as SignalHit
    if (!parsed.found || !parsed.headline || !parsed.url || !VALID_SIGNAL_TYPES.has(parsed.signal_type ?? '')) return null
    return parsed
  } catch {
    return null
  }
}

// GET /api/cron/daily-signal-scan
// Called once daily. The automated version of the Signal Library's manual entry form — for
// each industry an active campaign targets, asks Gemini (with Google Search grounding, same
// pattern as the existing api/outbound/news-fetch) for one genuinely relevant recent story,
// then inserts it via the existing api/outbound/signals POST route (reusing its
// corroboration-count logic rather than duplicating it).
//
// New agent-sourced signals always land as `status: pending` for human review — UNLESS a
// second independent source corroborates an existing pending signal for the same industry
// within 14 days, in which case it's promoted to `active` automatically. This mirrors the
// schema's own "2+ independently-sourced signals become corroborated" design intent.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const geminiKey = process.env.GEMINI_API_KEY_NEWS
  if (!geminiKey) return NextResponse.json({ error: 'GEMINI_API_KEY_NEWS not configured' }, { status: 500 })

  const industries = (await getActiveTargetIndustries()).slice(0, MAX_INDUSTRIES_PER_RUN)
  if (industries.length === 0) {
    return NextResponse.json({ ran: false, reason: 'no_active_campaign_target' })
  }

  const cronHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRON_SECRET}` }
  const results: Record<string, unknown>[] = []

  for (const industry of industries) {
    try {
      const hit = await scanIndustry(industry, geminiKey)
      if (!hit) { results.push({ industry, found: false }); continue }

      // Skip if we've already recorded this exact story
      const dupeRes = await fetch(
        `${SB_URL}/rest/v1/ob_signal_library?source_url=eq.${encodeURIComponent(hit.url!)}&select=id&limit=1`,
        { headers: sbHeaders(), cache: 'no-store' }
      )
      const dupes: { id: string }[] = dupeRes.ok ? await dupeRes.json() : []
      if (dupes.length > 0) { results.push({ industry, found: true, skipped: 'duplicate_url' }); continue }

      // Look for an existing pending/active signal in the same sector within 14 days to
      // corroborate against, matched loosely by company name (or sector-wide if none named).
      const since = new Date(Date.now() - 14 * 86_400_000).toISOString()
      const candRes = await fetch(
        `${SB_URL}/rest/v1/ob_signal_library?sector=eq.${encodeURIComponent(industry)}` +
        `&status=in.(pending,active)&discovered_at=gte.${since}&select=id,corroboration_group_id,corroboration_count,headline&order=discovered_at.desc&limit=20`,
        { headers: sbHeaders(), cache: 'no-store' }
      )
      const candidates: { id: string; corroboration_group_id: string | null; corroboration_count: number; headline: string }[] =
        candRes.ok ? await candRes.json() : []
      const companyLower = (hit.company_name ?? '').toLowerCase()
      const match = companyLower
        ? candidates.find(c => c.headline.toLowerCase().includes(companyLower))
        : undefined

      let corroborationGroupId: string | undefined
      if (match) {
        corroborationGroupId = match.corroboration_group_id ?? match.id // use its own id as the group id if it didn't have one yet
      }

      const insertRes = await fetch(`${APP_ORIGIN}/api/outbound/signals`, {
        method: 'POST', headers: cronHeaders,
        body: JSON.stringify({
          scope:                  hit.company_name ? 'company' : 'sector',
          sector:                 industry,
          signal_type:            hit.signal_type,
          headline:               hit.headline,
          summary:                hit.summary ?? null,
          source_url:             hit.url,
          source_domain:          hit.source ?? null,
          corroboration_group_id: corroborationGroupId,
          created_by_agent:       true,
          metadata:               { company_name: hit.company_name ?? null },
        }),
      })
      if (!insertRes.ok) { results.push({ industry, found: true, insert_error: await insertRes.text() }); continue }
      const signal = await insertRes.json() as { id: string; corroboration_count: number }

      // Auto-promote once independently corroborated by 2+ sources.
      if (signal.corroboration_count >= 2) {
        await fetch(`${SB_URL}/rest/v1/ob_signal_library?corroboration_group_id=eq.${corroborationGroupId}`, {
          method: 'PATCH', headers: sbHeaders(), body: JSON.stringify({ status: 'active' }),
        })
      }

      results.push({ industry, found: true, signal_id: signal.id, corroborated: !!match, corroboration_count: signal.corroboration_count })
    } catch (e) {
      results.push({ industry, error: e instanceof Error ? e.message : 'Server error' })
    }
  }

  return NextResponse.json({ ran: true, industries_scanned: industries.length, results, at: new Date().toISOString() })
}
