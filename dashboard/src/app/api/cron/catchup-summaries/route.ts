import { NextRequest, NextResponse } from 'next/server'
import { runAutoSummarize }          from '@/lib/run-auto-summarize'

// Runs hourly. Finds inbound threads from the last 48h that have no
// thread_summary and generates one. Catches cases where the inline
// waitUntil in /api/email/ingest was killed before completing.

export const maxDuration = 300

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbHeaders() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
}

export async function GET(req: NextRequest) {
  const bearer = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET ?? ''}`
  const token  = req.nextUrl.searchParams.get('token')
  if (!bearer && token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const since = new Date(Date.now() - 48 * 3_600_000).toISOString()

  // 1. Recent inbound messages — most recent per thread
  const msgsRes = await fetch(
    `${SB_URL}/rest/v1/email_messages?direction=eq.inbound&sent_at=gt.${encodeURIComponent(since)}&select=thread_id,id&order=sent_at.desc&limit=100`,
    { headers: sbHeaders(), cache: 'no-store' }
  )
  if (!msgsRes.ok) {
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
  }
  const msgs: { thread_id: string; id: string }[] = await msgsRes.json()
  if (!Array.isArray(msgs) || msgs.length === 0) {
    return NextResponse.json({ ok: true, skipped: 0, generated: 0 })
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

  // 3. Pending = no summary yet
  const pending = threadIds.filter(id => !done.has(id))
  console.log(`[catchup-summaries] ${pending.length} pending of ${threadIds.length} recent threads`)

  let generated = 0
  let failed    = 0

  for (const threadId of pending) {
    const messageId = threadMap.get(threadId)!
    try {
      await runAutoSummarize(threadId, messageId)
      generated++
      console.log(`[catchup-summaries] ✓ generated for thread ${threadId}`)
    } catch (e) {
      failed++
      console.error(`[catchup-summaries] ✗ failed for ${threadId}:`, e instanceof Error ? e.message : e)
    }
  }

  return NextResponse.json({ ok: true, skipped: done.size, generated, failed })
}
