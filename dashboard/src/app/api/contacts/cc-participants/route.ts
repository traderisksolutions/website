import { NextResponse } from 'next/server'

const SB_URL    = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const TRS_DOMAIN = 'trade-risksol.com'

function sbHeaders() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
}

// GET /api/contacts/cc-participants
// Returns unique external CC'd email addresses with name + company from contacts table
export async function GET() {
  try {
    // 1. All distinct CC participants (external only)
    const epRes = await fetch(
      `${SB_URL}/rest/v1/email_participants?role=eq.cc&select=email,name&order=email.asc`,
      { headers: sbHeaders() }
    )
    const epRows: { email: string; name: string | null }[] = epRes.ok ? await epRes.json() : []

    // Deduplicate by email, filter out internal addresses
    const seen    = new Set<string>()
    const unique: { email: string; name: string | null }[] = []
    for (const r of (Array.isArray(epRows) ? epRows : [])) {
      const lower = r.email?.toLowerCase()
      if (!lower || seen.has(lower) || lower.endsWith(`@${TRS_DOMAIN}`)) continue
      seen.add(lower)
      unique.push(r)
    }

    if (unique.length === 0) return NextResponse.json([])

    // 2. Look up company info from contacts table for any we have records on
    const emailList = unique.map(r => `"${r.email}"`).join(',')
    const cRes = await fetch(
      `${SB_URL}/rest/v1/contacts?email=in.(${emailList})&select=email,first_name,last_name,company`,
      { headers: sbHeaders() }
    )
    const cRows: { email: string; first_name: string | null; last_name: string | null; company: string | null }[] =
      cRes.ok ? await cRes.json() : []
    const contactMap = new Map(
      (Array.isArray(cRows) ? cRows : []).map(c => [c.email.toLowerCase(), c])
    )

    // 3. Merge
    const result = unique.map(r => {
      const c = contactMap.get(r.email.toLowerCase())
      const firstName = c?.first_name ?? (r.name ? r.name.split(' ')[0] : null)
      const lastName  = c?.last_name  ?? (r.name && r.name.includes(' ') ? r.name.split(' ').slice(1).join(' ') : null)
      return {
        id:         `cc-${r.email}`,
        email:      r.email,
        first_name: firstName,
        last_name:  lastName,
        company:    c?.company ?? null,
        status:     'cc',
        source:     'email',
        isCC:       true,
        created_at: new Date().toISOString(),
      }
    })

    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
