/**
 * GET /api/group-benefits/rate-tables/[id]/pdf
 * Streams the source PDF (from the private storage bucket) to an authenticated employee so
 * the reviewer can check the extracted numbers against the original while reviewing.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const k = process.env.SUPABASE_SERVICE_KEY
    if (!k) return NextResponse.json({ error: 'server misconfigured' }, { status: 500 })
    const h = { apikey: k, Authorization: `Bearer ${k}` }

    const tRes = await fetch(`${SB_URL}/rest/v1/gb_rate_tables?id=eq.${id}&select=source_pdf_url,source_pdf_name&limit=1`, { headers: { ...h, 'Content-Type': 'application/json' }, cache: 'no-store' })
    const t = tRes.ok ? (await tRes.json())[0] : null
    if (!t?.source_pdf_url) return NextResponse.json({ error: 'PDF not found' }, { status: 404 })

    const pdf = await fetch(t.source_pdf_url, { headers: h, cache: 'no-store' })
    if (!pdf.ok) return NextResponse.json({ error: 'Could not read PDF' }, { status: 502 })
    return new NextResponse(pdf.body, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${(t.source_pdf_name ?? 'rates.pdf').replace(/"/g, '')}"`,
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
