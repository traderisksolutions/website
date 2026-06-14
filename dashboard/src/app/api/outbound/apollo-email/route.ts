import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbHeaders } from '@/lib/sb'

const APOLLO = 'https://api.apollo.io/v1'

interface PersonRow {
  id:               string
  apollo_id:        string | null
  linkedin_url:     string | null
  first_name:       string | null
  last_name:        string | null
  full_name:        string | null
  headline:         string | null
  title:            string | null
  summary:          string | null
  profile_picture:  string | null
  location:         string | null
  company_name:     string
  email:            string | null
  outbound_lead_id: string | null
}

// POST /api/outbound/apollo-email
// Body: { personIds: string[] } | { leadId: string }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { personIds?: string[]; leadId?: string }

    const apolloKey = process.env.APOLLO_API_KEY
    if (!apolloKey) return NextResponse.json({ error: 'APOLLO_API_KEY not configured' }, { status: 500 })

    let people: PersonRow[]

    if (body.leadId) {
      const peopleRes = await fetch(
        `${SB_URL}/rest/v1/ob_people_dump?outbound_lead_id=eq.${body.leadId}&select=*&limit=1`,
        { headers: sbHeaders() }
      )
      const rows: PersonRow[] = peopleRes.ok ? await peopleRes.json() : []
      if (!Array.isArray(rows) || rows.length === 0) {
        return NextResponse.json({ error: 'Person record not found for this lead' }, { status: 404 })
      }
      people = rows
    } else if (Array.isArray(body.personIds) && body.personIds.length > 0) {
      const peopleRes = await fetch(
        `${SB_URL}/rest/v1/ob_people_dump?id=in.(${body.personIds.join(',')})&select=*`,
        { headers: sbHeaders() }
      )
      people = peopleRes.ok ? await peopleRes.json() : []
      if (!Array.isArray(people) || people.length === 0) {
        return NextResponse.json({ error: 'People not found' }, { status: 404 })
      }
    } else {
      return NextResponse.json({ error: 'Provide personIds or leadId' }, { status: 400 })
    }

    const results: {
      id: string; email: string | null; email_status: string; outbound_lead_id: string | null
    }[] = []

    for (const person of people) {
      if (person.email) {
        let outboundLeadId = person.outbound_lead_id
        if (outboundLeadId) {
          await fetch(`${SB_URL}/rest/v1/outbound_leads?id=eq.${outboundLeadId}`, {
            method: 'PATCH', headers: sbHeaders(),
            body: JSON.stringify({ email: person.email, email_status: 'valid' }),
          })
        } else {
          outboundLeadId = await promoteToLeads(person, person.email, 'valid')
        }
        await fetch(`${SB_URL}/rest/v1/ob_people_dump?id=eq.${person.id}`, {
          method: 'PATCH', headers: sbHeaders(),
          body: JSON.stringify({ email_requested: true, email_status: 'valid', outbound_lead_id: outboundLeadId }),
        })
        results.push({ id: person.id, email: person.email, email_status: 'valid', outbound_lead_id: outboundLeadId })
        continue
      }

      if (!person.apollo_id) {
        await fetch(`${SB_URL}/rest/v1/ob_people_dump?id=eq.${person.id}`, {
          method: 'PATCH', headers: sbHeaders(),
          body: JSON.stringify({ email_requested: true, email_status: 'no_apollo_id' }),
        })
        results.push({ id: person.id, email: null, email_status: 'no_apollo_id', outbound_lead_id: person.outbound_lead_id })
        continue
      }

      try {
        const enrichRes = await fetch(`${APOLLO}/people/match`, {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Cache-Control': 'no-cache',
            'X-Api-Key':     apolloKey,
          },
          body: JSON.stringify({ id: person.apollo_id, reveal_personal_emails: false }),
        })

        let email: string | null = null
        let emailStatus          = 'not_found'

        if (enrichRes.ok) {
          const data    = await enrichRes.json()
          const matched = data.person
          email       = matched?.email ?? null
          emailStatus = matched?.email_status ?? (email ? 'valid' : 'not_found')
        }

        let outboundLeadId: string | null = person.outbound_lead_id

        if (email) {
          if (outboundLeadId) {
            await fetch(`${SB_URL}/rest/v1/outbound_leads?id=eq.${outboundLeadId}`, {
              method: 'PATCH', headers: sbHeaders(),
              body: JSON.stringify({ email, email_status: emailStatus }),
            })
          } else {
            outboundLeadId = await promoteToLeads(person, email, emailStatus)
          }
        }

        await fetch(`${SB_URL}/rest/v1/ob_people_dump?id=eq.${person.id}`, {
          method: 'PATCH', headers: sbHeaders(),
          body: JSON.stringify({ email, email_status: emailStatus, email_requested: true, outbound_lead_id: outboundLeadId }),
        })

        results.push({ id: person.id, email, email_status: emailStatus, outbound_lead_id: outboundLeadId })
        await new Promise(r => setTimeout(r, 300))
      } catch {
        results.push({ id: person.id, email: null, email_status: 'error', outbound_lead_id: person.outbound_lead_id })
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
): Promise<string | null> {
  const leadRes = await fetch(`${SB_URL}/rest/v1/outbound_leads`, {
    method:  'POST',
    headers: sbHeaders('return=representation,resolution=ignore-duplicates'),
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
