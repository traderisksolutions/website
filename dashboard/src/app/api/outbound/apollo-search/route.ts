import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbHeaders } from '@/lib/sb'

const APOLLO = 'https://api.apollo.io/api/v1'

// Maps UI headcount values → Apollo employee_ranges format
const HEADCOUNT_MAP: Record<string, string> = {
  '<50':       '1,49',
  '50-200':    '50,200',
  '200-1000':  '201,1000',
  '1000+':     '1001,10000',
}

// Roles to search per product type
const ROLE_MAP: Record<string, string[]> = {
  api:         ['CTO', 'VP Engineering', 'Head of Product', 'Technical Lead'],
  assets:      ['CEO', 'COO', 'Managing Director', 'CFO', 'Operations Director'],
  liabilities: ['CEO', 'COO', 'Managing Director', 'CFO', 'Head of Risk', 'Head of Compliance'],
  workforce:   ['CEO', 'COO', 'HR Director', 'Chief People Officer', 'Head of HR'],
}

// POST /api/outbound/apollo-search
// Uses people/search (available on Apollo free plan).
// Extracts unique companies from results, saves both companies + people.
export async function POST(req: NextRequest) {
  try {
    const { sector, locations, headcountRanges, productType, cronPreference } = await req.json()

    if (!sector || !Array.isArray(locations) || locations.length === 0 || !productType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const apolloKey = process.env.APOLLO_API_KEY
    if (!apolloKey) return NextResponse.json({ error: 'APOLLO_API_KEY not configured' }, { status: 500 })

    const roles = ROLE_MAP[productType] ?? ['CEO', 'COO', 'Managing Director']
    const employeeRanges: string[] = Array.isArray(headcountRanges) && headcountRanges.length > 0
      ? headcountRanges.map((r: string) => HEADCOUNT_MAP[r]).filter(Boolean)
      : []

    const apolloBody: Record<string, unknown> = {
      person_titles:               roles,
      organization_locations:      locations,
      q_organization_keyword_tags: [sector],
      page:                        1,
      per_page:                    25,
    }
    if (employeeRanges.length > 0) {
      apolloBody.organization_num_employees_ranges = employeeRanges
    }

    const apolloRes = await fetch(`${APOLLO}/people/search`, {
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
    const rawPeople: {
      id: string; first_name: string | null; last_name: string | null; name: string | null
      title: string | null; headline: string | null; linkedin_url: string | null
      photo_url: string | null; city: string | null; state: string | null
      country: string | null; email: string | null
      organization_name: string | null; organization_id: string | null
    }[] = apolloData.people ?? []

    if (rawPeople.length === 0) {
      return NextResponse.json({ error: 'Apollo returned no results for these criteria. Try a broader sector or different location.' }, { status: 422 })
    }

    // Extract unique companies from people results
    const seenNames = new Set<string>()
    const uniqueCompanies: { name: string; apollo_id: string | null }[] = []
    for (const p of rawPeople) {
      const name = p.organization_name?.trim()
      if (name && !seenNames.has(name.toLowerCase())) {
        seenNames.add(name.toLowerCase())
        uniqueCompanies.push({ name, apollo_id: p.organization_id ?? null })
      }
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
    const newCompanies = uniqueCompanies.filter(c => !existingNames.has(c.name.toLowerCase()))
    const skipped      = uniqueCompanies.length - newCompanies.length

    // Save search log
    const logRes = await fetch(`${SB_URL}/rest/v1/ob_search_log`, {
      method:  'POST',
      headers: sbHeaders('return=representation'),
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

    // Insert new companies
    if (newCompanies.length > 0) {
      await fetch(`${SB_URL}/rest/v1/ob_company_dump`, {
        method:  'POST',
        headers: sbHeaders('return=minimal,resolution=ignore-duplicates'),
        body:    JSON.stringify(
          newCompanies.map((c, i) => ({
            search_id:   searchLog.id,
            name:        c.name,
            source_rank: i + 1,
            apollo_id:   c.apollo_id,
          }))
        ),
      })
    }

    // Fetch all companies for this search (including pre-existing)
    const companiesRes = await fetch(
      `${SB_URL}/rest/v1/ob_company_dump?search_id=eq.${searchLog.id}&order=source_rank.asc`,
      { headers: sbHeaders() }
    )
    const companies: { id: string; name: string }[] = companiesRes.ok ? await companiesRes.json() : []

    // Build name → id map to link people to their company rows
    const companyIdMap = new Map(companies.map(c => [c.name.toLowerCase(), c.id]))

    // Insert people to ob_people_dump (pre-populated from this search)
    if (rawPeople.length > 0) {
      await fetch(`${SB_URL}/rest/v1/ob_people_dump`, {
        method:  'POST',
        headers: { ...sbHeaders(), Prefer: 'return=minimal,resolution=ignore-duplicates' },
        body:    JSON.stringify(
          rawPeople.map(p => ({
            search_id:       searchLog.id,
            company_id:      companyIdMap.get(p.organization_name?.toLowerCase() ?? '') ?? null,
            company_name:    p.organization_name ?? null,
            first_name:      p.first_name ?? null,
            last_name:       p.last_name  ?? null,
            full_name:       p.name       ?? null,
            apollo_id:       p.id,
            title:           p.title      ?? null,
            headline:        p.headline ?? p.title ?? null,
            linkedin_url:    p.linkedin_url ?? null,
            profile_picture: p.photo_url    ?? null,
            location:        [p.city, p.state, p.country].filter(Boolean).join(', ') || null,
            email:           p.email ?? null,
            email_status:    p.email ? 'valid' : null,
            email_requested: !!p.email,
          }))
        ),
      })

      // Mark companies that have people as people_fetched
      if (companies.length > 0) {
        const companyIdsWithPeople = companies
          .filter(c => rawPeople.some(p => p.organization_name?.toLowerCase() === c.name.toLowerCase()))
          .map(c => c.id)
        if (companyIdsWithPeople.length > 0) {
          await Promise.all(companyIdsWithPeople.map(cid =>
            fetch(`${SB_URL}/rest/v1/ob_company_dump?id=eq.${cid}`, {
              method:  'PATCH',
              headers: sbHeaders(),
              body:    JSON.stringify({
                people_fetched: true,
                people_count:   rawPeople.filter(p => p.organization_name?.toLowerCase() === companies.find(c => c.id === cid)?.name.toLowerCase()).length,
              }),
            })
          ))
        }
      }
    }

    return NextResponse.json({
      searchId:   searchLog.id,
      companies:  Array.isArray(companies) ? companies : [],
      totalFound: uniqueCompanies.length,
      skipped,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
