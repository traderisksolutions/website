/**
 * POST /api/nexus/cases/[id]/edit-analysis   Body: { ops: EditOp[], summary? }
 *
 * Applies surgical edits to the latest stored analysis JSON (a single next-step,
 * scenario, stakeholder, brief field, etc.) instead of a full re-run. Invoked by
 * the consultant chat's confirm-to-act "edit_analysis" action.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { logActivity }               from '@/lib/log-activity'
import type { EditOp }               from '@/lib/chat/chat-types'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
type Params = { params: { id: string } }

function sbH(prefer = 'return=representation') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

const COLL: Record<string, { field: string; primary: string }> = {
  next_steps:     { field: 'recommended_next_steps', primary: 'action' },
  scenarios:      { field: 'scenario_analysis',      primary: 'name' },
  stakeholders:   { field: 'stakeholder_map',        primary: 'name' },
  missing_items:  { field: 'missing_items',          primary: 'item' },
  timeline:       { field: 'timeline',               primary: 'event' },
  open_questions: { field: 'open_questions',         primary: 'question' },
}

type Rec = Record<string, unknown>

function resolveIndex(arr: unknown[], at: number | undefined, match: string | undefined, primary: string): number {
  if (typeof at === 'number') return Math.max(0, Math.min(arr.length - 1, at - 1))
  if (match) {
    const m = match.toLowerCase()
    return arr.findIndex(x => String((x as Rec)?.[primary] ?? '').toLowerCase().includes(m))
  }
  return -1
}

function applyOp(sa: Rec, op: EditOp): void {
  const brief = (sa.case_brief ??= {} as Rec) as Rec

  if (op.target === 'brief') {
    for (const k of ['summary', 'current_stage', 'claim_amount', 'policy_reference', 'coverage_type', 'incident_date'] as const) {
      if (op.set[k] !== undefined) brief[k] = op.set[k]
    }
    return
  }

  if (op.target === 'blocking_issues') {
    const arr = (brief.blocking_issues = Array.isArray(brief.blocking_issues) ? brief.blocking_issues as string[] : []) as string[]
    if (op.op === 'add' && op.value) arr.push(op.value)
    else if (op.op === 'remove') { const i = resolveIndex(arr, op.at, op.match ?? op.value, ''); if (i >= 0) arr.splice(i, 1) }
    return
  }

  // Quote decision — update a line's recommendation/rationale/caveats by line label or index.
  if (op.target === 'quote_decision') {
    const qd = sa.quote_decision as Rec | undefined
    const lines = qd && Array.isArray(qd.lines) ? qd.lines as Rec[] : []
    if (lines.length === 0) return
    let i = typeof op.at === 'number' ? op.at - 1 : -1
    if (i < 0 && op.line) { const m = String(op.line).toLowerCase(); i = lines.findIndex(l => String(l.product_line_label ?? l.product_line ?? '').toLowerCase().includes(m)) }
    if (i < 0) i = 0
    const line = lines[i] as Rec
    if (op.value?.recommended_insurer !== undefined) line.recommended_insurer = op.value.recommended_insurer
    if (op.value?.rationale !== undefined) line.rationale = op.value.rationale
    if (op.value?.caveats !== undefined) line.caveats = op.value.caveats
    return
  }

  const cfg = COLL[op.target]
  if (!cfg) return
  const arr = (sa[cfg.field] = Array.isArray(sa[cfg.field]) ? sa[cfg.field] as Rec[] : []) as Rec[]

  if (op.op === 'add') {
    const v = { ...(op.value as Rec) }
    if (op.target === 'stakeholders')  { v.id ??= crypto.randomUUID(); v.party_type ??= 'other'; v.role_summary ??= '' }
    if (op.target === 'next_steps')    { v.owner ??= 'TRS'; v.priority ??= 'medium'; v.rationale ??= '' }
    if (op.target === 'scenarios')     { v.probability ??= 'medium'; v.outcome ??= ''; v.trs_action ??= '' }
    if (op.target === 'missing_items') { v.required_from ??= ''; v.urgency ??= 'normal'; v.impact ??= '' }
    if (op.target === 'timeline')      { v.date ??= new Date().toISOString().slice(0, 10); v.party ??= 'trs'; v.significance ??= '' }
    if (op.target === 'open_questions'){ v.priority ??= 'medium' }
    arr.push(v)
  } else {
    const i = resolveIndex(arr, op.at, op.match, cfg.primary)
    if (i < 0) return
    if (op.op === 'remove') arr.splice(i, 1)
    else if (op.op === 'update' && op.value) arr[i] = { ...arr[i], ...(op.value as Rec) }
  }

  // Keep next-step numbering sequential after add/remove.
  if (op.target === 'next_steps') (sa[cfg.field] as Rec[]).forEach((s, idx) => { s.step = idx + 1 })
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { ops, summary } = await req.json() as { ops?: EditOp[]; summary?: string }
    if (!Array.isArray(ops) || ops.length === 0) return NextResponse.json({ error: 'ops required' }, { status: 400 })

    const aRes = await fetch(`${SB_URL}/rest/v1/case_analyses?case_id=eq.${params.id}&order=created_at.desc&limit=1&select=id,structured_analysis`, { headers: sbH(), cache: 'no-store' })
    const row  = aRes.ok ? (await aRes.json())[0] : null
    if (!row?.structured_analysis) return NextResponse.json({ error: 'No analysis to edit yet — run analysis first.' }, { status: 400 })

    const previous = row.structured_analysis                       // snapshot for undo
    const sa = JSON.parse(JSON.stringify(previous)) as Rec
    for (const op of ops) { try { applyOp(sa, op) } catch { /* skip a bad op, keep the rest */ } }

    const uRes = await fetch(`${SB_URL}/rest/v1/case_analyses?id=eq.${row.id}`, {
      method: 'PATCH', headers: sbH('return=minimal'),
      body: JSON.stringify({ structured_analysis: sa }),
    })
    if (!uRes.ok) return NextResponse.json({ error: await uRes.text() }, { status: 500 })

    void logActivity({ action: 'nexus.analysis_edited', resource_type: 'case_analysis', resource_id: row.id, new_value: { case_id: params.id, summary: summary ?? null, ops: ops.length } })
    return NextResponse.json({ ok: true, previous })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
