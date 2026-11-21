'use server'
/**
 * Renewals's routes as one server action (21 Nov 2026), as Nexus, Placements and the Inbox did.
 * The handlers moved unchanged from src/app/api to src/lib/renewals/handlers/; the pages call them through
 * renewalsFetch (src/lib/renewals/fetch.ts) with the same paths. Only TRS staff get through; each handler still
 * checks the session itself. Uploads, downloads and links stay routes.
 */
import { staffUser } from '@/lib/auth/guard'
import { runRoute, type GatewayAnswer, type RouteTable } from '@/lib/actions/route-gateway'

const TABLE: RouteTable = [
  { pattern: '/api/renewals', load: () => import('@/lib/renewals/handlers/index') },
  { pattern: '/api/renewals/[id]', load: () => import('@/lib/renewals/handlers/id') },
  { pattern: '/api/renewals/[id]/tasks', load: () => import('@/lib/renewals/handlers/id-tasks') },
  { pattern: '/api/renewals/fix', load: () => import('@/lib/renewals/handlers/fix') },
  { pattern: '/api/renewals/forecast', load: () => import('@/lib/renewals/handlers/forecast') },
  { pattern: '/api/renewals/open', load: () => import('@/lib/renewals/handlers/open') },
  { pattern: '/api/renewals/pipeline', load: () => import('@/lib/renewals/handlers/pipeline') },
  { pattern: '/api/renewals/tasks', load: () => import('@/lib/renewals/handlers/tasks') },
]

export async function renewalsCall(url: string, method: string, body: string | null): Promise<GatewayAnswer> {
  if (!url.startsWith('/api/renewals') && !url.startsWith('/api/renewals')) return { status: 404, body: JSON.stringify({ error: 'Not found' }), type: 'application/json' }
  if (!(await staffUser())) return { status: 401, body: JSON.stringify({ error: 'Please sign in again.' }), type: 'application/json' }
  return runRoute(TABLE, url, method, body)
}
