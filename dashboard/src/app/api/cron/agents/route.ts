/**
 * GET /api/cron/agents — daily (vercel.json "40 2 * * *") and after each mail ingest. Drains the
 * agent_tasks queue for up to 4 minutes. ?agent=intake limits it to one agent.
 * Bearer CRON_SECRET, like the other crons.
 */
import { NextRequest, NextResponse } from 'next/server'
import { drain } from '@/lib/admin'
import { AGENT_NAMES, type AgentName } from '@/lib/agent-tasks/queue'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? ''
  if (!(secret !== '' && req.headers.get('authorization') === `Bearer ${secret}`)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const agent = new URL(req.url).searchParams.get('agent')
    const agents = agent && (AGENT_NAMES as readonly string[]).includes(agent) ? [agent as AgentName] : undefined
    const r = await drain({ agents, budgetMs: 240_000 })
    console.log('[agents]', JSON.stringify(r))
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
