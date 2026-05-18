import { NextRequest, NextResponse } from 'next/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbHeaders() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return {
    apikey:         k,
    Authorization:  `Bearer ${k}`,
    'Content-Type': 'application/json',
  }
}

// GET /api/engagement/thread-summaries?thread_id=X
// Returns all stored AI summaries for a thread, newest first.
export async function GET(req: NextRequest) {
  const threadId = new URL(req.url).searchParams.get('thread_id')
  if (!threadId) return NextResponse.json([])

  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/thread_summaries?thread_id=eq.${encodeURIComponent(threadId)}&order=created_at.desc&select=id,summary,next_action,draft_reply,created_at`,
      { headers: sbHeaders() }
    )
    const rows = res.ok ? await res.json() : []
    return NextResponse.json(Array.isArray(rows) ? rows : [])
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// PATCH /api/engagement/thread-summaries
// Body: { id: string; draft_reply: string }
// Saves an edited draft back to the summary row (auto-save from the draft panel).
export async function PATCH(req: NextRequest) {
  let id: string, draft_reply: string
  try {
    ;({ id, draft_reply } = await req.json())
    if (!id) throw new Error('missing id')
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/thread_summaries?id=eq.${encodeURIComponent(id)}`,
      {
        method:  'PATCH',
        headers: { ...sbHeaders(), Prefer: 'return=minimal' },
        body:    JSON.stringify({ draft_reply }),
      }
    )
    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: text }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
