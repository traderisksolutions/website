'use server'
/**
 * Nexus's routes as one server action (21 Nov 2026). The handlers moved unchanged from
 * src/app/api/nexus/* to src/lib/nexus/handlers/; the page calls them through nexusFetch
 * (src/lib/nexus/fetch.ts) with the same paths it used. Only TRS staff get through; each handler
 * still checks the session itself. attachments/extract stays a route: the mail ingest calls it
 * server to server with its own time budget.
 */
import { staffUser } from '@/lib/auth/guard'
import { runRoute, type GatewayAnswer, type RouteTable } from '@/lib/actions/route-gateway'

const TABLE: RouteTable = [
  { pattern: '/api/nexus/cases/[id]/analyze/phase1', load: () => import('@/lib/nexus/handlers/cases-id-analyze-phase1') },
  { pattern: '/api/nexus/cases/[id]/analyze/phase2', load: () => import('@/lib/nexus/handlers/cases-id-analyze-phase2') },
  { pattern: '/api/nexus/cases/[id]/analyze/phase3', load: () => import('@/lib/nexus/handlers/cases-id-analyze-phase3') },
  { pattern: '/api/nexus/cases/[id]/analyze', load: () => import('@/lib/nexus/handlers/cases-id-analyze') },
  { pattern: '/api/nexus/cases/[id]/analyze/run-status', load: () => import('@/lib/nexus/handlers/cases-id-analyze-run-status') },
  { pattern: '/api/nexus/cases/[id]/company', load: () => import('@/lib/nexus/handlers/cases-id-company') },
  { pattern: '/api/nexus/cases/[id]/edit-analysis', load: () => import('@/lib/nexus/handlers/cases-id-edit-analysis') },
  { pattern: '/api/nexus/cases/[id]/rescan-reanalyze', load: () => import('@/lib/nexus/handlers/cases-id-rescan-reanalyze') },
  { pattern: '/api/nexus/cases/[id]/restore-analysis', load: () => import('@/lib/nexus/handlers/cases-id-restore-analysis') },
  { pattern: '/api/nexus/cases/[id]', load: () => import('@/lib/nexus/handlers/cases-id') },
  { pattern: '/api/nexus/cases/[id]/runs/[runId]', load: () => import('@/lib/nexus/handlers/cases-id-runs-runId') },
  { pattern: '/api/nexus/cases/[id]/runs', load: () => import('@/lib/nexus/handlers/cases-id-runs') },
  { pattern: '/api/nexus/cases/[id]/suggest', load: () => import('@/lib/nexus/handlers/cases-id-suggest') },
  { pattern: '/api/nexus/cases/[id]/threads', load: () => import('@/lib/nexus/handlers/cases-id-threads') },
  { pattern: '/api/nexus/cases', load: () => import('@/lib/nexus/handlers/cases') },
  { pattern: '/api/nexus/draft-create', load: () => import('@/lib/nexus/handlers/draft-create') },
  { pattern: '/api/nexus/follow-ups/[id]', load: () => import('@/lib/nexus/handlers/follow-ups-id') },
  { pattern: '/api/nexus/follow-ups/chases', load: () => import('@/lib/nexus/handlers/follow-ups-chases') },
  { pattern: '/api/nexus/follow-ups', load: () => import('@/lib/nexus/handlers/follow-ups') },
  { pattern: '/api/nexus/step-draft', load: () => import('@/lib/nexus/handlers/step-draft') },
]

export async function nexusCall(url: string, method: string, body: string | null): Promise<GatewayAnswer> {
  if (!url.startsWith('/api/nexus/')) return { status: 404, body: JSON.stringify({ error: 'Not found' }), type: 'application/json' }
  if (!(await staffUser())) return { status: 401, body: JSON.stringify({ error: 'Please sign in again.' }), type: 'application/json' }
  return runRoute(TABLE, url, method, body)
}
