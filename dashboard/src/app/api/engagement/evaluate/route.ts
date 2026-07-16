import { NextRequest, NextResponse } from 'next/server'
import { runDraftEvaluation }         from '@/lib/run-draft-evaluation'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbHeaders() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }
}

// POST /api/engagement/evaluate
// Body: { draftId?: string }
// Runs evaluation synchronously and returns a full step-by-step trace.
// If draftId is omitted, uses the most recently sent ai_draft.
export async function POST(req: NextRequest) {
  const trace: string[] = []
  const step = (msg: string) => { trace.push(msg); console.log('[eval-debug]', msg) }

  try {
    const body = await req.json().catch(() => ({})) as { draftId?: string }
    const geminiKey = process.env.GEMINI_API_KEY_DRAFT_EMAIL

    step(`ENV: GEMINI_API_KEY_DRAFT_EMAIL ${geminiKey ? `set (${geminiKey.slice(0,6)}...)` : 'MISSING'}`)
    step(`ENV: SUPABASE_SERVICE_KEY ${process.env.SUPABASE_SERVICE_KEY ? 'set' : 'MISSING'}`)

    if (!geminiKey) return NextResponse.json({ ok: false, trace, error: 'GEMINI_API_KEY_DRAFT_EMAIL not set' })

    // 1. Resolve draftId — use provided or find most recent sent draft
    let draftId = body.draftId ?? null
    if (!draftId) {
      const r = await fetch(`${SB_URL}/rest/v1/ai_drafts?status=eq.sent&order=sent_at.desc&limit=1&select=id,body,email_type,thread_id,generated_by,sent_at`, { headers: sbHeaders(), cache: 'no-store' })
      const rows = r.ok ? await r.json() : []
      const row = Array.isArray(rows) ? rows[0] : null
      step(`Draft lookup (most recent sent): status=${r.status} found=${!!row} id=${row?.id ?? 'none'} generated_by=${row?.generated_by} sent_at=${row?.sent_at}`)
      if (!row) return NextResponse.json({ ok: false, trace, error: 'No sent drafts found in ai_drafts' })
      draftId = row.id
    }

    // 2. Load the draft
    const dr = await fetch(`${SB_URL}/rest/v1/ai_drafts?id=eq.${draftId}&select=id,body,email_type,thread_id,generated_by,status,sent_at&limit=1`, { headers: sbHeaders(), cache: 'no-store' })
    const drafts = dr.ok ? await dr.json() : []
    const draft = Array.isArray(drafts) ? drafts[0] : null
    step(`Draft load: status=${dr.status} found=${!!draft} generated_by=${draft?.generated_by} email_type=${draft?.email_type} body_len=${draft?.body?.length ?? 0} draft_status=${draft?.status}`)
    if (!draft?.body) return NextResponse.json({ ok: false, trace, error: 'Draft not found or has no body' })

    const emailType = draft.email_type ?? 'CONVERSATION'
    const threadId  = draft.thread_id ?? null

    // 3. Delegate to the real evaluator — same full-context, two-axis path production uses,
    //    so the debug run and live sends can never diverge.
    step('Delegating to runDraftEvaluation (full thread + AI analysis + attachments, two-axis)…')
    await runDraftEvaluation(draftId!, threadId)

    // 4. Read back the eval it stored for this draft.
    const evRes = await fetch(
      `${SB_URL}/rest/v1/draft_evaluations?draft_id=eq.${draftId}&order=created_at.desc&limit=1&select=score,substance_score,style_score,edit_type,eval_json`,
      { headers: sbHeaders(), cache: 'no-store' }
    )
    const ev = (evRes.ok ? await evRes.json() : [])[0] as
      { score: number; substance_score: number | null; style_score: number | null; edit_type: string | null; eval_json: unknown } | undefined
    step(`Eval stored: substance=${ev?.substance_score ?? '?'} style=${ev?.style_score ?? '?'} edit_type=${ev?.edit_type ?? '?'} (email_type=${emailType})`)
    if (!ev) return NextResponse.json({ ok: false, trace, error: 'No eval row produced — likely no outbound body yet, near-identical to the draft, or a Gemini/DB error. Check server logs.' })

    return NextResponse.json({ ok: true, score: ev.score, substance_score: ev.substance_score, style_score: ev.style_score, edit_type: ev.edit_type, eval_json: ev.eval_json, trace })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    trace.push(`EXCEPTION: ${msg}`)
    return NextResponse.json({ ok: false, trace, error: msg }, { status: 500 })
  }
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
