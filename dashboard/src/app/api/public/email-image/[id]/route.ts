/**
 * GET /api/public/email-image/[id] → the bytes of an image inserted into an outgoing email.
 * Recipients have no login, so the route is open (src/lib/api-gate/policy.ts). It serves only
 * images stored by /api/upload/image: the Drive file must be image/* and sit in
 * email-images/<YYYY-MM>/ under the configured root. Anything else is 404.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getDriveWriteToken, findOrCreateFolder, rootFolderId } from '@/lib/gdrive-write'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'

async function meta(id: string, token: string): Promise<{ mimeType?: string; parents?: string[] } | null> {
  const r = await fetch(`${DRIVE_API}/files/${encodeURIComponent(id)}?fields=mimeType,parents,trashed&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) return null
  const j = await r.json() as { mimeType?: string; parents?: string[]; trashed?: boolean }
  return j.trashed ? null : j
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(id)) return notFound()
  try {
    const token = await getDriveWriteToken()
    const file = await meta(id, token)
    if (!file?.mimeType?.startsWith('image/') || !file.parents?.[0]) return notFound()
    const month = await meta(file.parents[0], token)
    const imagesFolder = await findOrCreateFolder('email-images', rootFolderId(), token)
    if (!month?.parents?.includes(imagesFolder)) return notFound()

    const r = await fetch(`${DRIVE_API}/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } })
    if (!r.ok) return notFound()
    return new NextResponse(new Uint8Array(await r.arrayBuffer()), {
      headers: { 'Content-Type': file.mimeType, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' },
    })
  } catch {
    return NextResponse.json({ error: 'Image unavailable' }, { status: 502 })
  }
}
