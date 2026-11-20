/**
 * POST /api/email/attachments/upload (multipart: file, folder?) → { storage_url: 'drivefile:<id>' }
 * The small-file fallback when the browser cannot PUT to Drive directly. Vercel caps a request
 * at ~4.5 MB, so larger files must go through upload-url. folder defaults to email-uploads.
 */
import { NextRequest, NextResponse } from 'next/server'
import { isUploadFolder, storeUpload } from '@/lib/storage/drive-upload'
import { withStaffOrCron } from '@/lib/auth/guard'

export const maxDuration = 60

export const POST = withStaffOrCron(async (req: NextRequest) => {
  try {
    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    if (!file || typeof file === 'string') return NextResponse.json({ error: 'Choose a file' }, { status: 400 })
    const folder = form?.get('folder') ?? 'email-uploads'
    if (!isUploadFolder(folder)) return NextResponse.json({ error: `Unknown upload folder: ${String(folder)}` }, { status: 400 })
    const ref = await storeUpload(folder, file.name, file.type || 'application/octet-stream', Buffer.from(await file.arrayBuffer()))
    return NextResponse.json({ storage_url: ref })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
})
