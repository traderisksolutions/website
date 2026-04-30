import { NextRequest, NextResponse } from 'next/server'

const SB_URL  = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const NETROWS = 'https://api.netrows.com/v1'

function sbHeaders() {
  const k = process.env.SUPABASE_SERVICE_KEY!
  return {
    apikey:          k,
    Authorization:   `Bearer ${k}`,
    'Content-Type':  'application/json',
    Prefer:          'return=representation,resolution=merge-duplicates',
  }
}

function netrowsHeaders() {
  return { Authorization: `Bearer ${process.env.NETROWS_API_KEY}` }
}

function extractSlug(url: string): string {
  return url.replace(/\/$/, '').split('/').pop() ?? ''
}

// POST /api/outbound/lookup  { url: string }
export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()
    if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 })

    const isCompany = url.includes('/company/')
    const endpoint  = isCompany
      ? `${NETROWS}/companies/details?username=${extractSlug(url)}`
      : `${NETROWS}/people/profile-by-url?url=${encodeURIComponent(url)}`

    const netRes = await fetch(endpoint, { headers: netrowsHeaders() as HeadersInit })
    if (!netRes.ok) {
      const body = await netRes.text()
      return NextResponse.json({ error: `Netrows ${netRes.status}: ${body}` }, { status: netRes.status })
    }

    const data    = await netRes.json()
    const payload = isCompany ? data.data : data

    let row: Record<string, unknown>

    if (isCompany) {
      row = {
        record_type:         'company',
        source:              'url_lookup',
        linkedin_id:         payload.id ? Number(payload.id) : null,
        linkedin_url:        payload.linkedinUrl ?? url,
        username:            payload.universalName ?? null,
        full_name:           payload.name ?? null,
        headline:            payload.tagline ?? null,
        company_tagline:     payload.tagline ?? null,
        company_description: payload.description ?? null,
        employee_count:      payload.staffCount ?? null,
        headquarters: payload.headquarter
          ? [payload.headquarter.city, payload.headquarter.country].filter(Boolean).join(', ')
          : null,
        logo_url:    payload.logos ?? null,
        website:     payload.website ?? null,
        raw_payload: payload,
      }
    } else {
      const pos = Array.isArray(payload.position) ? payload.position[0] : null
      row = {
        record_type:        'person',
        source:             'url_lookup',
        linkedin_id:        payload.id ?? null,
        linkedin_url:       url,
        username:           payload.username ?? null,
        first_name:         payload.firstName ?? null,
        last_name:          payload.lastName ?? null,
        full_name:          `${payload.firstName ?? ''} ${payload.lastName ?? ''}`.trim() || null,
        headline:           payload.headline ?? null,
        summary:            payload.summary ?? null,
        profile_picture:    payload.profilePicture ?? null,
        location: payload.geo
          ? [payload.geo.city, payload.geo.country].filter(Boolean).join(', ')
          : null,
        country_code:       payload.geo?.countryCode ?? null,
        current_title:      pos?.title ?? null,
        current_company:    pos?.companyName ?? null,
        current_company_id: pos?.companyId ?? null,
        current_company_url: pos?.companyURL ?? null,
        current_industry:   pos?.companyIndustry ?? null,
        raw_payload:        payload,
      }
    }

    const sbRes = await fetch(
      `${SB_URL}/rest/v1/outbound_leads?on_conflict=linkedin_url`,
      { method: 'POST', headers: sbHeaders(), body: JSON.stringify(row) }
    )
    if (!sbRes.ok) {
      const body = await sbRes.text()
      return NextResponse.json({ error: body }, { status: sbRes.status })
    }
    const saved = await sbRes.json()
    return NextResponse.json({ lead: Array.isArray(saved) ? saved[0] : row })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
