import { NextRequest, NextResponse } from 'next/server'
import { randomUUID }                from 'node:crypto'
import { createClient }              from '@/lib/supabase/server'

// POST /api/email/attachments/upload  (multipart form-data, field: "file")
// Stores a locally-picked file (Excel/PDF/etc.) in the private email-attachments bucket so it
// can be attached to an outgoing reply. Returns { filename, mime_type, storage_url } — the
// storage_url is a bucket-relative path; the send route auth-fetches it at send time.

const SB_URL         = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const STORAGE_BUCKET = 'email-attachments'
const MAX_BYTES      = 25 * 1024 * 1024 // Gmail's attachment ceiling

function storageAuth() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}` }
}

const sanitise = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 150)

export async function POST(req: NextRequest) {
  try {
    // Only signed-in employees can upload.
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'file required' }, { status: 400 })
    if (file.size === 0) return NextResponse.json({ error: 'Empty file' }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File exceeds 25MB limit' }, { status: 413 })

    const buf  = Buffer.from(await file.arrayBuffer())
    const path = `outgoing/${randomUUID()}/${sanitise(file.name || 'attachment')}`
    const mime = file.type || 'application/octet-stream'

    // Best-effort ensure the bucket exists (400 = already there).
    await fetch(`${SB_URL}/storage/v1/bucket`, {
      method: 'POST', headers: { ...storageAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: STORAGE_BUCKET, name: STORAGE_BUCKET, public: false }),
    }).catch(() => {})

    const up = await fetch(`${SB_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
      method: 'POST', headers: { ...storageAuth(), 'Content-Type': mime, 'x-upsert': 'true' },
      body: new Uint8Array(buf),
    })
    if (!up.ok) return NextResponse.json({ error: `Upload failed: ${await up.text()}` }, { status: 502 })

    return NextResponse.json({ filename: file.name || 'attachment', mime_type: mime, storage_url: path, size_bytes: file.size })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
