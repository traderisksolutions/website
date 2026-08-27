import { NextRequest, NextResponse } from 'next/server'
import { getNexusRun, getLatestIncompleteNexusRun, previewFromPhase1, previewFromPhase2 } from '@/lib/nexus-run-store'
import { requireStaffOrCron } from '@/lib/api-auth'

type Params = { params: { id: string } }

// GET /api/nexus/cases/[id]/analyze/run-status?run_id=X
// Returns the current state of one run (or, if run_id is omitted, the latest run for this
// case that hasn't finished) — used to resume the phased-analysis modal after a page
// reload/reopen, and to poll a phase that's still `_running` server-side even if the
// browser's original request dropped.
export async function GET(req: NextRequest, { params }: Params) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized

  const caseId = params.id
  const runId = req.nextUrl.searchParams.get('run_id')

  try {
    const run = runId ? await getNexusRun(runId) : await getLatestIncompleteNexusRun(caseId)
    if (!run || run.case_id !== caseId) return NextResponse.json({ run: null })

    return NextResponse.json({
      run: {
        id:               run.id,
        status:           run.status,
        error_message:    run.error_message,
        instructions:     run.instructions,
        created_at:       run.created_at,
        updated_at:       run.updated_at,
        case_analysis_id: run.case_analysis_id,
        preview1: run.phase1_state ? previewFromPhase1(run.phase1_state) : null,
        preview2: run.phase2_state ? previewFromPhase2(run.phase2_state) : null,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
