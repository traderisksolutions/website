import { NextRequest, NextResponse } from 'next/server'
import { runNexusAnalysisPhase1, recordFailedNexusAnalysis } from '@/lib/run-nexus-analysis'
import { createNexusRun, updateNexusRun } from '@/lib/nexus-run-store'
import { logActivity } from '@/lib/log-activity'
import { requireStaffOrCron } from '@/lib/api-auth'

export const maxDuration = 150

type Params = { params: { id: string } }

// POST /api/nexus/cases/[id]/analyze/phase1
// Body: { triggered_by?, instructions?, thread_ids? }
// Phase 1 of 3: gather every linked thread/attachment/knowledge doc, then Gemini evidence
// synthesis. Creates the run row; phase2/phase3 continue it via run_id.
export async function POST(req: NextRequest, { params }: Params) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized

  const caseId = params.id
  let runId: string | null = null
  let runCreatedAt = Date.now()
  let triggeredBy: string | null = null

  try {
    const body = await req.json().catch(() => ({})) as { triggered_by?: string; instructions?: string; thread_ids?: string[] }
    triggeredBy = body.triggered_by ?? null
    const instructions = body.instructions ?? null
    const threadIds = Array.isArray(body.thread_ids) && body.thread_ids.length > 0 ? body.thread_ids.map(String) : undefined

    const run = await createNexusRun(caseId, triggeredBy, instructions, threadIds)
    runId = run.id
    runCreatedAt = new Date(run.created_at).getTime()

    void logActivity({ action: 'nexus.analysis_run', resource_type: 'case', resource_id: caseId, metadata: { via: triggeredBy ?? 'button', phase: 1, run_id: run.id } })

    const origin = new URL(req.url).origin
    const { state, preview } = await runNexusAnalysisPhase1(caseId, instructions, { origin, threadIds })

    await updateNexusRun(run.id, { status: 'phase1_done', phase1_state: state })
    return NextResponse.json({ ok: true, run_id: run.id, status: 'phase1_done', preview })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[nexus/analyze/phase1] error:', msg)
    if (runId) {
      await updateNexusRun(runId, { status: 'failed', error_message: msg.slice(0, 2000) }).catch(() => {})
      await recordFailedNexusAnalysis(caseId, triggeredBy, Date.now() - runCreatedAt, msg).catch(() => {})
    }
    return NextResponse.json({ error: msg, run_id: runId }, { status: 500 })
  }
}
