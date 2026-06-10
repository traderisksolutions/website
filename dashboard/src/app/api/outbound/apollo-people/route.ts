import { NextRequest, NextResponse } from 'next/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const APOLLO = 'https://api.apollo.io/v1'

// AI-style role decision based on employee count + product type
function decideTitles(employeeCount: number | null, productType: string): string[] {
  const size = !employeeCount         ? 'unknown'
    : employeeCount < 50              ? 'small'
    : employeeCount < 200             ? 'medium'
    : employeeCount < 1000            ? 'large'
    :                                   'enterprise'

  const matrix: Record<string, Record<string, string[]>> = {
    api: {
      small:      ['CTO', 'Founder', 'CEO'],
      medium:     ['CTO', 'VP Engineering', 'Head of Product'],
      large:      ['VP Engineering', 'Director of Engineering', 'Head of Technology'],
      enterprise: ['VP Engineering', 'Director of Engineering', 'Head of Technology'],
      unknown:    ['CTO', 'VP Engineering'],
    },
    assets: {
      small:      ['CEO', 'Founder', 'Managing Director'],
      medium:     ['CEO', 'COO', 'CFO'],
      large:      ['COO', 'CFO', 'Operations Director'],
      enterprise: ['CFO', 'VP Finance', 'Head of Operations'],
      unknown:    ['CEO', 'COO', 'CFO'],
    },
    liabilities: {
      small:      ['CEO', 'Founder', 'Managing Director'],
      medium:     ['CEO', 'COO', 'Head of Risk'],
      large:      ['CFO', 'Head of Risk', 'Head of Compliance'],
      enterprise: ['Chief Risk Officer', 'Head of Risk', 'Head of Compliance'],
      unknown:    ['CEO', 'CFO', 'Head of Risk'],
    },
    workforce: {
      small:      ['CEO', 'Founder', 'Managing Director'],
      medium:     ['HR Director', 'Head of HR', 'CEO'],
      large:      ['HR Director', 'Chief People Officer', 'VP HR'],
      enterprise: ['Chief People Officer', 'VP HR', 'Head of People'],
      unknown:    ['CEO', 'HR Director', 'Chief People Officer'],
    },
  }

  return matrix[productType]?.[size] ?? ['CEO', 'COO', 'Managing Director']
}

function sbHeaders(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return {
    apikey:        k,
    Authorization: `Bearer ${k}`,
    'Content-Type': 'application/json',
    Prefer:        prefer,
  }
}

interface CompanyRow {
  id: string; name: string; apollo_id: string | null
  employee_count: number | null; linkedin_url: string | null
}

// POST /api/outbound/apollo-people
// Body: { searchId, companyIds: string[], productType }
export async function POST(req: NextRequest) {
  try {
    const { searchId, companyIds, productType } = await req.json()
    if (!searchId || !Array.isArray(companyIds) || companyIds.length === 0 || !productType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const apolloKey = process.env.APOLLO_API_KEY
    if (!apolloKey) return NextResponse.json({ error: 'APOLLO_API_KEY not configured' }, { status: 500 })

    // Load selected companies from DB
    const companiesRes = await fetch(
      `${SB_URL}/rest/v1/ob_company_dump?id=in.(${companyIds.join(',')})&select=*`,
      { headers: sbHeaders() }
    )
    const companies: CompanyRow[] = companiesRes.ok ? await companiesRes.json() : []

    const allPeople: Record<string, unknown>[] = []

    for (const company of companies) {
      const titles = decideTitles(company.employee_count, productType)

      // Apollo people search by company name + titles
      const apolloRes = await fetch(`${APOLLO}/mixed_people/search`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Cache-Control': 'no-cache',
          'X-Api-Key':     apolloKey,
        },
        body: JSON.stringify({
          q_organization_name:    company.name,
          person_titles:          titles,
          organization_locations: [],
          page:                   1,
          per_page:               10,
        }),
      })

      if (!apolloRes.ok) continue

      const apolloData = await apolloRes.json()
      const people: {
        id: string; first_name: string | null; last_name: string | null
        name: string | null; title: string | null; headline: string | null
        linkedin_url: string | null; photo_url: string | null
        city: string | null; state: string | null; country: string | null
        email: string | null
      }[] = apolloData.people ?? []

      if (people.length === 0) continue

      // Save people to ob_people_dump
      const rows = people.slice(0, 5).map(p => ({
        search_id:       searchId,
        company_id:      company.id,
        company_name:    company.name,
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

      const insertRes = await fetch(`${SB_URL}/rest/v1/ob_people_dump`, {
        method:  'POST',
        headers: { ...sbHeaders('return=representation'), Prefer: 'return=representation,resolution=ignore-duplicates' },
        body:    JSON.stringify(rows),
      })
      const inserted = insertRes.ok ? await insertRes.json() : []
      if (Array.isArray(inserted)) allPeople.push(...inserted)

      // Mark company as people_fetched
      await fetch(`${SB_URL}/rest/v1/ob_company_dump?id=eq.${company.id}`, {
        method:  'PATCH',
        headers: sbHeaders(),
        body:    JSON.stringify({ people_fetched: true, people_count: people.length }),
      })
    }

    // Return all people for this search (including previously fetched)
    const allPeopleRes = await fetch(
      `${SB_URL}/rest/v1/ob_people_dump?search_id=eq.${searchId}&order=created_at.asc`,
      { headers: sbHeaders() }
    )
    const finalPeople = allPeopleRes.ok ? await allPeopleRes.json() : allPeople

    return NextResponse.json({ people: Array.isArray(finalPeople) ? finalPeople : [] })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
