import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbHeaders } from '@/lib/sb'

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
// Body: { searchId, companyIds: string[], productType }
export async function POST(req: NextRequest) {
  try {
    const { searchId, companyIds } = await req.json()
    if (!searchId || !Array.isArray(companyIds) || companyIds.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // People are pre-populated during apollo-search; just query them from DB
    const savedRes = await fetch(
      `${SB_URL}/rest/v1/ob_people_dump?search_id=eq.${searchId}&company_id=in.(${companyIds.join(',')})&order=created_at.asc`,
      { headers: sbHeaders() }
    )
    const saved: Record<string, unknown>[] = savedRes.ok ? await savedRes.json() : []

    // Promote any person not yet linked to outbound_leads
    for (const person of saved) {
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

    return NextResponse.json({ people: Array.isArray(saved) ? saved : [] })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
