import { NextRequest, NextResponse } from 'next/server'
import { runNexusAnalysisPhase2, recordFailedNexusAnalysis } from '@/lib/run-nexus-analysis'
import { getNexusRun, updateNexusRun } from '@/lib/nexus-run-store'

export const maxDuration = 180 // Opus adaptive-thinking call — the slowest single step

type Params = { params: { id: string } }

// POST /api/nexus/cases/[id]/analyze/phase2
// Body: { run_id, instructions? }
// Phase 2 of 3: Claude Opus strategic layer, built from Phase 1's evidence synthesis.
// `instructions` lets the broker add/revise steering after reviewing Phase 1's output —
// if provided it overrides (and is persisted as) the run's instructions for this and any
// later resynthesis.
export async function POST(req: NextRequest, { params }: Params) {
  const caseId = params.id
  const body = await req.json().catch(() => ({})) as { run_id?: string; instructions?: string }
  if (!body.run_id) return NextResponse.json({ error: 'run_id required' }, { status: 400 })

  const run = await getNexusRun(body.run_id).catch(() => null)
  if (!run || run.case_id !== caseId) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  if (!run.phase1_state) return NextResponse.json({ error: `Run is not ready for phase 2 (status=${run.status})` }, { status: 409 })

  try {
    await updateNexusRun(run.id, { status: 'phase2_running' })
    const instructionsOverride = body.instructions !== undefined ? body.instructions : undefined
    const { state, preview } = await runNexusAnalysisPhase2(caseId, run.phase1_state, instructionsOverride)

    await updateNexusRun(run.id, {
      status: 'phase2_done',
      phase2_state: state,
      ...(instructionsOverride !== undefined ? { instructions: instructionsOverride } : {}),
    })
    return NextResponse.json({ ok: true, run_id: run.id, status: 'phase2_done', preview })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[nexus/analyze/phase2] error:', msg)
    await updateNexusRun(run.id, { status: 'failed', error_message: msg.slice(0, 2000) }).catch(() => {})
    await recordFailedNexusAnalysis(caseId, run.triggered_by, Date.now() - new Date(run.created_at).getTime(), msg).catch(() => {})
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
