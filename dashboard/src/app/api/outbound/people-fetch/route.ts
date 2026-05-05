import { NextRequest, NextResponse } from 'next/server'

const SB_URL      = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const NETROWS_URL = 'https://api.netrows.com/v1/people/search'
const MAX_PEOPLE  = 100   // cap per company
const PAGES       = 10    // 10 results/page × 10 pages = 100 max

function sbHeaders(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return {
    apikey:         k,
    Authorization:  `Bearer ${k}`,
    'Content-Type': 'application/json',
    Prefer:         prefer,
  }
}

async function fetchPage(company: string, keywordTitle: string, geo: string, start: number): Promise<Record<string, unknown>[]> {
  const key = process.env.NETROWS_API_KEY
  if (!key) return []
  const params = new URLSearchParams({ company, keywordTitle, geo, start: String(start) })
  try {
    const res = await fetch(`${NETROWS_URL}?${params}`, {
      headers: { Authorization: `Bearer ${key}` },
    })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data?.data) ? data.data : []
  } catch { return [] }
}

export async function POST(req: NextRequest) {
  try {
    const { searchId, companyIds } = await req.json() as { searchId: string; companyIds: string[] }
    if (!searchId || !Array.isArray(companyIds) || companyIds.length === 0) {
      return NextResponse.json({ error: 'Missing searchId or companyIds' }, { status: 400 })
    }

    // Load search metadata (roles + geo)
    const searchRes = await fetch(
      `${SB_URL}/rest/v1/ob_search_log?id=eq.${searchId}&select=*`,
      { headers: sbHeaders() }
    )
    const searches = searchRes.ok ? await searchRes.json() : []
    const search   = Array.isArray(searches) ? searches[0] : null
    if (!search) return NextResponse.json({ error: 'Search not found' }, { status: 404 })

    const roles: string[]  = Array.isArray(search.roles_targeted) ? search.roles_targeted : ['CEO']
    const geo:   string    = search.geo_id ?? '102454443'
    const keywordTitle     = roles.slice(0, 3).join(' ')

    // Load selected companies
    const cmpRes = await fetch(
      `${SB_URL}/rest/v1/ob_company_dump?id=in.(${companyIds.join(',')})&select=*`,
      { headers: sbHeaders() }
    )
    const companies = cmpRes.ok ? await cmpRes.json() : []
    if (!Array.isArray(companies) || companies.length === 0) {
      return NextResponse.json({ error: 'Companies not found' }, { status: 404 })
    }

    // Load existing linkedin_urls to avoid re-inserting
    const existingRes = await fetch(
      `${SB_URL}/rest/v1/ob_people_dump?select=linkedin_url`,
      { headers: sbHeaders() }
    )
    const existingRows = existingRes.ok ? await existingRes.json() : []
    const existingUrls = new Set<string>(
      Array.isArray(existingRows)
        ? existingRows.map((r: { linkedin_url: string }) => r.linkedin_url).filter(Boolean)
        : []
    )

    // ── Per company: paginate Netrows, save to ob_people_dump ───────────────
    for (const company of companies) {
      const collected: Record<string, unknown>[] = []

      for (let page = 0; page < PAGES; page++) {
        const batch = await fetchPage(company.name, keywordTitle, geo, page * 10)
        if (batch.length === 0) break
        collected.push(...batch)
        if (collected.length >= MAX_PEOPLE) break
        await new Promise(r => setTimeout(r, 350)) // rate-limit courtesy delay
      }

      const rows = collected
        .filter(p => {
          const url = p.username ? `https://www.linkedin.com/in/${p.username}` : null
          return url && !existingUrls.has(url)
        })
        .slice(0, MAX_PEOPLE)
        .map(p => {
          const url = `https://www.linkedin.com/in/${p.username}`
          existingUrls.add(url) // dedupe within this batch too
          return {
            search_id:       searchId,
            company_id:      company.id,
            company_name:    company.name,
            first_name:      (p.firstName  as string)  ?? null,
            last_name:       (p.lastName   as string)  ?? null,
            full_name:       [p.firstName, p.lastName].filter(Boolean).join(' ') || null,
            username:        (p.username   as string)  ?? null,
            headline:        (p.headline   as string)  ?? null,
            linkedin_url:    url,
            profile_picture: (p.profilePicture as string) ?? null,
            location:        (p.location   as string)  ?? null,
            summary:         (p.summary    as string)  ?? null,
          }
        })

      if (rows.length > 0) {
        await fetch(`${SB_URL}/rest/v1/ob_people_dump`, {
          method:  'POST',
          headers: { ...sbHeaders(), Prefer: 'return=minimal,resolution=ignore-duplicates' },
          body:    JSON.stringify(rows),
        })
      }

      // Mark company people_fetched
      await fetch(`${SB_URL}/rest/v1/ob_company_dump?id=eq.${company.id}`, {
        method:  'PATCH',
        headers: sbHeaders(),
        body:    JSON.stringify({ people_fetched: true, people_count: rows.length }),
      })
    }

    // Return all people for this search
    const peopleRes = await fetch(
      `${SB_URL}/rest/v1/ob_people_dump?search_id=eq.${searchId}&order=created_at.asc`,
      { headers: sbHeaders() }
    )
    const people = peopleRes.ok ? await peopleRes.json() : []

    return NextResponse.json({ people: Array.isArray(people) ? people : [] })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
