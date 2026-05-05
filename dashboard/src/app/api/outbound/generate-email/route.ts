import { NextRequest, NextResponse } from 'next/server'

const NETROWS = 'https://api.netrows.com/v1'
const SB_URL  = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function netHead() {
  return { Authorization: `Bearer ${process.env.NETROWS_API_KEY}` }
}
function sbHead() {
  const k = process.env.SUPABASE_SERVICE_KEY!
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: 'return=representation,resolution=merge-duplicates' }
}

// POST /api/outbound/generate-email
// Body: { url: string }  — a LinkedIn /in/ person URL
// 1. Find email via Netrows
// 2. If found: fetch profile, save to outbound_leads with email, return result
// 3. If not found: return { found: false } — nothing saved
export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json() as { url: string }
    if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 })

    const key = process.env.NETROWS_API_KEY
    if (!key) return NextResponse.json({ error: 'NETROWS_API_KEY not set' }, { status: 500 })

    // 1. Find email
    const emailRes = await fetch(
      `${NETROWS}/email-finder/by-linkedin?linkedin_url=${encodeURIComponent(url)}`,
      { headers: netHead() as HeadersInit }
    )

    if (emailRes.status === 402) {
      return NextResponse.json({ error: 'Insufficient Netrows credits' }, { status: 402 })
    }

    if (!emailRes.ok) {
      return NextResponse.json({ found: false, name: null })
    }

    const emailData = await emailRes.json()
    const email       = emailData.valid_email ?? emailData.email ?? null
    const emailStatus = emailData.email_status ?? (email ? 'valid' : 'not_found')

    if (!email) {
      // Fetch minimal profile for display (name) without saving
      const profRes = await fetch(
        `${NETROWS}/people/profile-by-url?url=${encodeURIComponent(url)}`,
        { headers: netHead() as HeadersInit }
      ).catch(() => null)
      const profData = profRes?.ok ? await profRes.json() : null
      const name = profData ? `${profData.firstName ?? ''} ${profData.lastName ?? ''}`.trim() || null : null
      return NextResponse.json({ found: false, name })
    }

    // 2. Email found — fetch full profile
    const profRes = await fetch(
      `${NETROWS}/people/profile-by-url?url=${encodeURIComponent(url)}`,
      { headers: netHead() as HeadersInit }
    )
    const profData = profRes.ok ? await profRes.json() : null

    const pos = Array.isArray(profData?.position) ? profData.position[0] : null
    const row: Record<string, unknown> = {
      record_type:     'person',
      source:          'url_lookup',
      linkedin_url:    url,
      username:        profData?.username ?? null,
      first_name:      profData?.firstName ?? null,
      last_name:       profData?.lastName ?? null,
      full_name:       profData ? `${profData.firstName ?? ''} ${profData.lastName ?? ''}`.trim() || null : null,
      headline:        profData?.headline ?? null,
      summary:         profData?.summary ?? null,
      profile_picture: profData?.profilePicture ?? null,
      location:        profData?.geo ? [profData.geo.city, profData.geo.country].filter(Boolean).join(', ') : null,
      current_title:   pos?.title ?? null,
      current_company: pos?.companyName ?? null,
      email,
      email_status:    emailStatus,
      status:          'new',
    }

    // 3. Save to outbound_leads (upsert by linkedin_url)
    const sbRes = await fetch(
      `${SB_URL}/rest/v1/outbound_leads?on_conflict=linkedin_url`,
      { method: 'POST', headers: sbHead(), body: JSON.stringify(row) }
    )
    const saved = sbRes.ok ? await sbRes.json() : null
    const lead  = Array.isArray(saved) ? saved[0] : saved

    return NextResponse.json({
      found:        true,
      email,
      email_status: emailStatus,
      name:         row.full_name,
      headline:     row.headline,
      company:      row.current_company,
      profile_picture: row.profile_picture,
      lead_id:      lead?.id ?? null,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
