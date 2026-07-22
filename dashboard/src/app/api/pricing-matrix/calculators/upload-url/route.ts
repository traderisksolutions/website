/**
 * POST /api/pricing-matrix/calculators/upload-url   { filename, kind: 'xlsx' | 'pdf' }
 * Returns a Supabase Storage signed upload URL so the browser uploads the file DIRECTLY to
 * storage — bypassing Vercel's ~4.5 MB serverless body limit. Used for both the calculator
 * .xlsx and the (optional) brochure .pdf.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, BUCKET, stH, ensureBucket } from '@/lib/pm-storage'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { kind } = await req.json().catch(() => ({})) as { filename?: string; kind?: string }
    const ext = kind === 'pdf' ? 'pdf' : 'xlsx'

    await ensureBucket()

    // NOTE: the sign/upload POST has NO body — do NOT send Content-Type: application/json or the
    // storage server 400s ("Body cannot be empty").
    const path = `pm/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const res  = await fetch(`${SB_URL}/storage/v1/object/upload/sign/${BUCKET}/${path}`, { method: 'POST', headers: stH() })
    if (!res.ok) return NextResponse.json({ error: `Could not create upload URL: ${(await res.text()).slice(0, 200)}` }, { status: 502 })
    const token = new URLSearchParams(((await res.json() as { url?: string }).url ?? '').split('?')[1] ?? '').get('token')
    if (!token) return NextResponse.json({ error: 'No upload token returned' }, { status: 502 })

    return NextResponse.json({ path, token })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
