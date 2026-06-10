import { NextRequest, NextResponse } from 'next/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const APOLLO = 'https://api.apollo.io/v1'

// Maps UI headcount chip values → Apollo employee_ranges format
const HEADCOUNT_MAP: Record<string, string> = {
  '<50':       '1,49',
  '50-200':    '50,200',
  '200-1000':  '201,1000',
  '1000+':     '1001,10000',
}

const ROLE_MAP: Record<string, string[]> = {
  api:         ['CTO', 'VP Engineering', 'Head of Product', 'Technical Lead', 'Product Manager'],
  assets:      ['CEO', 'COO', 'Managing Director', 'CFO', 'Operations Director'],
  liabilities: ['CEO', 'COO', 'Managing Director', 'CFO', 'Head of Risk', 'Head of Compliance'],
  workforce:   ['CEO', 'COO', 'HR Director', 'Chief People Officer', 'Head of HR'],
}

function sbHeaders(returnRepresentation = false) {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return {
    apikey:        k,
    Authorization: `Bearer ${k}`,
    'Content-Type': 'application/json',
    Prefer:        returnRepresentation ? 'return=representation' : 'return=minimal',
  }
}

// POST /api/outbound/apollo-search
// Body: { sector, locations: string[], headcountRanges: string[], productType, cronPreference? }
export async function POST(req: NextRequest) {
  try {
    const { sector, locations, headcountRanges, productType, cronPreference } = await req.json()

    if (!sector || !Array.isArray(locations) || locations.length === 0 || !productType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const apolloKey = process.env.APOLLO_API_KEY
    if (!apolloKey) return NextResponse.json({ error: 'APOLLO_API_KEY not configured' }, { status: 500 })

    const roles = ROLE_MAP[productType] ?? ['CEO', 'COO', 'Managing Director']

    // Build Apollo employee ranges filter
    const employeeRanges: string[] = Array.isArray(headcountRanges) && headcountRanges.length > 0
      ? headcountRanges.map(r => HEADCOUNT_MAP[r]).filter(Boolean)
      : []

    // Apollo company search
    const apolloBody: Record<string, unknown> = {
      q_organization_keyword_tags: [sector],
      organization_locations:      locations,
      page:                        1,
      per_page:                    50,
    }
    if (employeeRanges.length > 0) {
      apolloBody.organization_num_employees_ranges = employeeRanges
    }

    const apolloRes = await fetch(`${APOLLO}/mixed_companies/search`, {
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
    const rawCompanies: {
      id: string; name: string; website_url: string | null
      estimated_num_employees: number | null; industry: string | null
      linkedin_url: string | null
    }[] = apolloData.organizations ?? []

    if (rawCompanies.length === 0) {
      return NextResponse.json({ error: 'Apollo returned no companies. Try different criteria.' }, { status: 422 })
    }

    // Deduplicate against ob_company_dump + outbound_leads
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

    const newCompanies = rawCompanies.filter(c => !existingNames.has(c.name.toLowerCase()))
    const skipped      = rawCompanies.length - newCompanies.length

    // Save search log
    const logRes = await fetch(`${SB_URL}/rest/v1/ob_search_log`, {
      method:  'POST',
      headers: sbHeaders(true),
      body:    JSON.stringify({
        sector,
        location:         locations[0],
        geo_id:           locations[0],
        product_type:     productType,
        roles_targeted:   roles,
        cron_preference:  cronPreference ?? null,
        company_count:    newCompanies.length,
        status:           'completed',
        locations,
        headcount_ranges: headcountRanges ?? [],
      }),
    })
    if (!logRes.ok) return NextResponse.json({ error: 'Failed to save search log' }, { status: 500 })
    const [searchLog] = await logRes.json()

    // Insert companies with Apollo data
    if (newCompanies.length > 0) {
      await fetch(`${SB_URL}/rest/v1/ob_company_dump`, {
        method:  'POST',
        headers: { ...sbHeaders(), Prefer: 'return=minimal,resolution=ignore-duplicates' },
        body:    JSON.stringify(
          newCompanies.map((c, i) => ({
            search_id:     searchLog.id,
            name:          c.name,
            source_rank:   i + 1,
            apollo_id:     c.id ?? null,
            website:       c.website_url ?? null,
            employee_count: c.estimated_num_employees ?? null,
            industry:      c.industry ?? null,
            linkedin_url:  c.linkedin_url ?? null,
          }))
        ),
      })
    }

    // Return inserted companies
    const companiesRes = await fetch(
      `${SB_URL}/rest/v1/ob_company_dump?search_id=eq.${searchLog.id}&order=source_rank.asc`,
      { headers: sbHeaders() }
    )
    const companies = companiesRes.ok ? await companiesRes.json() : []

    return NextResponse.json({
      searchId:   searchLog.id,
      companies:  Array.isArray(companies) ? companies : [],
      totalFound: rawCompanies.length,
      skipped,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
