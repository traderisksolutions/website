/**
 * POST /api/upload/image (multipart: file) → { url }
 * An image for the rich-text email editor. Stored in Drive (email-images/<YYYY-MM>/) and served
 * to recipients, who have no login, by /api/public/email-image/<id>. Max 5 MB.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { storeUpload }               from '@/lib/storage/drive-upload'
import { driveIdOf }                 from '@/lib/storage/attachment-bytes'

const MAX_BYTES = 5 * 1024 * 1024  // 5 MB
// No SVG: it can carry script, and the image is served from the dashboard's own origin.
const ALLOWED   = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

export async function POST(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized

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

    const ref    = await storeUpload('email-images', file.name || 'image', file.type, Buffer.from(await file.arrayBuffer()))
    const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin
    return NextResponse.json({ url: `${origin}/api/public/email-image/${driveIdOf(ref)}` })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
