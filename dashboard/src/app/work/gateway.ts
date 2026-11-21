'use server'
/**
 * Cases (work items)'s routes as one server action (21 Nov 2026), as Nexus, Placements and the Inbox did.
 * The handlers moved unchanged from src/app/api to src/lib/work/handlers/; the pages call them through
 * workFetch (src/lib/work/fetch.ts) with the same paths. Only TRS staff get through; each handler still
 * checks the session itself. Uploads, downloads and links stay routes.
 */
import { staffUser } from '@/lib/auth/guard'
import { runRoute, type GatewayAnswer, type RouteTable } from '@/lib/actions/route-gateway'

const TABLE: RouteTable = [
  { pattern: '/api/work/[id]', load: () => import('@/lib/work/handlers/id') },
  { pattern: '/api/work/[id]/brief', load: () => import('@/lib/work/handlers/id-brief') },
  { pattern: '/api/work/[id]/compare', load: () => import('@/lib/work/handlers/id-compare') },
  { pattern: '/api/work/[id]/documents', load: () => import('@/lib/work/handlers/id-documents') },
  { pattern: '/api/work/[id]/edit', load: () => import('@/lib/work/handlers/id-edit') },
  { pattern: '/api/work/[id]/later', load: () => import('@/lib/work/handlers/id-later') },
  { pattern: '/api/work/[id]/memory', load: () => import('@/lib/work/handlers/id-memory') },
  { pattern: '/api/work/[id]/read', load: () => import('@/lib/work/handlers/id-read') },
  { pattern: '/api/work/[id]/rounds', load: () => import('@/lib/work/handlers/id-rounds') },
  { pattern: '/api/work/[id]/sources', load: () => import('@/lib/work/handlers/id-sources') },
]

export async function workCall(url: string, method: string, body: string | null): Promise<GatewayAnswer> {
  if (!url.startsWith('/api/work')) return { status: 404, body: JSON.stringify({ error: 'Not found' }), type: 'application/json' }
  if (!(await staffUser())) return { status: 401, body: JSON.stringify({ error: 'Please sign in again.' }), type: 'application/json' }
  return runRoute(TABLE, url, method, body)
}
