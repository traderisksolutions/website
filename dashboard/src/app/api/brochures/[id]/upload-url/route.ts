/**
 * POST /api/brochures/[id]/upload-url { filename, mime_type?, size? } → { uploadUrl }
 * A resumable upload into the version's Drive folder, so the browser sends the file straight to
 * Google, past Vercel's ~4.5 MB request limit. Google answers the PUT with { id }; the page then
 * records the file with PATCH /api/brochures { id, add_file }.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { sb } from '@/lib/crm/db'
import { fail, gate, isUuid, readBody } from '@/lib/placement/api'
import { openUploadInto } from '@/lib/brochures/drive'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Not a version id')
  const b = await readBody<{ filename?: unknown; mime_type?: unknown; size?: unknown }>(req)
  if (!b || typeof b.filename !== 'string' || !b.filename.trim()) return fail('filename is required')
  try {
    const [v] = await sb<{ drive_folder_id: string | null }[]>(`brochure_versions?id=eq.${id}&select=drive_folder_id`)
    if (!v) return fail('Version not found', 404)
    if (!v.drive_folder_id) return fail('This version has no Drive folder')
    const uploadUrl = await openUploadInto(v.drive_folder_id, {
      filename: b.filename, mimeType: typeof b.mime_type === 'string' ? b.mime_type : undefined,
      size: typeof b.size === 'number' ? b.size : undefined, origin: req.headers.get('origin') ?? new URL(req.url).origin,
    })
    return NextResponse.json({ uploadUrl })
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Server error', 502)
  }
}
