import { NextRequest, NextResponse } from 'next/server'
import { waitUntil }                 from '@vercel/functions'

// Runs hourly. Finds inbound threads from the last 7 days that have no
// thread_summary and fires /api/engagement/auto-summarize for each.
// Each auto-summarize call runs as its own serverless function with its
// own 300s budget, so this cron returns quickly after firing them all.

export const maxDuration = 60

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbHeaders() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }
}

export async function GET(req: NextRequest) {
  const bearer = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET ?? ''}`
  const token  = req.nextUrl.searchParams.get('token')
  if (!bearer && token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const since = new Date(Date.now() - 7 * 24 * 3_600_000).toISOString()

  // 1. Recent inbound messages — most recent per thread (last 7 days)
  const msgsRes = await fetch(
    `${SB_URL}/rest/v1/email_messages?direction=eq.inbound&sent_at=gt.${encodeURIComponent(since)}&select=thread_id,id&order=sent_at.desc&limit=200`,
    { headers: sbHeaders(), cache: 'no-store' }
  )
  if (!msgsRes.ok) {
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
  }
  const msgs: { thread_id: string; id: string }[] = await msgsRes.json()
  if (!Array.isArray(msgs) || msgs.length === 0) {
    return NextResponse.json({ ok: true, triggered: 0 })
  }

  // Keep only the most recent message per thread
  const threadMap = new Map<string, string>()
  for (const m of msgs) {
    if (!threadMap.has(m.thread_id)) threadMap.set(m.thread_id, m.id)
  }
  const threadIds = Array.from(threadMap.keys())

  // 2. Find which already have a summary
  const summRes = await fetch(
    `${SB_URL}/rest/v1/thread_summaries?thread_id=in.(${threadIds.join(',')})&select=thread_id`,
    { headers: sbHeaders(), cache: 'no-store' }
  )
  const existing: { thread_id: string }[] = summRes.ok ? await summRes.json() : []
  const done = new Set(Array.isArray(existing) ? existing.map(r => r.thread_id) : [])

  // 3. Pending = no summary yet (cap at 10 per run to avoid overloading)
  const pending = threadIds.filter(id => !done.has(id)).slice(0, 10)
  console.log(`[catchup-summaries] ${pending.length} pending of ${threadIds.length} recent threads (${done.size} already done)`)

  if (pending.length === 0) {
    return NextResponse.json({ ok: true, triggered: 0 })
  }

  // 4. Fire auto-summarize for each via HTTP — each runs as its own function
  //    with an independent 300s budget. Don't await: return immediately after
  //    queuing via waitUntil so this cron finishes fast.
  const origin     = process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  const cronSecret = process.env.CRON_SECRET ?? ''

  waitUntil(
    Promise.allSettled(pending.map(threadId =>
      fetch(`${origin}/api/engagement/auto-summarize`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': cronSecret },
        body:    JSON.stringify({ thread_id: threadId, message_id: threadMap.get(threadId) }),
      })
        .then(r => { if (!r.ok) console.warn(`[catchup] auto-summarize ${r.status} for thread ${threadId}`) })
        .catch(e => console.error(`[catchup] trigger failed for ${threadId}:`, e instanceof Error ? e.message : e))
    ))
  )

  return NextResponse.json({ ok: true, triggered: pending.length, skipped: done.size })
}
