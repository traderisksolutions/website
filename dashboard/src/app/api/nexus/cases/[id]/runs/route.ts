/**
 * /api/nexus/cases/[id]/runs
 *
 * GET    — lightweight run list (metadata only, no full JSONB)
 * PATCH  — toggle pinned on a single run  { runId, pinned }
 * DELETE — prune unpinned runs beyond ?keep=N (default 15)
 */

import { NextRequest, NextResponse } from 'next/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbHeaders(prefer?: string) {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  const h: Record<string, string> = {
    apikey:        k,
    Authorization: `Bearer ${k}`,
    'Content-Type': 'application/json',
  }
  if (prefer) h['Prefer'] = prefer
  return h
}

type DbRow = {
  id:               string
  created_at:       string
  run_status:       string | null
  run_duration_ms:  number | null
  triggered_by:     string | null
  schema_version:   string | null
  synthesis_model:  string | null
  strategy_model:   string | null
  gemini_tokens:    number | null
  claude_tokens:    number | null
  pinned:           boolean | null
  error_message:    string | null
  structured_analysis: {
    analysis_metadata?: {
      analysis_ts:          string
      synthesis_model:      string
      strategy_model:       string
      synthesis_tokens:     number | null
      strategy_tokens:      number | null
      threads_included:     number
      messages_included:    number
      attachments_included: { filename: string; method: string }[]
      gdrive_docs:          string[]
      truncation_flags:     string[]
    }
    recommended_next_steps?: unknown[]
    citations?:              unknown[]
    missing_items?:          unknown[]
    evidence_ledger?:        unknown[]
  } | null
}

export type RunSummary = {
  id:                  string
  created_at:          string
  run_status:          string
  run_duration_ms:     number | null
  triggered_by:        string | null
  schema_version:      string | null
  synthesis_model:     string | null
  strategy_model:      string | null
  gemini_tokens:       number | null
  claude_tokens:       number | null
  threads_included:    number
  messages_included:   number
  attachments_count:   number
  gdrive_docs_count:   number
  steps_count:         number
  citations_count:     number
  missing_items_count: number
  evidence_count:      number
  truncation_flags:    string[]
  pinned:              boolean
  error_message:       string | null
}

type Params = { params: { id: string } }

// ── GET — run list ────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/case_analyses` +
      `?case_id=eq.${params.id}` +
      `&order=created_at.desc` +
      `&select=id,created_at,run_status,run_duration_ms,triggered_by,schema_version,` +
      `synthesis_model,strategy_model,gemini_tokens,claude_tokens,` +
      `pinned,error_message,structured_analysis`,
      { headers: sbHeaders(), cache: 'no-store' },
    )

    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status })

    const rows: DbRow[] = await res.json()
    if (!Array.isArray(rows)) return NextResponse.json([])

    const summaries: RunSummary[] = rows.map(row => {
      const meta = row.structured_analysis?.analysis_metadata
      const sa   = row.structured_analysis

      return {
        id:                  row.id,
        created_at:          row.created_at,
        run_status:          row.run_status ?? 'completed',
        run_duration_ms:     row.run_duration_ms ?? null,
        triggered_by:        row.triggered_by ?? null,
        schema_version:      row.schema_version ?? null,
        synthesis_model:     meta?.synthesis_model ?? row.synthesis_model ?? null,
        strategy_model:      meta?.strategy_model  ?? row.strategy_model  ?? null,
        gemini_tokens:       meta?.synthesis_tokens ?? row.gemini_tokens   ?? null,
        claude_tokens:       meta?.strategy_tokens  ?? row.claude_tokens   ?? null,
        threads_included:    meta?.threads_included    ?? 0,
        messages_included:   meta?.messages_included   ?? 0,
        attachments_count:   meta?.attachments_included?.length ?? 0,
        gdrive_docs_count:   meta?.gdrive_docs?.length          ?? 0,
        steps_count:         Array.isArray(sa?.recommended_next_steps) ? sa!.recommended_next_steps.length : 0,
        citations_count:     Array.isArray(sa?.citations)               ? sa!.citations.length              : 0,
        missing_items_count: Array.isArray(sa?.missing_items)           ? sa!.missing_items.length          : 0,
        evidence_count:      Array.isArray(sa?.evidence_ledger)         ? sa!.evidence_ledger.length        : 0,
        truncation_flags:    meta?.truncation_flags ?? [],
        pinned:              row.pinned ?? false,
        error_message:       row.error_message ?? null,
      }
    })

    return NextResponse.json(summaries)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// ── PATCH — pin/unpin a run ───────────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { runId, pinned } = await req.json()
    if (!runId) return NextResponse.json({ error: 'runId required' }, { status: 400 })

    const res = await fetch(
      `${SB_URL}/rest/v1/case_analyses?id=eq.${runId}&case_id=eq.${params.id}`,
      {
        method:  'PATCH',
        headers: sbHeaders('return=minimal'),
        body:    JSON.stringify({ pinned: Boolean(pinned) }),
      },
    )
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// ── DELETE — prune unpinned runs beyond keep-last-N ───────────────────────────

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const keep = Math.max(1, parseInt(req.nextUrl.searchParams.get('keep') ?? '15', 10) || 15)

    const listRes = await fetch(
      `${SB_URL}/rest/v1/case_analyses` +
      `?case_id=eq.${params.id}&pinned=eq.false&order=created_at.desc&select=id`,
      { headers: sbHeaders(), cache: 'no-store' },
    )
    if (!listRes.ok) return NextResponse.json({ error: await listRes.text() }, { status: listRes.status })

    const rows: { id: string }[] = await listRes.json()
    const toDelete = Array.isArray(rows) ? rows.slice(keep) : []
    if (toDelete.length === 0) return NextResponse.json({ deleted: 0 })

    const ids = toDelete.map(r => r.id)
    const delRes = await fetch(
      `${SB_URL}/rest/v1/case_analyses?id=in.(${ids.join(',')})&case_id=eq.${params.id}`,
      { method: 'DELETE', headers: sbHeaders('return=minimal') },
    )
    if (!delRes.ok) return NextResponse.json({ error: await delRes.text() }, { status: delRes.status })

    return NextResponse.json({ deleted: toDelete.length })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
