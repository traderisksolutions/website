'use server'
/**
 * Placements' routes as one server action (21 Nov 2026). The handlers moved unchanged from
 * src/app/api/placements/* to src/lib/placement/handlers/; pages call them through
 * placementsFetch / callPlacements (src/lib/placement/fetch.ts) with the same paths. Staff only;
 * each handler keeps its own check. Three stay routes: on-send (the mail ingest calls it),
 * endorsements/sweep (scheduled) and lines/[id]/census (a file upload).
 */
import { staffUser } from '@/lib/auth/guard'
import { runRoute, type GatewayAnswer, type RouteTable } from '@/lib/actions/route-gateway'

const TABLE: RouteTable = [
  { pattern: '/api/placements/[id]/client-draft', load: () => import('@/lib/placement/handlers/id-client-draft') },
  { pattern: '/api/placements/[id]/log', load: () => import('@/lib/placement/handlers/id-log') },
  { pattern: '/api/placements/[id]/rounds', load: () => import('@/lib/placement/handlers/id-rounds') },
  { pattern: '/api/placements/[id]', load: () => import('@/lib/placement/handlers/id') },
  { pattern: '/api/placements/auto', load: () => import('@/lib/placement/handlers/auto') },
  { pattern: '/api/placements/confirm/sent', load: () => import('@/lib/placement/handlers/confirm-sent') },
  { pattern: '/api/placements/dispatches/[id]/quote', load: () => import('@/lib/placement/handlers/dispatches-id-quote') },
  { pattern: '/api/placements/dispatches/[id]', load: () => import('@/lib/placement/handlers/dispatches-id') },
  { pattern: '/api/placements/dispatches/sent', load: () => import('@/lib/placement/handlers/dispatches-sent') },
  { pattern: '/api/placements/drafts/[id]/fanout', load: () => import('@/lib/placement/handlers/drafts-id-fanout') },
  { pattern: '/api/placements/line-texts', load: () => import('@/lib/placement/handlers/line-texts') },
  { pattern: '/api/placements/lines/[id]/custom-quote', load: () => import('@/lib/placement/handlers/lines-id-custom-quote') },
  { pattern: '/api/placements/lines/[id]/hr-link', load: () => import('@/lib/placement/handlers/lines-id-hr-link') },
  { pattern: '/api/placements/lines/[id]/price', load: () => import('@/lib/placement/handlers/lines-id-price') },
  { pattern: '/api/placements/lines/[id]/request', load: () => import('@/lib/placement/handlers/lines-id-request') },
  { pattern: '/api/placements/lines/[id]', load: () => import('@/lib/placement/handlers/lines-id') },
  { pattern: '/api/placements/lines/[id]/tier-c', load: () => import('@/lib/placement/handlers/lines-id-tier-c') },
  { pattern: '/api/placements/lines/[id]/tiers', load: () => import('@/lib/placement/handlers/lines-id-tiers') },
  { pattern: '/api/placements/prefill', load: () => import('@/lib/placement/handlers/prefill') },
  { pattern: '/api/placements/propose', load: () => import('@/lib/placement/handlers/propose') },
  { pattern: '/api/placements/quotes/[id]/pick', load: () => import('@/lib/placement/handlers/quotes-id-pick') },
  { pattern: '/api/placements', load: () => import('@/lib/placement/handlers/index') },
  { pattern: '/api/placements/routes', load: () => import('@/lib/placement/handlers/routes') },
  { pattern: '/api/placements/shares/sent', load: () => import('@/lib/placement/handlers/shares-sent') },
]

export async function placementsCall(url: string, method: string, body: string | null): Promise<GatewayAnswer> {
  if (!url.startsWith('/api/placements')) return { status: 404, body: JSON.stringify({ error: 'Not found' }), type: 'application/json' }
  if (!(await staffUser())) return { status: 401, body: JSON.stringify({ error: 'Please sign in again.' }), type: 'application/json' }
  return runRoute(TABLE, url, method, body)
}
