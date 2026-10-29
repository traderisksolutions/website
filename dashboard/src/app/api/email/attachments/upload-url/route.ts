/**
 * POST /api/email/attachments/upload-url { filename, mime_type?, size? } → { uploadUrl }
 * Opens a resumable upload session in Drive (email-uploads/<YYYY-MM>/) so the browser sends the
 * file straight to Google, past Vercel's ~4.5 MB request limit. The browser PUTs the file to
 * uploadUrl; Google answers with { id }, and the attachment reference is `drivefile:<id>`.
 * Replaces the Supabase signed-upload URL: that bucket no longer exists.
 */
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireStaffOrCron } from '@/lib/api-auth'
import { getDriveWriteToken, findOrCreateFolder, rootFolderId } from '@/lib/gdrive-write'

const sanitise = (s: string) => s.replace(/[\\/:*?"<>|#%]+/g, '_').slice(0, 150)

export async function POST(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const { filename, mime_type, size } = await req.json().catch(() => ({})) as { filename?: string; mime_type?: string; size?: number }
    const name = sanitise(filename || 'attachment')
    const type = mime_type || 'application/octet-stream'
    const token = await getDriveWriteToken()
    const uploads = await findOrCreateFolder('email-uploads', rootFolderId(), token)
    const month = await findOrCreateFolder(new Date().toISOString().slice(0, 7), uploads, token)
    const origin = req.headers.get('origin') ?? new URL(req.url).origin
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': type,
        ...(typeof size === 'number' && size > 0 ? { 'X-Upload-Content-Length': String(size) } : {}), Origin: origin,
      },
      body: JSON.stringify({ name: `${randomUUID().slice(0, 8)} ${name}`, parents: [month] }),
    })
    const uploadUrl = res.headers.get('location')
    if (!res.ok || !uploadUrl) return NextResponse.json({ error: `Drive would not open an upload: ${(await res.text()).slice(0, 200)}` }, { status: 502 })
    return NextResponse.json({ uploadUrl })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
