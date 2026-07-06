/**
 * GET /api/nexus/rfq/insurers?product_line=slug
 *
 * Active insurer contacts covering a product line — used by the engagement RFQ
 * staging UI to pick insurers before any Nexus case exists.
 */
import { NextRequest, NextResponse } from 'next/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbH() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }
}

type Contact = {
  id: string; product_line: string; contact_name: string | null; contact_email: string
  insurers?: { id: string; name: string; status: string } | null
}

export async function GET(req: NextRequest) {
  try {
    const line = new URL(req.url).searchParams.get('product_line')
    if (!line) return NextResponse.json([])

    const res = await fetch(
      `${SB_URL}/rest/v1/insurer_contacts?product_line=eq.${encodeURIComponent(line)}&select=id,product_line,contact_name,contact_email,insurers(id,name,status)`,
      { headers: sbH(), cache: 'no-store' }
    )
    const rows: Contact[] = res.ok ? await res.json() : []
    const out = (Array.isArray(rows) ? rows : [])
      .filter(c => c.insurers?.status !== 'inactive')
      .map(c => ({
        contact_id:    c.id,
        insurer_id:    c.insurers?.id ?? null,
        insurer_name:  c.insurers?.name ?? '(unknown insurer)',
        contact_name:  c.contact_name,
        contact_email: c.contact_email,
      }))
    return NextResponse.json(out)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
