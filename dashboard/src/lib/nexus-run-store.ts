/**
 * Persistence for phased Nexus analysis runs (nexus_analysis_runs table). Each phase route
 * under src/app/api/nexus/cases/[id]/analyze/phase{1,2,3}/ reads/writes through this module
 * instead of hand-rolling Supabase REST calls — see run-nexus-analysis.ts for the engine
 * functions that actually do the AI work.
 */
import type { NexusPhase1State, NexusPhase2State } from '@/lib/run-nexus-analysis'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbH(prefer = 'return=representation') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

export type NexusRunStatus =
  | 'phase1_pending' | 'phase1_running' | 'phase1_done'
  | 'phase2_running' | 'phase2_done'
  | 'phase3_running'
  | 'completed' | 'failed'

export type NexusRunRow = {
  id:               string
  case_id:          string
  status:           NexusRunStatus
  triggered_by:     string | null
  instructions:     string | null
  thread_ids:       string[] | null
  phase1_state:     NexusPhase1State | null
  phase2_state:     NexusPhase2State | null
  error_message:    string | null
  case_analysis_id: string | null
  created_at:       string
  updated_at:       string
}

export async function createNexusRun(
  caseId: string, triggeredBy: string | null, instructions: string | null, threadIds?: string[],
): Promise<NexusRunRow> {
  const res = await fetch(`${SB_URL}/rest/v1/nexus_analysis_runs`, {
    method: 'POST', headers: sbH(),
    body: JSON.stringify({
      case_id: caseId, status: 'phase1_running', triggered_by: triggeredBy,
      instructions, thread_ids: threadIds ?? null,
    }),
  })
  if (!res.ok) throw new Error(`Failed to create nexus run: ${res.status} ${await res.text().catch(() => '')}`)
  const rows = await res.json()
  if (!Array.isArray(rows) || !rows[0]) throw new Error('Failed to create nexus run: empty response')
  return rows[0]
}

export async function getNexusRun(runId: string): Promise<NexusRunRow | null> {
  const res = await fetch(`${SB_URL}/rest/v1/nexus_analysis_runs?id=eq.${runId}&select=*&limit=1`, { headers: sbH() })
  const rows = res.ok ? await res.json() : []
  return Array.isArray(rows) && rows[0] ? rows[0] : null
}

// Latest run for a case that hasn't finished (successfully or not) — used to offer
// "resume analysis" when the page is reopened mid-flow.
export async function getLatestIncompleteNexusRun(caseId: string): Promise<NexusRunRow | null> {
  const res = await fetch(
    `${SB_URL}/rest/v1/nexus_analysis_runs?case_id=eq.${caseId}&status=not.in.(completed,failed)&order=created_at.desc&limit=1&select=*`,
    { headers: sbH() }
  )
  const rows = res.ok ? await res.json() : []
  return Array.isArray(rows) && rows[0] ? rows[0] : null
}

export async function updateNexusRun(
  runId: string,
  patch: Partial<Pick<NexusRunRow, 'status' | 'phase1_state' | 'phase2_state' | 'error_message' | 'case_analysis_id' | 'instructions'>>,
): Promise<void> {
  await fetch(`${SB_URL}/rest/v1/nexus_analysis_runs?id=eq.${runId}`, {
    method: 'PATCH', headers: sbH('return=minimal'),
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  })
}

// Light, client-safe previews — never ship phase1_state.threadSections/attachmentText (the
// raw email/attachment corpus, potentially multi-MB) or phase2's full brief/step text back
// over the wire just to render a modal progress row.
export function previewFromPhase1(state: NexusPhase1State) {
  return {
    stakeholders:   state.synthesis.stakeholder_map?.length ?? 0,
    timelineEvents: state.synthesis.timeline?.length ?? 0,
    openQuestions:  state.synthesis.open_questions?.length ?? 0,
    missingItems:   state.synthesis.missing_items?.length ?? 0,
    caseSummary:    state.synthesis.case_brief?.summary ?? '',
  }
}

export function previewFromPhase2(state: NexusPhase2State) {
  return {
    scenarios:       state.scenarioAnalysis.length,
    nextSteps:       state.recommendedNextSteps.length,
    briefs:          state.communicationBriefs.length,
    reserveEstimate: state.reserveGuidance?.recommended_reserve ?? null,
  }
}
