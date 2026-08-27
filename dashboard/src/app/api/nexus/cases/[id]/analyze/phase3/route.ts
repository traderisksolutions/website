import { NextRequest, NextResponse } from 'next/server'
import { runNexusAnalysisPhase3, recordFailedNexusAnalysis } from '@/lib/run-nexus-analysis'
import { getNexusRun, updateNexusRun } from '@/lib/nexus-run-store'
import { requireStaffOrCron } from '@/lib/api-auth'

export const maxDuration = 150

type Params = { params: { id: string } }

// POST /api/nexus/cases/[id]/analyze/phase3
// Body: { run_id }
// Phase 3 of 3: Gemini drafts the communication briefs, Opus re-verifies the timeline over
// the raw corpus, post-processing/id-linking, then the final save to case_analyses.
export async function POST(req: NextRequest, { params }: Params) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized

  const caseId = params.id
  const body = await req.json().catch(() => ({})) as { run_id?: string }
  if (!body.run_id) return NextResponse.json({ error: 'run_id required' }, { status: 400 })

  const run = await getNexusRun(body.run_id).catch(() => null)
  if (!run || run.case_id !== caseId) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  if (!run.phase1_state || !run.phase2_state) return NextResponse.json({ error: `Run is not ready for phase 3 (status=${run.status})` }, { status: 409 })

  try {
    await updateNexusRun(run.id, { status: 'phase3_running' })
    const runStartedAtMs = new Date(run.created_at).getTime()
    const { analysis, caseAnalysisId } = await runNexusAnalysisPhase3(caseId, run.phase1_state, run.phase2_state, run.triggered_by, runStartedAtMs)

    await updateNexusRun(run.id, { status: 'completed', case_analysis_id: caseAnalysisId })
    return NextResponse.json({ ok: true, run_id: run.id, status: 'completed', analysis, case_analysis_id: caseAnalysisId })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[nexus/analyze/phase3] error:', msg)
    await updateNexusRun(run.id, { status: 'failed', error_message: msg.slice(0, 2000) }).catch(() => {})
    await recordFailedNexusAnalysis(caseId, run.triggered_by, Date.now() - new Date(run.created_at).getTime(), msg).catch(() => {})
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
