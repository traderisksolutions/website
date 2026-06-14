import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbHeaders } from '@/lib/sb'

const APOLLO = 'https://api.apollo.io/api/v1'
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

const HEADCOUNT_LABELS: Record<string, string> = {
  '<50':       'under 50 employees',
  '50-200':    '50–200 employees',
  '200-1000':  '200–1,000 employees',
  '1000+':     'over 1,000 employees',
}

// POST /api/outbound/apollo-search
// Step 1: Gemini generates a list of real operating companies in the sector.
// Step 2: Apollo organizations/enrich validates each and returns the Apollo org ID.
// Step 3: Companies saved to ob_company_dump for people lookup in next step.
export async function POST(req: NextRequest) {
  try {
    const { sector, locations, headcountRanges, cronPreference, perPage } = await req.json()

    if (!sector || !Array.isArray(locations) || locations.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const geminiKey = process.env.GEMINI_API_KEY_DRAFT_EMAIL
    if (!geminiKey) return NextResponse.json({ error: 'GEMINI_API_KEY_DRAFT_EMAIL not configured' }, { status: 500 })

    const apolloKey = process.env.APOLLO_API_KEY
    if (!apolloKey) return NextResponse.json({ error: 'APOLLO_API_KEY not configured' }, { status: 500 })

    const resultCount   = Math.min(Math.max(1, parseInt(String(perPage ?? 10)) || 10), 50)
    const locationText  = locations.join(', ')
    const headcountNote = headcountRanges?.length > 0
      ? `Preferred company size: ${headcountRanges.map((r: string) => HEADCOUNT_LABELS[r] ?? r).join(' or ')}.`
      : ''

    // ── Step 1: Gemini company discovery ─────────────────────────────────────
    const geminiPrompt = `You are a B2B business researcher specialising in Asian markets.

List exactly ${resultCount} real ${sector} companies headquartered in or with significant operations in ${locationText}.

STRICT RULES:
- Operating businesses with actual products or services — NOT trade associations, industry bodies, festivals, incubators, accelerators, government agencies, or non-profits
- Companies that plausibly purchase commercial insurance (property, liability, cyber, marine, etc.)
- Diverse mix across ${sector} sub-sectors — do not repeat the same type of company
- Real companies that exist today, not hypothetical
${headcountNote}

Return ONLY valid JSON — no markdown, no commentary:
{"companies":[{"name":"Exact company name","website":"domain.com or null","description":"one-line description of what they do"}]}`

    const geminiRes = await fetch(`${GEMINI}?key=${geminiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: geminiPrompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens:  2048,
          thinkingConfig:   { thinkingBudget: 0 },
        },
      }),
    })

    if (!geminiRes.ok) {
      return NextResponse.json({ error: `AI discovery failed (${geminiRes.status})` }, { status: 502 })
    }

    const geminiData = await geminiRes.json()
    const gParts: Array<{ text?: string }> = geminiData.candidates?.[0]?.content?.parts ?? []
    let rawText = ''
    for (const part of gParts) {
      const candidate = (part?.text ?? '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      if (candidate.startsWith('{')) { rawText = candidate; break }
    }
    if (!rawText) {
      rawText = (gParts[gParts.length - 1]?.text ?? '{}').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    }
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (jsonMatch) rawText = jsonMatch[0]

    let geminiCompanies: { name: string; website?: string; description?: string }[] = []
    try {
      const parsed = JSON.parse(rawText)
      geminiCompanies = Array.isArray(parsed.companies) ? parsed.companies : []
    } catch {
      return NextResponse.json({ error: 'AI returned malformed company list. Try again.' }, { status: 502 })
    }

    if (geminiCompanies.length === 0) {
      return NextResponse.json({ error: 'AI found no companies. Try a broader sector or different location.' }, { status: 422 })
    }

    // ── Step 2: Apollo enrich each company to validate + get Apollo ID ────────
    const enrichedOrgs: {
      id: string; name: string; website_url: string | null
      estimated_num_employees: number | null; industry: string | null
      linkedin_url: string | null; primary_domain: string | null
      ai_description: string | null
    }[] = []

    for (const comp of geminiCompanies) {
      try {
        const params = new URLSearchParams({ name: comp.name })
        if (comp.website) params.set('domain', comp.website)

        const enrichRes = await fetch(`${APOLLO}/organizations/enrich?${params.toString()}`, {
          headers: { 'Cache-Control': 'no-cache', 'X-Api-Key': apolloKey },
        })
        if (!enrichRes.ok) continue

        const enrichData = await enrichRes.json()
        const org = enrichData.organization
        if (!org?.id) continue

        enrichedOrgs.push({
          id:                      org.id,
          name:                    org.name ?? comp.name,
          website_url:             org.website_url ?? comp.website ?? null,
          estimated_num_employees: org.estimated_num_employees ?? null,
          industry:                org.industry ?? null,
          linkedin_url:            org.linkedin_url ?? null,
          primary_domain:          org.primary_domain ?? null,
          ai_description:          comp.description ?? null,
        })
      } catch { /* skip unresolvable company */ }
    }

    const notEnriched = geminiCompanies.length - enrichedOrgs.length

    // ── Dedup against existing DB ─────────────────────────────────────────────
    const [dumpRes, leadsRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/ob_company_dump?select=name`, { headers: sbHeaders() }),
      fetch(`${SB_URL}/rest/v1/outbound_leads?select=current_company&record_type=eq.person`, { headers: sbHeaders() }),
    ])
    const dumpRows:  { name: string }[]            = dumpRes.ok  ? await dumpRes.json() : []
    const leadsRows: { current_company: string }[] = leadsRes.ok ? await leadsRes.json() : []
    const existingNames = new Set([
      ...(Array.isArray(dumpRows)  ? dumpRows.map(r => r.name.toLowerCase())                                       : []),
      ...(Array.isArray(leadsRows) ? leadsRows.map(r => r.current_company?.toLowerCase()).filter(Boolean) : []),
    ])

    const newOrgs = enrichedOrgs.filter(o => !existingNames.has(o.name.toLowerCase()))
    const skipped = enrichedOrgs.length - newOrgs.length

    // ── Save search log ───────────────────────────────────────────────────────
    const logPayload = {
      sector,
      location:         locations[0],
      geo_id:           locations[0],
      product_type:     'General',
      roles_targeted:   ['CEO', 'COO', 'Managing Director', 'CFO'],
      cron_preference:  cronPreference ?? null,
      company_count:    newOrgs.length,
      status:           'completed',
      locations,
      headcount_ranges: headcountRanges ?? [],
      per_page:         resultCount,
    }

    let logRes = await fetch(`${SB_URL}/rest/v1/ob_search_log`, {
      method: 'POST', headers: sbHeaders('return=representation'), body: JSON.stringify(logPayload),
    })
    if (!logRes.ok) {
      const { per_page: _omit, ...logPayloadCompat } = logPayload
      logRes = await fetch(`${SB_URL}/rest/v1/ob_search_log`, {
        method: 'POST', headers: sbHeaders('return=representation'), body: JSON.stringify(logPayloadCompat),
      })
    }
    if (!logRes.ok) return NextResponse.json({ error: 'Failed to save search log' }, { status: 500 })
    const [searchLog] = await logRes.json()

    // ── Insert new companies ──────────────────────────────────────────────────
    if (newOrgs.length > 0) {
      await fetch(`${SB_URL}/rest/v1/ob_company_dump`, {
        method:  'POST',
        headers: sbHeaders('return=minimal,resolution=ignore-duplicates'),
        body:    JSON.stringify(
          newOrgs.map((o, i) => ({
            search_id:      searchLog.id,
            name:           o.name,
            source_rank:    i + 1,
            apollo_id:      o.id,
            website:        o.website_url ?? o.primary_domain ?? null,
            employee_count: o.estimated_num_employees ?? null,
            industry:       o.industry ?? null,
            linkedin_url:   o.linkedin_url ?? null,
          }))
        ),
      })
    }

    const companiesRes = await fetch(
      `${SB_URL}/rest/v1/ob_company_dump?search_id=eq.${searchLog.id}&order=source_rank.asc`,
      { headers: sbHeaders() }
    )
    const companies = companiesRes.ok ? await companiesRes.json() : []

    return NextResponse.json({
      searchId:          searchLog.id,
      companies:         Array.isArray(companies) ? companies : [],
      totalFound:        geminiCompanies.length,
      enriched:          enrichedOrgs.length,
      notEnriched,
      skipped,
      creditsUsed:       enrichedOrgs.length,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
