'use server'
/**
 * AI Agents's routes as one server action (21 Nov 2026), as Nexus, Placements and the Inbox did.
 * The handlers moved unchanged from src/app/api to src/lib/agents/handlers/; the pages call them through
 * agentsFetch (src/lib/agents/fetch.ts) with the same paths. Only TRS staff get through; each handler still
 * checks the session itself. Uploads, downloads and links stay routes.
 */
import { staffUser } from '@/lib/auth/guard'
import { runRoute, type GatewayAnswer, type RouteTable } from '@/lib/actions/route-gateway'

const TABLE: RouteTable = [
  { pattern: '/api/ai/status', load: () => import('@/lib/agents/handlers/ai-status') },
]

export async function agentsCall(url: string, method: string, body: string | null): Promise<GatewayAnswer> {
  if (!url.startsWith('/api/ai')) return { status: 404, body: JSON.stringify({ error: 'Not found' }), type: 'application/json' }
  if (!(await staffUser())) return { status: 401, body: JSON.stringify({ error: 'Please sign in again.' }), type: 'application/json' }
  return runRoute(TABLE, url, method, body)
}
