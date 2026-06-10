import { NextRequest, NextResponse } from 'next/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const APOLLO = 'https://api.apollo.io/v1'

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

interface PersonRow {
  id:              string
  apollo_id:       string | null
  linkedin_url:    string | null
  first_name:      string | null
  last_name:       string | null
  full_name:       string | null
  headline:        string | null
  title:           string | null
  summary:         string | null
  profile_picture: string | null
  location:        string | null
  company_name:    string
  email:           string | null
}

// POST /api/outbound/apollo-email
// Body: { personIds: string[] }
export async function POST(req: NextRequest) {
  try {
    const { personIds } = await req.json() as { personIds: string[] }
    if (!Array.isArray(personIds) || personIds.length === 0) {
      return NextResponse.json({ error: 'No person IDs provided' }, { status: 400 })
    }

    const apolloKey = process.env.APOLLO_API_KEY
    if (!apolloKey) return NextResponse.json({ error: 'APOLLO_API_KEY not configured' }, { status: 500 })

    // Load people from DB
    const peopleRes = await fetch(
      `${SB_URL}/rest/v1/ob_people_dump?id=in.(${personIds.join(',')})&select=*`,
      { headers: sbHeaders() }
    )
    const people: PersonRow[] = peopleRes.ok ? await peopleRes.json() : []
    if (!Array.isArray(people) || people.length === 0) {
      return NextResponse.json({ error: 'People not found' }, { status: 404 })
    }

    const results: {
      id: string; email: string | null; email_status: string; outbound_lead_id: string | null
    }[] = []

    for (const person of people) {
      // If Apollo already returned an email during people search, use it
      if (person.email) {
        const outboundLeadId = await promoteToLeads(person, person.email, 'valid', sbHeaders)
        await fetch(`${SB_URL}/rest/v1/ob_people_dump?id=eq.${person.id}`, {
          method:  'PATCH',
          headers: sbHeaders(),
          body:    JSON.stringify({ email_requested: true, email_status: 'valid', outbound_lead_id: outboundLeadId }),
        })
        results.push({ id: person.id, email: person.email, email_status: 'valid', outbound_lead_id: outboundLeadId })
        continue
      }

      if (!person.apollo_id) {
        await fetch(`${SB_URL}/rest/v1/ob_people_dump?id=eq.${person.id}`, {
          method:  'PATCH',
          headers: sbHeaders(),
          body:    JSON.stringify({ email_requested: true, email_status: 'no_apollo_id' }),
        })
        results.push({ id: person.id, email: null, email_status: 'no_apollo_id', outbound_lead_id: null })
        continue
      }

      try {
        // Apollo email enrichment — reveal email by apollo person ID
        const enrichRes = await fetch(`${APOLLO}/people/match`, {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Cache-Control': 'no-cache',
            'X-Api-Key':     apolloKey,
          },
          body: JSON.stringify({
            id:              person.apollo_id,
            reveal_personal_emails: false,
          }),
        })

        let email: string | null = null
        let emailStatus          = 'not_found'

        if (enrichRes.ok) {
          const data    = await enrichRes.json()
          const matched = data.person
          email       = matched?.email ?? null
          emailStatus = matched?.email_status ?? (email ? 'valid' : 'not_found')
        }

        let outboundLeadId: string | null = null
        if (email) {
          outboundLeadId = await promoteToLeads(person, email, emailStatus, sbHeaders)
        }

        await fetch(`${SB_URL}/rest/v1/ob_people_dump?id=eq.${person.id}`, {
          method:  'PATCH',
          headers: sbHeaders(),
          body:    JSON.stringify({ email, email_status: emailStatus, email_requested: true, outbound_lead_id: outboundLeadId }),
        })

        results.push({ id: person.id, email, email_status: emailStatus, outbound_lead_id: outboundLeadId })
        await new Promise(r => setTimeout(r, 300))
      } catch {
        results.push({ id: person.id, email: null, email_status: 'error', outbound_lead_id: null })
      }
    }

    return NextResponse.json({ results })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

async function promoteToLeads(
  person: PersonRow,
  email: string,
  emailStatus: string,
  headers: (prefer?: string) => Record<string, string>
): Promise<string | null> {
  const leadRes = await fetch(`${SB_URL}/rest/v1/outbound_leads`, {
    method:  'POST',
    headers: headers('return=representation,resolution=ignore-duplicates'),
    body:    JSON.stringify({
      record_type:     'person',
      source:          'people_search',
      linkedin_url:    person.linkedin_url,
      first_name:      person.first_name,
      last_name:       person.last_name,
      full_name:       person.full_name,
      headline:        person.headline ?? person.title,
      summary:         person.summary,
      profile_picture: person.profile_picture,
      location:        person.location,
      current_title:   person.headline ?? person.title,
      current_company: person.company_name,
      email,
      email_status:    emailStatus,
      status:          'new',
      consent_source:  'public_business_data',
      search_query:    { source: 'apollo', company: person.company_name },
    }),
  })

  if (!leadRes.ok) return null
  const body = await leadRes.json().catch(() => null)
  const lead = Array.isArray(body) ? body[0] : body
  return lead?.id ?? null
}
