/**
 * POST /api/email/attachments/upload-url   { filename }
 * Returns a Supabase Storage signed upload URL so the browser uploads the file DIRECTLY to
 * storage — bypassing Vercel's ~4.5 MB serverless request-body limit (large PDFs/brochures
 * otherwise fail with a non-JSON "Request Entity Too Large"). No size cap here; the only real
 * ceiling is Gmail's ~25 MB per-message limit, enforced at send time by Gmail itself.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { randomUUID }                from 'node:crypto'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const BUCKET = 'email-attachments'

const sanitise = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 150)

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { filename } = await req.json().catch(() => ({})) as { filename?: string }
    const name = sanitise(filename || 'attachment')

    const k = process.env.SUPABASE_SERVICE_KEY
    if (!k) return NextResponse.json({ error: 'server misconfigured' }, { status: 500 })
    const auth = { apikey: k, Authorization: `Bearer ${k}` }

    // Ensure the private bucket exists (this call has a JSON body).
    await fetch(`${SB_URL}/storage/v1/bucket`, {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
    }).catch(() => {})

    // Create the signed upload URL. This POST has NO body, so we must NOT send a JSON
    // Content-Type header (the storage server 400s "Body cannot be empty").
    const path = `outgoing/${randomUUID()}/${name}`
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
