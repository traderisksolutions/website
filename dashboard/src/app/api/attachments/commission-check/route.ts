/**
 * Broker commission check for a file going to a client (src/lib/commission).
 *
 * POST { storage_url, filename, mime_type? }
 *   → { status, hits, reason?, client_copy: { filename, mime_type, storage_url } | null }
 *   Reads the stored file, finds commission, and when it finds some keeps a client copy with it
 *   blanked in the Shared Drive (email-uploads/client-copies). The original is not changed.
 * GET ?ref=drivefile:<id>&name=<filename>
 *   → the file inline, for Preview of a client copy.
 *
 * A signed-in TRS person only. No model is called. Nothing sends here.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { errorResponse, fail, gate, readBody } from '@/lib/placement/api'
import { attachmentRefBytes, isDriveRef } from '@/lib/storage/attachment-bytes'
import { storeUpload } from '@/lib/storage/drive-upload'
import { checkAttachment, fileKind, XLSX_MIME } from '@/lib/commission/redact'
import { logActivity } from '@/lib/log-activity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const MAX_BYTES = 30 * 1024 * 1024
const COPY_FOLDER = 'email-uploads/client-copies'

export async function POST(req: NextRequest) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  if (actor === 'system') return fail('Sign in first.', 401)
  const b = await readBody<Record<string, unknown>>(req)
  const ref = typeof b?.storage_url === 'string' ? b.storage_url.trim() : ''
  const filename = typeof b?.filename === 'string' ? b.filename.trim().slice(0, 300) : ''
  const mime = typeof b?.mime_type === 'string' ? b.mime_type.slice(0, 200) : null
  if (!ref || !filename) return fail('storage_url and filename are required')
  try {
    const buf = await attachmentRefBytes(ref).catch(() => null)
    if (!buf || !buf.length) return fail(`Could not fetch ${filename}`, 502)
    const result = buf.length > MAX_BYTES
      ? { status: 'not_checked' as const, hits: [], reason: `Over ${MAX_BYTES / 1024 / 1024} MB` }
      : await checkAttachment(new Uint8Array(buf), filename, mime)
    let clientCopy: { filename: string; mime_type: string; storage_url: string } | null = null
    if (result.status === 'blanked' && result.clientCopy) {
      const c = result.clientCopy
      clientCopy = { filename: c.filename, mime_type: c.mimeType, storage_url: await storeUpload(COPY_FOLDER, c.filename, c.mimeType, Buffer.from(c.bytes)) }
    }
    await logActivity({
      action: 'attachment.commission_check', resource_type: 'attachment', resource_id: ref.slice(0, 200),
      new_value: { file: filename, status: result.status, hits: result.hits.length, reason: result.reason ?? null, client_copy: clientCopy?.storage_url ?? null },
    })
    return NextResponse.json({ status: result.status, hits: result.hits, reason: result.reason ?? null, client_copy: clientCopy })
  } catch (e) {
    return errorResponse(e)
  }
}

const TYPES: Record<string, string> = { pdf: 'application/pdf', xlsx: XLSX_MIME, csv: 'text/csv; charset=utf-8' }

export async function GET(req: NextRequest) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  if (actor === 'system') return fail('Sign in first.', 401)
  const sp = req.nextUrl.searchParams
  const ref = sp.get('ref') ?? ''
  const name = (sp.get('name') ?? 'client copy').replace(/[\r\n"\\]/g, '').slice(0, 200)
  if (!isDriveRef(ref)) return fail('Not a stored client copy')
  const buf = await attachmentRefBytes(ref).catch(() => null)
  if (!buf) return fail('File not found', 404)
  const kind = fileKind(name, null, new Uint8Array(buf))
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': TYPES[kind] ?? 'application/octet-stream',
      'Content-Disposition': `${kind === 'pdf' ? 'inline' : 'attachment'}; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'private, no-store',
    },
  })
}
