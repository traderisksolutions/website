/**
 * GET /api/nexus/rfq/requests?case_id=X
 *
 * Returns the RFQ request lines for a case, each enriched with:
 *   • matching_insurers — insurer contacts whose product_line == the request line
 *   • dispatches        — insurers this line has already been drafted/sent to
 * Powers the Nexus RFQ reply panel (pick insurers → draft → send).
 */
import { NextRequest, NextResponse } from 'next/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbH() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }
}

type Contact = {
  id: string; product_line: string
  contacts?: { first_name: string | null; last_name: string | null; email: string } | null
  insurers?: { id: string; name: string; status: string } | null
}

export async function GET(req: NextRequest) {
  try {
    const caseId = new URL(req.url).searchParams.get('case_id')
    if (!caseId) return NextResponse.json({ error: 'case_id required' }, { status: 400 })

    // 1. Request lines for this case.
    const reqRes = await fetch(
      `${SB_URL}/rest/v1/rfq_requests?case_id=eq.${caseId}&order=created_at.asc&select=*`,
      { headers: sbH(), cache: 'no-store' }
    )
    const requests: { id: string; product_line: string }[] = reqRes.ok ? await reqRes.json() : []
    if (!Array.isArray(requests) || requests.length === 0) return NextResponse.json([])

    const lines = Array.from(new Set(requests.map(r => r.product_line)))

    // 2. Active insurer contacts covering any of those lines (embed insurer name/status).
    const inList  = lines.map(l => `"${l}"`).join(',')
    const contRes = await fetch(
      `${SB_URL}/rest/v1/insurer_contacts?product_line=in.(${inList})&select=id,product_line,contacts(first_name,last_name,email),insurers(id,name,status)`,
      { headers: sbH(), cache: 'no-store' }
    )
    const contacts: Contact[] = contRes.ok ? await contRes.json() : []
    const activeContacts = (Array.isArray(contacts) ? contacts : []).filter(c => c.insurers?.status !== 'inactive' && c.contacts?.email)

    // 3. Existing dispatches for these request lines.
    const reqIds = requests.map(r => r.id)
    const dispRes = await fetch(
      `${SB_URL}/rest/v1/rfq_dispatches?rfq_request_id=in.(${reqIds.join(',')})&select=*`,
      { headers: sbH(), cache: 'no-store' }
    )
    const dispatches: { rfq_request_id: string }[] = dispRes.ok ? await dispRes.json() : []

    // 4. Stitch.
    const enriched = requests.map((r: { id: string; product_line: string }) => ({
      ...r,
      matching_insurers: activeContacts
        .filter(c => c.product_line === r.product_line)
        .map(c => ({
          contact_id:   c.id,
          insurer_id:   c.insurers?.id ?? null,
          insurer_name: c.insurers?.name ?? '(unknown insurer)',
          contact_name: [c.contacts?.first_name, c.contacts?.last_name].filter(Boolean).join(' ') || null,
          contact_email: c.contacts?.email ?? '',
        })),
      dispatches: (Array.isArray(dispatches) ? dispatches : []).filter(d => d.rfq_request_id === r.id),
    }))

    return NextResponse.json(enriched)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
