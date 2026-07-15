/**
 * POST /api/group-benefits/rate-tables/upload-url  { filename }
 * Returns a Supabase Storage signed upload URL so the browser can upload the PDF DIRECTLY
 * to storage — bypassing Vercel's ~4.5 MB serverless request-body limit (large insurer
 * brochures otherwise fail with a non-JSON "Request Entity Too Large").
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const BUCKET = 'group-benefits'

export async function POST(_req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const k = process.env.SUPABASE_SERVICE_KEY
    if (!k) return NextResponse.json({ error: 'server misconfigured' }, { status: 500 })
    const h = { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }

    await fetch(`${SB_URL}/storage/v1/bucket`, { method: 'POST', headers: h, body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }) }).catch(() => {})

    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`
    const res  = await fetch(`${SB_URL}/storage/v1/object/upload/sign/${BUCKET}/${path}`, { method: 'POST', headers: h })
    if (!res.ok) return NextResponse.json({ error: `Could not create upload URL: ${(await res.text()).slice(0, 200)}` }, { status: 502 })
    const data  = await res.json() as { url?: string }
    const token = new URLSearchParams((data.url ?? '').split('?')[1] ?? '').get('token')
    if (!token) return NextResponse.json({ error: 'No upload token returned' }, { status: 502 })

    return NextResponse.json({ path, token })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
