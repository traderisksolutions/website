import { NextRequest, NextResponse } from 'next/server'
import { currentUserEmail } from '@/lib/crm/auth'
import { readThread } from '@/lib/mail/thread-read'
import { SB_URL } from '@/lib/sb'
import { withStaffOrCron } from '@/lib/auth/guard'

// DELETE /api/engagement/thread?thread_id=X
// Soft-deletes a thread and all dependent rows by setting deleted_at.
export const DELETE = withStaffOrCron(async (req: NextRequest) => {
  const threadId = new URL(req.url).searchParams.get('thread_id')
  if (!threadId) return NextResponse.json({ error: 'thread_id required' }, { status: 400 })

  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) return NextResponse.json({ error: 'SUPABASE_SERVICE_KEY not set' }, { status: 500 })
  const h = { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }
  const id = encodeURIComponent(threadId)
  const now = new Date().toISOString()

  const steps = [
    `${SB_URL}/rest/v1/thread_summaries?thread_id=eq.${id}`,
    `${SB_URL}/rest/v1/ai_drafts?thread_id=eq.${id}`,
    `${SB_URL}/rest/v1/email_participants?thread_id=eq.${id}`,
    `${SB_URL}/rest/v1/email_messages?thread_id=eq.${id}`,
    `${SB_URL}/rest/v1/email_threads?id=eq.${id}`,
  ]

  for (const url of steps) {
    const res = await fetch(url, { method: 'PATCH', headers: h, body: JSON.stringify({ deleted_at: now }) })
    if (!res.ok && res.status !== 404) {
      const body = await res.text()
      return NextResponse.json({ error: body }, { status: res.status })
    }
  }

  return NextResponse.json({ ok: true })
})


// GET /api/engagement/thread?thread_id=X  (preferred — fetches a specific thread)
// GET /api/engagement/thread?email=X      (fallback — fetches latest thread for an email)
// The reads are in src/lib/mail/thread-read.ts (the Inbox page reads its open thread with it too).
export const GET = withStaffOrCron(async (req: NextRequest) => {
  try {
    const params = new URL(req.url).searchParams
    const read = await readThread(params.get('thread_id'), params.get('email'), await currentUserEmail())
    if (read.private) return NextResponse.json(read.private, { status: 403 })
    return NextResponse.json(read)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
})
