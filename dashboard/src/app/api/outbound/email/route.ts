import { NextRequest, NextResponse } from 'next/server'

const NETROWS = 'https://api.netrows.com/v1'
const SB_URL  = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbHeaders() {
  const k = process.env.SUPABASE_SERVICE_KEY!
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }
}

// POST /api/outbound/email
// Body: { linkedin_url: string }
// Returns: { found: boolean; email?: string; email_status: string }
// Updates outbound_leads row (by linkedin_url) if email is found
export async function POST(req: NextRequest) {
  const { linkedin_url } = await req.json()
  if (!linkedin_url) return NextResponse.json({ error: 'linkedin_url required' }, { status: 400 })

  const res = await fetch(
    `${NETROWS}/email-finder/by-linkedin?linkedin_url=${encodeURIComponent(linkedin_url)}`,
    { headers: { Authorization: `Bearer ${process.env.NETROWS_API_KEY}` } }
  )

  if (!res.ok) {
    const body = await res.text()
    return NextResponse.json({ found: false, error: `Netrows ${res.status}: ${body}` })
  }

  const data         = await res.json()
  const email        = data.valid_email ?? data.email ?? null
  const email_status = data.email_status ?? 'unknown'

  if (email && email_status === 'valid') {
    // Patch the lead record if it already exists in Supabase
    await fetch(
      `${SB_URL}/rest/v1/outbound_leads?linkedin_url=eq.${encodeURIComponent(linkedin_url)}`,
      { method: 'PATCH', headers: sbHeaders(), body: JSON.stringify({ email, email_status }) }
    )
    return NextResponse.json({ found: true, email, email_status })
  }

  return NextResponse.json({ found: false, email_status })
}
