/**
 * GET /api/email/attachments/for-thread?thread_id=<email_threads.id>
 *
 * The files already stored on a thread, so the composer can re-attach one to a reply without
 * the broker downloading and uploading it again. Only rows with a storage_url can be attached.
 *
 * Lived at /api/nexus/rfq/attachments until the RFQ workflow was retired on 2 Oct 2026. It was
 * never RFQ-specific — the reply composer on every thread uses it — so it moved rather than went.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

function sbH() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}` }
}

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const threadId = new URL(req.url).searchParams.get('thread_id')
    // A thread id goes straight into a PostgREST filter; anything that is not a uuid is refused
    // rather than interpolated.
    if (!threadId || !/^[0-9a-f-]{36}$/i.test(threadId)) return NextResponse.json([])

    const res = await fetch(
      `${SB_URL}/rest/v1/email_attachments?thread_id=eq.${threadId}&storage_url=not.is.null` +
      `&select=id,filename,mime_type,size_bytes,storage_url&order=created_at.asc`,
      { headers: sbH(), cache: 'no-store' })
    const rows = res.ok ? await res.json() as { filename: string }[] : []
    // The same document often arrives on several messages in one thread; offer it once.
    const seen = new Set<string>()
    return NextResponse.json(rows.filter(r => !seen.has(r.filename) && !!seen.add(r.filename)))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
