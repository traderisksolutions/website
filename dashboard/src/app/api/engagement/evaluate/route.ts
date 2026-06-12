import { NextRequest, NextResponse } from 'next/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbHeaders() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }
}

// GET /api/engagement/evaluate
// Returns recent evaluations + examples + aggregate stats for the /analytics/eval dashboard.
export async function GET(req: NextRequest) {
  try {
    const sp    = new URL(req.url).searchParams
    const limit = Math.min(parseInt(sp.get('limit') ?? '100'), 200)

    const [evalsRes, examplesRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/draft_evaluations?order=created_at.desc&limit=${limit}&select=id,draft_id,thread_id,email_type,score,eval_json,created_at`, { headers: sbHeaders(), cache: 'no-store' }),
      fetch(`${SB_URL}/rest/v1/prompt_examples?order=created_at.desc&limit=50&select=id,email_type,context_summary,ideal_reply,score,created_at`, { headers: sbHeaders(), cache: 'no-store' }),
    ])

    const evaluations: EvalRow[] = evalsRes.ok     ? await evalsRes.json()    : []
    const examples:    ExRow[]   = examplesRes.ok   ? await examplesRes.json() : []

    // Aggregate stats per email type
    const byType: Record<string, { count: number; total: number; scores: number[] }> = {}
    for (const e of Array.isArray(evaluations) ? evaluations : []) {
      const t = e.email_type ?? 'UNKNOWN'
      if (!byType[t]) byType[t] = { count: 0, total: 0, scores: [] }
      byType[t].count++
      byType[t].total += e.score ?? 0
      byType[t].scores.push(e.score ?? 0)
    }
    const stats = Object.entries(byType).map(([type, d]) => ({
      email_type: type,
      count:      d.count,
      avg_score:  d.count ? Math.round((d.total / d.count) * 10) / 10 : 0,
      scores:     d.scores,
    })).sort((a, b) => b.count - a.count)

    return NextResponse.json({ evaluations, examples, stats })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

interface EvalRow {
  id:         string
  draft_id:   string
  thread_id:  string | null
  email_type: string | null
  score:      number
  eval_json:  {
    what_human_changed: string
    why_better:         string
    key_learning:       string
    context_summary:    string
  } | null
  created_at: string
}

interface ExRow {
  id:              string
  email_type:      string
  context_summary: string
  ideal_reply:     string
  score:           number
  created_at:      string
}
