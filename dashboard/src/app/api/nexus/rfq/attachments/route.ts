/**
 * GET /api/nexus/rfq/attachments?thread_id=<client_thread_id>
 *
 * Lists the stored attachments on the client's RFQ thread (ingest already saves
 * them to Supabase Storage). Powers the pick-and-forward checklist on each
 * insurer draft. Only rows with a storage_url are forwardable.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbH() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }
}

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized

  try {
    const threadId = new URL(req.url).searchParams.get('thread_id')
    if (!threadId) return NextResponse.json([])

    const res = await fetch(
      `${SB_URL}/rest/v1/email_attachments?thread_id=eq.${threadId}&storage_url=not.is.null&select=id,filename,mime_type,size_bytes,storage_url&order=created_at.asc`,
      { headers: sbH(), cache: 'no-store' }
    )
    const rows = res.ok ? await res.json() : []
    // De-dupe by filename (same doc can appear on multiple messages in the thread).
    const seen = new Set<string>()
    const unique = (Array.isArray(rows) ? rows : []).filter((r: { filename: string }) => {
      if (seen.has(r.filename)) return false
      seen.add(r.filename)
      return true
    })
    return NextResponse.json(unique)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
