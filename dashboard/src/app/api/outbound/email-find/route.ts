import { NextRequest, NextResponse } from 'next/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

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

interface PersonRow {
  id:           string
  linkedin_url: string | null
  username:     string | null
  first_name:   string | null
  last_name:    string | null
  full_name:    string | null
  headline:     string | null
  summary:      string | null
  profile_picture: string | null
  location:     string | null
  company_name: string
}

export async function POST(req: NextRequest) {
  try {
    const { personIds } = await req.json() as { personIds: string[] }
    if (!Array.isArray(personIds) || personIds.length === 0) {
      return NextResponse.json({ error: 'No person IDs provided' }, { status: 400 })
    }

    const key = process.env.NETROWS_API_KEY
    if (!key) return NextResponse.json({ error: 'NETROWS_API_KEY not configured' }, { status: 500 })

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
      if (!person.linkedin_url) {
        results.push({ id: person.id, email: null, email_status: 'no_url', outbound_lead_id: null })
        // Mark as requested so it doesn't show as pending
        await fetch(`${SB_URL}/rest/v1/ob_people_dump?id=eq.${person.id}`, {
          method:  'PATCH',
          headers: sbHeaders(),
          body:    JSON.stringify({ email_requested: true, email_status: 'no_url' }),
        })
        continue
      }

      try {
        const params  = new URLSearchParams({ linkedin_url: person.linkedin_url })
        const emailRes = await fetch(
          `https://api.netrows.com/v1/email-finder/by-linkedin?${params}`,
          { headers: { Authorization: `Bearer ${key}` } }
        )

        if (emailRes.status === 402) {
          return NextResponse.json(
            { error: 'Insufficient Netrows credits. Please top up and try again.', results },
            { status: 402 }
          )
        }

        let email: string | null = null
        let emailStatus          = 'not_found'

        if (emailRes.ok) {
          const data = await emailRes.json()
          email       = data.valid_email ?? data.email ?? null
          emailStatus = data.email_status ?? (email ? 'valid' : 'not_found')
        }

        // Update ob_people_dump
        await fetch(`${SB_URL}/rest/v1/ob_people_dump?id=eq.${person.id}`, {
          method:  'PATCH',
          headers: sbHeaders(),
          body:    JSON.stringify({ email, email_status: emailStatus, email_requested: true }),
        })

        // Promote to outbound_leads if valid email found
        let outboundLeadId: string | null = null
        if (email) {
          const leadRes = await fetch(`${SB_URL}/rest/v1/outbound_leads`, {
            method:  'POST',
            headers: sbHeaders('return=representation,resolution=ignore-duplicates'),
            body:    JSON.stringify({
              record_type:     'person',
              source:          'people_search',
              linkedin_url:    person.linkedin_url,
              username:        person.username,
              first_name:      person.first_name,
              last_name:       person.last_name,
              full_name:       person.full_name,
              headline:        person.headline,
              summary:         person.summary,
              profile_picture: person.profile_picture,
              location:        person.location,
              current_title:   person.headline,
              current_company: person.company_name,
              email,
              email_status:    emailStatus,
              status:          'new',
              search_query:    { source: 'outbound_agent', company: person.company_name },
            }),
          })

          if (leadRes.ok) {
            const body = await leadRes.json().catch(() => null)
            const lead = Array.isArray(body) ? body[0] : body
            outboundLeadId = lead?.id ?? null
          }

          if (outboundLeadId) {
            await fetch(`${SB_URL}/rest/v1/ob_people_dump?id=eq.${person.id}`, {
              method:  'PATCH',
              headers: sbHeaders(),
              body:    JSON.stringify({ outbound_lead_id: outboundLeadId }),
            })
          }
        }

        results.push({ id: person.id, email, email_status: emailStatus, outbound_lead_id: outboundLeadId })
        await new Promise(r => setTimeout(r, 400)) // rate-limit delay
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
