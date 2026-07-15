/**
 * POST /api/nexus/attachments/re-extract
 * Body: { case_id?, thread_id?, case_name? }   (one of them)
 *
 * Re-runs attachment extraction (force=true) for every message with attachments in the target
 * case/thread. Use it to pick up attachments that earlier extraction missed — e.g. Red Beacon's
 * attached emails (.eml / message-rfc822) that used to be skipped. Idempotent: re-extraction
 * upserts email_attachments on (message_id, filename), so re-running just refreshes parsed_text.
 *
 * Auth: signed-in employee (session) OR x-internal-secret: <CRON_SECRET>.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'

export const maxDuration = 300

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbHeaders() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }
}

// Synthetic ids (e.g. web-form enquiries) can't be re-fetched from Gmail — skip them.
const isRealGmailId = (id: string | null) => !!id && !id.startsWith('inbound_lead_') && !id.includes('@')

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-internal-secret')
    if (secret !== (process.env.CRON_SECRET ?? '__none__')) {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { case_id, thread_id, case_name, all, limit, offset } =
      await req.json().catch(() => ({})) as {
        case_id?: string; thread_id?: string; case_name?: string
        all?: boolean; limit?: number; offset?: number
      }

    // 1. Fetch the batch of messages-with-attachments to re-extract.
    //    all=true → whole system (paginated); otherwise scoped to a case/thread.
    let messages: { id: string; thread_id: string; gmail_message_id: string | null }[] = []
    let threadCount = 0
    const pageLimit  = all ? Math.min(Math.max(Number(limit) || 50, 1), 100) : 200
    const pageOffset = all ? Math.max(Number(offset) || 0, 0) : 0

    if (all) {
      // System-wide backfill — page through every message that has attachments, newest first.
      const msgRes = await fetch(
        `${SB_URL}/rest/v1/email_messages?has_attachments=eq.true&select=id,thread_id,gmail_message_id&order=sent_at.desc&limit=${pageLimit}&offset=${pageOffset}`,
        { headers: sbHeaders(), cache: 'no-store' }
      )
      messages = msgRes.ok ? await msgRes.json() : []
    } else {
      // Resolve target thread ids from thread_id / case_id / case_name.
      let threadIds: string[] = []
      if (thread_id) {
        threadIds = [thread_id]
      } else {
        let resolvedCaseId = case_id ?? null
        if (!resolvedCaseId && case_name?.trim()) {
          const cRes = await fetch(
            `${SB_URL}/rest/v1/cases?name=ilike.*${encodeURIComponent(case_name.trim())}*&select=id&limit=1`,
            { headers: sbHeaders(), cache: 'no-store' }
          )
          resolvedCaseId = (cRes.ok ? await cRes.json() : [])[0]?.id ?? null
        }
        if (!resolvedCaseId) return NextResponse.json({ error: 'Provide all:true, thread_id, case_id, or a matching case_name' }, { status: 400 })
        const ctRes = await fetch(
          `${SB_URL}/rest/v1/case_threads?case_id=eq.${resolvedCaseId}&select=thread_id`,
          { headers: sbHeaders(), cache: 'no-store' }
        )
        threadIds = (ctRes.ok ? await ctRes.json() : []).map((r: { thread_id: string }) => r.thread_id)
      }
      if (threadIds.length === 0) return NextResponse.json({ error: 'No threads for target' }, { status: 404 })
      threadCount = threadIds.length

      const msgRes = await fetch(
        `${SB_URL}/rest/v1/email_messages?thread_id=in.(${threadIds.join(',')})&has_attachments=eq.true&select=id,thread_id,gmail_message_id&limit=200`,
        { headers: sbHeaders(), cache: 'no-store' }
      )
      messages = msgRes.ok ? await msgRes.json() : []
    }

    const targets = messages.filter(m => isRealGmailId(m.gmail_message_id))

    // 3. Re-extract each (force=true) via the extract route.
    const host   = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost:3000'
    const origin = host.startsWith('localhost') ? `http://${host}` : `https://${host}`
    const secretHeader = process.env.CRON_SECRET ?? ''

    const results = await Promise.allSettled(targets.map(m =>
      fetch(`${origin}/api/nexus/attachments/extract`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': secretHeader },
        body:    JSON.stringify({ message_id: m.id, thread_id: m.thread_id, gmail_message_id: m.gmail_message_id, force: true }),
      }).then(r => r.ok)
    ))
    const triggered = results.filter(r => r.status === 'fulfilled' && r.value).length

    return NextResponse.json({
      ok: true,
      scope: all ? 'all' : 'scoped',
      threads: threadCount,
      // For all=true, page through by bumping offset until done=true.
      ...(all ? { offset: pageOffset, next_offset: pageOffset + messages.length, done: messages.length < pageLimit } : {}),
      messages_with_attachments: messages.length,
      re_extracted: triggered,
      skipped_non_gmail: messages.length - targets.length,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
