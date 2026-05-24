import { NextRequest, NextResponse } from 'next/server'
import { runRagDraft } from '@/lib/run-rag-draft'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbHeaders(prefer = 'return=representation') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

// POST — generate a RAG draft for a thread on demand
export async function POST(req: NextRequest) {
  try {
    const { thread_id, message_id } = await req.json()
    if (!thread_id) return NextResponse.json({ error: 'thread_id required' }, { status: 400 })

    await runRagDraft(thread_id, message_id ?? null)

    // Return the freshly created draft + sources
    const draftRes = await fetch(
      `${SB_URL}/rest/v1/rag_thread_drafts?thread_id=eq.${thread_id}&order=created_at.desc&limit=1&select=id,content,created_at`,
      { headers: sbHeaders() }
    )
    const drafts = draftRes.ok ? await draftRes.json() : []
    const draft  = Array.isArray(drafts) ? drafts[0] : null
    if (!draft) return NextResponse.json({ error: 'Draft not found after generation' }, { status: 500 })

    const srcRes = await fetch(
      `${SB_URL}/rest/v1/rag_draft_sources?draft_id=eq.${draft.id}&order=similarity.desc`,
      { headers: sbHeaders() }
    )
    const sources = srcRes.ok ? await srcRes.json() : []

    return NextResponse.json({ ...draft, sources: Array.isArray(sources) ? sources : [] })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// GET — fetch latest RAG draft + sources for a thread
export async function GET(req: NextRequest) {
  const thread_id = req.nextUrl.searchParams.get('thread_id')
  if (!thread_id) return NextResponse.json({ error: 'thread_id required' }, { status: 400 })

  try {
    const draftRes = await fetch(
      `${SB_URL}/rest/v1/rag_thread_drafts?thread_id=eq.${thread_id}&order=created_at.desc&limit=1&select=id,content,created_at`,
      { headers: sbHeaders() }
    )
    const drafts = draftRes.ok ? await draftRes.json() : []
    const draft  = Array.isArray(drafts) ? drafts[0] : null
    if (!draft) return NextResponse.json(null)

    const srcRes = await fetch(
      `${SB_URL}/rest/v1/rag_draft_sources?draft_id=eq.${draft.id}&order=similarity.desc`,
      { headers: sbHeaders() }
    )
    const sources = srcRes.ok ? await srcRes.json() : []

    return NextResponse.json({ ...draft, sources: Array.isArray(sources) ? sources : [] })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
