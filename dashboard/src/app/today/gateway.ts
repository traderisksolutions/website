'use server'
/**
 * Today's routes as one server action (21 Nov 2026), as Nexus, Placements and the Inbox did.
 * The handlers moved unchanged from src/app/api to src/lib/today/handlers/; the pages call them through
 * todayFetch (src/lib/today/fetch.ts) with the same paths. Only TRS staff get through; each handler still
 * checks the session itself. Uploads, downloads and links stay routes.
 */
import { staffUser } from '@/lib/auth/guard'
import { runRoute, type GatewayAnswer, type RouteTable } from '@/lib/actions/route-gateway'

const TABLE: RouteTable = [
  { pattern: '/api/today/[id]', load: () => import('@/lib/today/handlers/id') },
  { pattern: '/api/today/desk', load: () => import('@/lib/today/handlers/desk') },
  { pattern: '/api/today/desk/detail', load: () => import('@/lib/today/handlers/desk-detail') },
  { pattern: '/api/today/desk/facts', load: () => import('@/lib/today/handlers/desk-facts') },
  { pattern: '/api/today/desk/suggest', load: () => import('@/lib/today/handlers/desk-suggest') },
  { pattern: '/api/today/eb-renewals', load: () => import('@/lib/today/handlers/eb-renewals') },
  { pattern: '/api/today/edit-options', load: () => import('@/lib/today/handlers/edit-options') },
  { pattern: '/api/today/knowledge/[companyId]', load: () => import('@/lib/today/handlers/knowledge-companyId') },
  { pattern: '/api/today/thread/[id]', load: () => import('@/lib/today/handlers/thread-id') },
]

export async function todayCall(url: string, method: string, body: string | null): Promise<GatewayAnswer> {
  if (!url.startsWith('/api/today')) return { status: 404, body: JSON.stringify({ error: 'Not found' }), type: 'application/json' }
  if (!(await staffUser())) return { status: 401, body: JSON.stringify({ error: 'Please sign in again.' }), type: 'application/json' }
  return runRoute(TABLE, url, method, body)
}
