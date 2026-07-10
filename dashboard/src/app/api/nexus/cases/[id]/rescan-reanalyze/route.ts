/**
 * POST /api/nexus/cases/[id]/rescan-reanalyze
 * Body: { filename?: string; all_pending?: boolean; instructions?: string }
 *
 * One-step "read this document and repopulate Mission Control": re-extracts the
 * named attachment (or every pending attachment on the case), then re-runs the
 * Nexus analysis so the refreshed text flows through. Backs the consultant chat's
 * confirm-to-act `rescan_reanalyze` action.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { runNexusAnalysis }          from '@/lib/run-nexus-analysis'

export const maxDuration = 300

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbH() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }
}

type Params = { params: { id: string } }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const caseId = params.id
    const { filename, all_pending, instructions } = await req.json() as { filename?: string; all_pending?: boolean; instructions?: string }

    // Linked threads on the case.
    const ctRes = await fetch(`${SB_URL}/rest/v1/case_threads?case_id=eq.${caseId}&select=thread_id`, { headers: sbH(), cache: 'no-store' })
    const tids = ((ctRes.ok ? await ctRes.json() : []) as { thread_id: string }[]).map(t => t.thread_id)
    if (tids.length === 0) return NextResponse.json({ error: 'No linked threads on this case.' }, { status: 400 })

    // Pick the attachments to re-scan: a named one, or all not-yet-parsed.
    const nameFilter = filename ? `&filename=ilike.*${encodeURIComponent(filename.trim())}*` : (all_pending ? `&parsed_at=is.null` : '')
    const aRes = await fetch(`${SB_URL}/rest/v1/email_attachments?thread_id=in.(${tids.join(',')})${nameFilter}&select=id,message_id,thread_id,filename&limit=50`, { headers: sbH(), cache: 'no-store' })
    const atts = (aRes.ok ? await aRes.json() : []) as { id: string; message_id: string; thread_id: string; filename: string }[]

    // Re-extract each (best effort). Needs the gmail_message_id of the source message.
    const origin = new URL(req.url).origin
    let processed = 0
    for (const a of atts) {
      const mRes = await fetch(`${SB_URL}/rest/v1/email_messages?id=eq.${a.message_id}&select=gmail_message_id&limit=1`, { headers: sbH(), cache: 'no-store' })
      const gmid = mRes.ok ? (await mRes.json())[0]?.gmail_message_id : null
      if (!gmid) continue
      const xRes = await fetch(`${origin}/api/nexus/attachments/extract`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.CRON_SECRET ?? '' },
        body: JSON.stringify({ message_id: a.message_id, thread_id: a.thread_id, gmail_message_id: gmid, force: true }),
      }).catch(() => null)
      if (xRes?.ok) processed++
    }

    // Re-run the analysis so Mission Control repopulates from the refreshed text.
    await runNexusAnalysis(caseId, user.email ?? null, instructions ?? 'Re-scanned attachments — incorporate the refreshed document text.', { origin })

    return NextResponse.json({ ok: true, rescanned: processed, attachments: atts.map(a => a.filename) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
