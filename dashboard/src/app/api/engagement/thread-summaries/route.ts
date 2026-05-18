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
