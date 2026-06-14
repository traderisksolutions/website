import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbHeaders } from '@/lib/sb'

const APOLLO = 'https://api.apollo.io/api/v1'

const HEADCOUNT_MAP: Record<string, string> = {
  '<50':       '1,49',
  '50-200':    '50,200',
  '200-1000':  '201,1000',
  '1000+':     '1001,10000',
}

const ROLE_MAP: Record<string, string[]> = {
  api:         ['CTO', 'VP Engineering', 'Head of Product', 'Technical Lead'],
  assets:      ['CEO', 'COO', 'Managing Director', 'CFO', 'Operations Director'],
  liabilities: ['CEO', 'COO', 'Managing Director', 'CFO', 'Head of Risk', 'Head of Compliance'],
  workforce:   ['CEO', 'COO', 'HR Director', 'Chief People Officer', 'Head of HR'],
}

// POST /api/outbound/apollo-search
// Uses organizations/search (available on Apollo free plan).
// Body: { sector, locations, headcountRanges, productType, perPage?, cronPreference? }
export async function POST(req: NextRequest) {
  try {
    const { sector, locations, headcountRanges, productType, cronPreference, perPage } = await req.json()

    if (!sector || !Array.isArray(locations) || locations.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const apolloKey = process.env.APOLLO_API_KEY
    if (!apolloKey) return NextResponse.json({ error: 'APOLLO_API_KEY not configured' }, { status: 500 })

    const pt           = productType ?? 'General'
    const roles        = ROLE_MAP[pt] ?? ['CEO', 'COO', 'Managing Director']
    const resultCount  = Math.min(Math.max(1, parseInt(String(perPage ?? 10)) || 10), 100)
    const employeeRanges: string[] = Array.isArray(headcountRanges) && headcountRanges.length > 0
      ? headcountRanges.map((r: string) => HEADCOUNT_MAP[r]).filter(Boolean)
      : []

    const apolloBody: Record<string, unknown> = {
      q_organization_keyword_tags: [sector],
      organization_locations:      locations,
      page:                        1,
      per_page:                    resultCount,
    }
    if (employeeRanges.length > 0) {
      apolloBody.organization_num_employees_ranges = employeeRanges
    }

    const apolloRes = await fetch(`${APOLLO}/organizations/search`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key':     apolloKey,
      },
      body: JSON.stringify(apolloBody),
    })

    if (!apolloRes.ok) {
      const err = await apolloRes.text()
      return NextResponse.json({ error: `Apollo error: ${err}` }, { status: 502 })
    }

    const apolloData = await apolloRes.json()
    const rawOrgs: {
      id: string; name: string; website_url: string | null
      estimated_num_employees: number | null; industry: string | null
      linkedin_url: string | null; primary_domain: string | null
    }[] = apolloData.organizations ?? []

    if (rawOrgs.length === 0) {
      return NextResponse.json({ error: 'Apollo returned no results. Try a broader sector or different location.' }, { status: 422 })
    }

    // Dedup against existing data
    const [dumpRes, leadsRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/ob_company_dump?select=name`, { headers: sbHeaders() }),
      fetch(`${SB_URL}/rest/v1/outbound_leads?select=current_company&record_type=eq.person`, { headers: sbHeaders() }),
    ])
    const dumpRows:  { name: string }[]            = dumpRes.ok  ? await dumpRes.json()  : []
    const leadsRows: { current_company: string }[] = leadsRes.ok ? await leadsRes.json() : []
    const existingNames = new Set([
      ...(Array.isArray(dumpRows)  ? dumpRows.map(r => r.name.toLowerCase())                                   : []),
      ...(Array.isArray(leadsRows) ? leadsRows.map(r => r.current_company?.toLowerCase()).filter(Boolean) : []),
    ])

    const newOrgs = rawOrgs.filter(o => !existingNames.has(o.name.toLowerCase()))
    const skipped = rawOrgs.length - newOrgs.length

    // Save search log — try with per_page first, fall back without if column doesn't exist
    const logPayload = {
      sector,
      location:         locations[0],
      geo_id:           locations[0],
      product_type:     pt,
      roles_targeted:   roles,
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
      // per_page column may not exist yet — retry without it
      const { per_page: _omit, ...logPayloadCompat } = logPayload
      logRes = await fetch(`${SB_URL}/rest/v1/ob_search_log`, {
        method: 'POST', headers: sbHeaders('return=representation'), body: JSON.stringify(logPayloadCompat),
      })
    }
    if (!logRes.ok) return NextResponse.json({ error: 'Failed to save search log' }, { status: 500 })
    const [searchLog] = await logRes.json()

    // Insert new companies
    if (newOrgs.length > 0) {
      await fetch(`${SB_URL}/rest/v1/ob_company_dump`, {
        method:  'POST',
        headers: sbHeaders('return=minimal,resolution=ignore-duplicates'),
        body:    JSON.stringify(
          newOrgs.map((o, i) => ({
            search_id:      searchLog.id,
            name:           o.name,
            source_rank:    i + 1,
            apollo_id:      o.id ?? null,
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
      searchId:     searchLog.id,
      companies:    Array.isArray(companies) ? companies : [],
      totalFound:   rawOrgs.length,
      skipped,
      creditsUsed:  resultCount,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
