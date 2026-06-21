import { NextRequest, NextResponse } from 'next/server'

// DELETE /api/engagement/thread?thread_id=X
// Soft-deletes a thread and all dependent rows by setting deleted_at.
export async function DELETE(req: NextRequest) {
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
}

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

// GET /api/engagement/thread?thread_id=X  (preferred — fetches a specific thread)
// GET /api/engagement/thread?email=X      (fallback — fetches latest thread for an email)
export async function GET(req: NextRequest) {
  try {
    const params   = new URL(req.url).searchParams
    const threadId = params.get('thread_id')
    const email    = params.get('email')
    if (!threadId && !email) return NextResponse.json({ thread: null, messages: [] })

    let thread = null

    if (threadId) {
      // Direct lookup by thread UUID
      const threadRes = await fetch(
        `${SB_URL}/rest/v1/email_threads?id=eq.${encodeURIComponent(threadId)}&deleted_at=is.null&select=*&limit=1`,
        { headers: sbHeaders() }
      )
      const rows = threadRes.ok ? await threadRes.json() : []
      thread = Array.isArray(rows) && rows.length > 0 ? rows[0] : null
    } else {
      // Email-based lookup: find most recent thread this address appears in
      const partRes = await fetch(
        `${SB_URL}/rest/v1/email_participants?email=eq.${encodeURIComponent(email!)}&select=thread_id`,
        { headers: sbHeaders() }
      )
      const parts: { thread_id: string }[] = partRes.ok ? await partRes.json() : []
      if (!Array.isArray(parts) || parts.length === 0) return NextResponse.json({ thread: null, messages: [] })

      const threadIds = Array.from(new Set(parts.map(p => p.thread_id)))
      const threadRes = await fetch(
        `${SB_URL}/rest/v1/email_threads?id=in.(${threadIds.join(',')})&deleted_at=is.null&order=last_message_at.desc&limit=1&select=*`,
        { headers: sbHeaders() }
      )
      const threads = threadRes.ok ? await threadRes.json() : []
      thread = Array.isArray(threads) && threads.length > 0 ? threads[0] : null
    }

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
