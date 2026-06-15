import { NextRequest, NextResponse } from 'next/server'

const SB_URL    = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const BUCKET    = 'email-images'
const MAX_BYTES = 5 * 1024 * 1024  // 5 MB
const ALLOWED   = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'])

function storageHeaders(contentType?: string) {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return {
    apikey:         k,
    Authorization:  `Bearer ${k}`,
    ...(contentType ? { 'Content-Type': contentType } : {}),
  }
}

async function ensureBucket() {
  const k = process.env.SUPABASE_SERVICE_KEY!
  await fetch(`${SB_URL}/storage/v1/bucket`, {
    method:  'POST',
    headers: { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ id: BUCKET, name: BUCKET, public: true, file_size_limit: MAX_BYTES }),
  })
}

// POST /api/upload/image
// Accepts multipart/form-data with a single "file" field (image).
// Uploads to Supabase Storage and returns { url: string }.
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file     = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    if (!ALLOWED.has(file.type)) {
      return NextResponse.json({ error: `File type not allowed: ${file.type}` }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `File too large — max 5 MB` }, { status: 400 })
    }

    await ensureBucket()

    const ext      = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const buffer   = await file.arrayBuffer()

    const uploadRes = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${fileName}`, {
      method:  'POST',
      headers: { ...storageHeaders(file.type), 'x-upsert': 'false' },
      body:    buffer,
    })

    if (!uploadRes.ok) {
      const err = await uploadRes.text()
      return NextResponse.json({ error: `Upload failed: ${err.slice(0, 200)}` }, { status: 502 })
    }

    const url = `${SB_URL}/storage/v1/object/public/${BUCKET}/${fileName}`
    return NextResponse.json({ url })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
