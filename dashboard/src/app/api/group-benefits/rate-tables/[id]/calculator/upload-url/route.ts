/**
 * POST /api/group-benefits/rate-tables/[id]/calculator/upload-url  { filename }
 * Signed Supabase Storage upload URL for the insurer's .xlsx calculator, so the browser
 * uploads directly to storage (bypasses Vercel's ~4.5 MB body limit). Mirrors the rate-PDF
 * upload-url route.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const BUCKET = 'group-benefits'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const k = process.env.SUPABASE_SERVICE_KEY
    if (!k) return NextResponse.json({ error: 'server misconfigured' }, { status: 500 })
    const auth = { apikey: k, Authorization: `Bearer ${k}` }

    await fetch(`${SB_URL}/storage/v1/bucket`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }) }).catch(() => {})

    // No body on the sign POST -> must NOT set Content-Type: application/json.
    const path = `calculators/${id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.xlsx`
    const res  = await fetch(`${SB_URL}/storage/v1/object/upload/sign/${BUCKET}/${path}`, { method: 'POST', headers: auth })
    if (!res.ok) return NextResponse.json({ error: `Could not create upload URL: ${(await res.text()).slice(0, 200)}` }, { status: 502 })
    const data  = await res.json() as { url?: string }
    const token = new URLSearchParams((data.url ?? '').split('?')[1] ?? '').get('token')
    if (!token) return NextResponse.json({ error: 'No upload token returned' }, { status: 502 })

    return NextResponse.json({ path, token })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
