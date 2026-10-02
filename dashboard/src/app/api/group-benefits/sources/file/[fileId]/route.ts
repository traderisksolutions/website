/**
 * GET /api/group-benefits/sources/file/[fileId][?download=1]
 *
 * An insurer brochure or calculator from the Pricing Matrix Drive folder, streamed to a signed-in
 * employee: inline for preview, or as a download. Only files inside that folder are served —
 * the id is checked against the folder's own listing, so this cannot be pointed at anything else
 * the service account can read.
 *
 * Replaces reading the PDF from the old storage bucket, which no longer holds the brochures.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { driveConfigured, listSourceFiles, downloadSourceFile } from '@/lib/gb/drive'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const deny = await requireStaffOrCron(req)
  if (deny) return deny
  if (!driveConfigured()) return NextResponse.json({ error: 'The Drive folder is not configured' }, { status: 503 })
  const { fileId } = await params
  try {
    const file = (await listSourceFiles()).find(f => f.driveFileId === fileId)
    if (!file) return NextResponse.json({ error: 'Not in the Pricing Matrix folder' }, { status: 404 })
    const bytes = await downloadSourceFile(fileId)
    const download = !!req.nextUrl.searchParams.get('download')
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': file.mimeType || 'application/octet-stream',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${file.filename.replace(/"/g, '')}"`,
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not read the file' }, { status: 502 })
  }
}
