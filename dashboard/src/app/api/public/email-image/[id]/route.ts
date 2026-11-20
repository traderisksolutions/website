/**
 * GET /api/public/email-image/[id] → the bytes of an image in an email.
 * Recipients have no login, so the route is open (src/lib/api-gate/policy.ts). Two kinds:
 * - an image inserted into an outgoing email by /api/upload/image: image/* in
 *   email-images/<YYYY-MM>/, served by its unguessable Drive id, as before;
 * - an inline image of a stored email (mail ingest, scripts/move-inline-images.ts): image/* in
 *   email-images/stored/<YYYY-MM>/, served only with `?s=`, an HMAC of the id under AUTH_SECRET
 *   (src/lib/mail/inline-images.ts), so client email images are never served by id alone.
 * Anything else is 404.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getDriveWriteToken, findOrCreateFolder, rootFolderId } from '@/lib/gdrive-write'
import { verifyEmailImageSig } from '@/lib/mail/inline-images'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'

async function meta(id: string, token: string): Promise<{ mimeType?: string; parents?: string[] } | null> {
  const r = await fetch(`${DRIVE_API}/files/${encodeURIComponent(id)}?fields=mimeType,parents,trashed&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) return null
  const j = await r.json() as { mimeType?: string; parents?: string[]; trashed?: boolean }
  return j.trashed ? null : j
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(id)) return notFound()
  const signed = verifyEmailImageSig(id, req.nextUrl.searchParams.get('s'))
  try {
    const token = await getDriveWriteToken()
    const file = await meta(id, token)
    if (!file?.mimeType?.startsWith('image/') || file.mimeType.includes('svg') || !file.parents?.[0]) return notFound()
    const month = await meta(file.parents[0], token)
    if (!month?.parents?.[0]) return notFound()
    const imagesFolder = await findOrCreateFolder('email-images', rootFolderId(), token)
    let ok = month.parents.includes(imagesFolder)
    if (!ok && signed) ok = !!(await meta(month.parents[0], token))?.parents?.includes(imagesFolder)
    if (!ok) return notFound()

    const r = await fetch(`${DRIVE_API}/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } })
    if (!r.ok) return notFound()
    return new NextResponse(new Uint8Array(await r.arrayBuffer()), {
      headers: {
        'Content-Type': file.mimeType,
        // A stored client image stays out of shared caches; its link is the credential.
        'Cache-Control': signed ? 'private, max-age=31536000, immutable' : 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Image unavailable' }, { status: 502 })
  }
}
