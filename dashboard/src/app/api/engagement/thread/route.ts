import { NextRequest, NextResponse } from 'next/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbHeaders() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return {
    apikey:        k,
    Authorization: `Bearer ${k}`,
    'Content-Type': 'application/json',
  }
}

// GET /api/engagement/thread?email=X
// Finds the latest email thread for a given email address,
// returns the thread + all messages with their to/cc recipients.
export async function GET(req: NextRequest) {
  try {
    const email = new URL(req.url).searchParams.get('email')
    if (!email) return NextResponse.json({ thread: null, messages: [] })

    // 1. Find thread_ids this email appears in (as any role)
    const partRes = await fetch(
      `${SB_URL}/rest/v1/email_participants?email=eq.${encodeURIComponent(email)}&select=thread_id`,
      { headers: sbHeaders() }
    )
    const parts: { thread_id: string }[] = partRes.ok ? await partRes.json() : []
    if (!Array.isArray(parts) || parts.length === 0) {
      return NextResponse.json({ thread: null, messages: [] })
    }

    const threadIds = [...new Set(parts.map(p => p.thread_id))]

    // 2. Get the most recent thread
    const threadRes = await fetch(
      `${SB_URL}/rest/v1/email_threads?id=in.(${threadIds.join(',')})&order=last_message_at.desc&limit=1&select=*`,
      { headers: sbHeaders() }
    )
    const threads = threadRes.ok ? await threadRes.json() : []
    const thread = Array.isArray(threads) && threads.length > 0 ? threads[0] : null
    if (!thread) return NextResponse.json({ thread: null, messages: [] })

    // 3. Fetch all messages for this thread
    const msgRes = await fetch(
      `${SB_URL}/rest/v1/email_messages?thread_id=eq.${thread.id}&order=sent_at.asc&select=*`,
      { headers: sbHeaders() }
    )
    const rawMsgs = msgRes.ok ? await msgRes.json() : []
    const msgs: Record<string, unknown>[] = Array.isArray(rawMsgs) ? rawMsgs : []

    // 4. Fetch to/cc participants for this thread
    const recipRes = await fetch(
      `${SB_URL}/rest/v1/email_participants?thread_id=eq.${thread.id}&role=in.(to,cc)&select=message_id,email,name,role`,
      { headers: sbHeaders() }
    )
    const recips: { message_id: string; email: string; name: string | null; role: string }[] =
      recipRes.ok ? await recipRes.json() : []

    // 5. Join recipients onto messages
    const recipMap: Record<string, { to: string[]; cc: string[] }> = {}
    for (const r of (Array.isArray(recips) ? recips : [])) {
      if (!recipMap[r.message_id]) recipMap[r.message_id] = { to: [], cc: [] }
      if (r.role === 'to') recipMap[r.message_id].to.push(r.email)
      if (r.role === 'cc') recipMap[r.message_id].cc.push(r.email)
    }

    const messages = msgs.map(m => ({
      id:           m.id,
      direction:    m.direction,
      from_address: m.from_address,
      subject:      m.subject,
      body_text:    m.body_text,
      sent_at:      m.sent_at,
      to:           recipMap[m.id as string]?.to ?? [],
      cc:           recipMap[m.id as string]?.cc ?? [],
    }))

    return NextResponse.json({ thread, messages })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
