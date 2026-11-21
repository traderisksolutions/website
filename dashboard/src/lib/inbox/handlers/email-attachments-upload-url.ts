/**
 * POST /api/email/attachments/upload-url { filename, mime_type?, size?, folder? } → { uploadUrl }
 * Opens a resumable upload session in Drive (<folder>/<YYYY-MM>/, default email-uploads) so the
 * browser sends the file straight to Google, past Vercel's ~4.5 MB request limit. The browser PUTs
 * the file to uploadUrl; Google answers with { id }, and the reference is `drivefile:<id>`.
 * Used for every browser upload (src/lib/upload-attachment.ts); folder must be in UPLOAD_FOLDERS.
 */
import { NextRequest, NextResponse } from 'next/server'
import { isUploadFolder, openDriveUpload } from '@/lib/storage/drive-upload'
import { withStaffOrCron } from '@/lib/auth/guard'

export const POST = withStaffOrCron(async (req: NextRequest) => {
  try {
    const { filename, mime_type, size, folder } = await req.json().catch(() => ({})) as { filename?: string; mime_type?: string; size?: number; folder?: string }
    if (folder !== undefined && !isUploadFolder(folder)) return NextResponse.json({ error: `Unknown upload folder: ${folder}` }, { status: 400 })
    const origin = req.headers.get('origin') ?? new URL(req.url).origin
    const uploadUrl = await openDriveUpload({ folder: folder ?? 'email-uploads', filename: filename || 'attachment', mimeType: mime_type, size, origin })
    return NextResponse.json({ uploadUrl })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 502 })
  }
})
