/**
 * POST /api/email/attachments/upload (multipart: file) → { storage_url: 'drivefile:<id>' }
 * The small-file fallback when the browser cannot PUT to Drive directly. Vercel caps a request
 * at ~4.5 MB, so larger files must go through upload-url.
 */
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireStaffOrCron } from '@/lib/api-auth'
import { getDriveWriteToken, findOrCreateFolder, rootFolderId, uploadFileToDrive } from '@/lib/gdrive-write'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    if (!file || typeof file === 'string') return NextResponse.json({ error: 'Choose a file' }, { status: 400 })
    const token = await getDriveWriteToken()
    const uploads = await findOrCreateFolder('email-uploads', rootFolderId(), token)
    const month = await findOrCreateFolder(new Date().toISOString().slice(0, 7), uploads, token)
    const id = await uploadFileToDrive(`${randomUUID().slice(0, 8)} ${file.name}`, file.type || 'application/octet-stream', Buffer.from(await file.arrayBuffer()), month, token)
    return NextResponse.json({ storage_url: `drivefile:${id}` })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
