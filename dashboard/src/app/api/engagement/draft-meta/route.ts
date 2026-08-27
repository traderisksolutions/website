import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseDB, EvalStore, ExampleStore } from '@/lib/ai-learning-loop'
import { requireStaffOrCron } from '@/lib/api-auth'

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

export type DraftMeta = {
  emailType:   string | null
  generatedBy: string | null
  draftId:     string | null
  examples:    { id: string; context_summary: string | null; ideal_reply: string; score: number }[]
  watchOuts:   string[]
}

// GET /api/engagement/draft-meta?thread_id=X
// Returns classification + approved examples + watch-outs for the latest draft in a thread.
// Pure read — no AI calls, no mutations.
export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized

  const thread_id = req.nextUrl.searchParams.get('thread_id')
  if (!thread_id) return NextResponse.json({ error: 'thread_id required' }, { status: 400 })

  try {
    // Latest AI draft for this thread (any status, most recent)
    const draftFetch = await fetch(
      `${SB_URL}/rest/v1/ai_drafts?thread_id=eq.${encodeURIComponent(thread_id)}&order=created_at.desc&limit=1&select=id,email_type,generated_by`,
      { headers: sbHeaders(), cache: 'no-store' }
    )
    const drafts = draftFetch.ok ? await draftFetch.json() : []
    const draft      = Array.isArray(drafts) ? drafts[0] : null
    const emailType: string | null    = draft?.email_type  ?? null
    const generatedBy: string | null  = draft?.generated_by ?? null
    const draftId: string | null      = draft?.id           ?? null

    if (!emailType) {
      return NextResponse.json({ emailType: null, generatedBy, draftId, examples: [], watchOuts: [] } satisfies DraftMeta)
    }

    const learningLoopDb = createSupabaseDB()

    // Top 2 approved examples for this email_type
    const examples = (await new ExampleStore(learningLoopDb).topForSurface(emailType, 2))
      .map(ex => ({ id: ex.id, context_summary: ex.contextSummary || null, ideal_reply: ex.idealOutput, score: ex.score }))

    // Key learnings from low-scoring evals for this email_type
    const watchOuts = (await new EvalStore(learningLoopDb).listLearnings(emailType, { maxScore: 3, limit: 8 }))
      .map(r => r.keyLearning)
      .filter(l => l.length > 15)
      .filter((l, i, arr) => arr.indexOf(l) === i)
      .slice(0, 4)

    return NextResponse.json({
      emailType,
      generatedBy,
      draftId,
      examples,
      watchOuts,
    } satisfies DraftMeta)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
