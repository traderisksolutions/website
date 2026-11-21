'use server'
/**
 * Many gateway reads in one server action. The browser runs server actions one at a time, so the
 * Inbox's ten rail reads queued for about 3 s (21 Nov 2026); action-fetch.ts gathers the reads made
 * together and sends them here, where they run at once. GET only; writes keep their own action.
 * Each area's call keeps its own sign-in check and its own route table.
 */
import type { GatewayAnswer } from '@/lib/actions/route-gateway'
import { agentsCall } from './agents/gateway'
import { ebCall } from './eb/gateway'
import { inboxCall } from './engagement/gateway'
import { nexusCall } from './nexus/gateway'
import { placementsCall } from './placements/gateway'
import { renewalsCall } from './renewals/gateway'
import { todayCall } from './today/gateway'
import { workCall } from './work/gateway'

const AREAS: Record<string, (url: string, method: string, body: string | null) => Promise<GatewayAnswer>> = {
  agents: agentsCall, eb: ebCall, inbox: inboxCall, nexus: nexusCall, placements: placementsCall,
  renewals: renewalsCall, today: todayCall, work: workCall,
}

export async function gatewayReads(calls: { area: string; url: string }[]): Promise<GatewayAnswer[]> {
  if (!Array.isArray(calls) || calls.length > 50) return []
  return Promise.all(calls.map(async c => {
    const call = typeof c?.url === 'string' ? AREAS[c.area] : undefined
    if (!call) return { status: 404, body: JSON.stringify({ error: 'Not found' }), type: 'application/json' }
    try { return await call(c.url, 'GET', null) }
    catch (e) { return { status: 500, body: JSON.stringify({ error: e instanceof Error ? e.message : 'Read failed' }), type: 'application/json' } }
  }))
}
