import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbHeaders } from '@/lib/sb'

const APOLLO = 'https://api.apollo.io/api/v1'

async function promotePersonToLead(person: Record<string, unknown>): Promise<string | null> {
  const leadRes = await fetch(`${SB_URL}/rest/v1/outbound_leads`, {
    method:  'POST',
    headers: sbHeaders('return=representation,resolution=ignore-duplicates'),
    body: JSON.stringify({
      record_type:     'person',
      source:          'people_search',
      linkedin_url:    person.linkedin_url    ?? null,
      first_name:      person.first_name      ?? null,
      last_name:       person.last_name       ?? null,
      full_name:       person.full_name       ?? null,
      headline:        (person.headline ?? person.title) ?? null,
      profile_picture: person.profile_picture ?? null,
      location:        person.location        ?? null,
      current_title:   (person.headline ?? person.title) ?? null,
      current_company: person.company_name    ?? null,
      status:          'new',
      consent_source:  'public_business_data',
    }),
  })

  if (leadRes.ok) {
    const body = await leadRes.json().catch(() => null)
    const lead = Array.isArray(body) ? body[0] : body
    if (lead?.id) return lead.id as string
  }

  // Duplicate — find existing lead by linkedin_url
  if (person.linkedin_url) {
    const encoded = encodeURIComponent(person.linkedin_url as string)
    const findRes = await fetch(
      `${SB_URL}/rest/v1/outbound_leads?linkedin_url=eq.${encoded}&select=id&limit=1`,
      { headers: sbHeaders() }
    )
    if (findRes.ok) {
      const rows = await findRes.json().catch(() => null)
      const row = Array.isArray(rows) ? rows[0] : null
      if (row?.id) return row.id as string
    }
  }

  return null
}

// POST /api/outbound/apollo-people
// Body: { searchId, companyIds: string[] }
// Calls mixed_people/organization_top_people for each company using stored apollo_id.
export async function POST(req: NextRequest) {
  try {
    const { searchId, companyIds } = await req.json()
    if (!searchId || !Array.isArray(companyIds) || companyIds.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const apolloKey = process.env.APOLLO_API_KEY
    if (!apolloKey) return NextResponse.json({ error: 'APOLLO_API_KEY not configured' }, { status: 500 })

    // Load company rows to get apollo_id
    const compRes = await fetch(
      `${SB_URL}/rest/v1/ob_company_dump?id=in.(${companyIds.join(',')})&select=id,name,apollo_id`,
      { headers: sbHeaders() }
    )
    const compRows: { id: string; name: string; apollo_id: string | null }[] =
      compRes.ok ? await compRes.json() : []

    const allPeople: Record<string, unknown>[] = []

    // Check which people are already saved for these companies to avoid re-fetching
    const existingRes = await fetch(
      `${SB_URL}/rest/v1/ob_people_dump?search_id=eq.${searchId}&company_id=in.(${companyIds.join(',')})`,
      { headers: sbHeaders() }
    )
    const existingPeople: Record<string, unknown>[] = existingRes.ok ? await existingRes.json() : []
    const fetchedCompanyIds = new Set(
      Array.isArray(existingPeople) ? existingPeople.map(p => String(p.company_id)) : []
    )

    for (const comp of compRows) {
      // If already fetched for this company, use DB data
      if (fetchedCompanyIds.has(comp.id)) {
        const existing = existingPeople.filter(p => String(p.company_id) === comp.id)
        allPeople.push(...existing)
        continue
      }

      if (!comp.apollo_id) continue

      let apolloPeople: Record<string, unknown>[] = []
      try {
        const res = await fetch(`${APOLLO}/mixed_people/organization_top_people`, {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Cache-Control': 'no-cache',
            'X-Api-Key':     apolloKey,
          },
          body: JSON.stringify({
            organization_id: comp.apollo_id,
            page:            1,
            per_page:        10,
          }),
        })
        if (res.ok) {
          const data = await res.json()
          apolloPeople = Array.isArray(data.people) ? data.people : []
        }
      } catch { /* skip this company on network error */ }

      if (apolloPeople.length === 0) continue

      // Save to ob_people_dump
      const toInsert = apolloPeople.map(p => ({
        search_id:        searchId,
        company_id:       comp.id,
        company_name:     comp.name,
        apollo_person_id: (p.id as string) ?? null,
        first_name:       (p.first_name as string) ?? null,
        last_name:        (p.last_name as string) ?? null,
        full_name:        (p.name as string) ?? null,
        title:            (p.title as string) ?? null,
        headline:         (p.headline as string) ?? (p.title as string) ?? null,
        linkedin_url:     (p.linkedin_url as string) ?? null,
        profile_picture:  (p.photo_url as string) ?? null,
        location:         [p.city, p.state, p.country].filter(Boolean).join(', ') || null,
      }))

      const insertRes = await fetch(`${SB_URL}/rest/v1/ob_people_dump`, {
        method:  'POST',
        headers: sbHeaders('return=representation,resolution=ignore-duplicates'),
        body:    JSON.stringify(toInsert),
      })
      const insertedRows: Record<string, unknown>[] = insertRes.ok ? await insertRes.json() : []
      allPeople.push(...(Array.isArray(insertedRows) ? insertedRows : []))
    }

    // Promote to outbound_leads
    for (const person of allPeople) {
      if (person.outbound_lead_id) continue
      const leadId = await promotePersonToLead(person)
      if (leadId) {
        person.outbound_lead_id = leadId
        await fetch(`${SB_URL}/rest/v1/ob_people_dump?id=eq.${person.id}`, {
          method:  'PATCH',
          headers: sbHeaders(),
          body:    JSON.stringify({ outbound_lead_id: leadId }),
        })
      }
    }

    // Mark companies as people_fetched
    await Promise.all(companyIds.map((cid: string) =>
      fetch(`${SB_URL}/rest/v1/ob_company_dump?id=eq.${cid}`, {
        method:  'PATCH',
        headers: sbHeaders(),
        body:    JSON.stringify({ people_fetched: true }),
      })
    ))

    return NextResponse.json({ people: allPeople })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
