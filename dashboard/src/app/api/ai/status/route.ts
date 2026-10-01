/**
 * GET /api/ai/status → is any AI key out of credit or quota right now?
 *
 * Reads the failures the providers actually returned rather than asking them, because asking
 * costs a call and a key that is out of quota answers the probe the same way it answers real
 * work. error_logs is now the record of that: until today it held zero rows, because logError
 * sent a thread_id the table did not have and PostgREST rejected every insert.
 *
 * The distinction that matters is transient against terminal:
 *
 *   429 RESOURCE_EXHAUSTED  — a rate limit OR a spent quota. One is a blip, the other is not,
 *                             and they are indistinguishable from a single response. So a 429
 *                             only counts once it has happened repeatedly with nothing
 *                             succeeding in between.
 *   402 / 403 billing       — terminal on the first occurrence. Billing does not re-enable
 *                             itself, so waiting for a second one only delays the warning.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { agentOfFeature, AGENTS, type AgentId } from '@/lib/ai-agents'

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
/** How far back a failure still counts as "now". */
const WINDOW_MIN = 60
/** A 429 is only believed to be exhaustion after this many, with no success since. */
const RATE_LIMIT_TOLERANCE = 3

function sbHeaders() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}` }
}

interface ErrRow { source: string; feature: string | null; status_code: number | null; message: string | null; created_at: string }
interface UseRow { feature: string | null; created_at: string }

/** Terminal billing failure, read from the body rather than guessed from the status alone. */
function isBilling(r: ErrRow): boolean {
  if (r.status_code === 402) return true
  const m = (r.message ?? '').toLowerCase()
  return r.status_code === 403 && (m.includes('billing') || m.includes('quota') || m.includes('suspend'))
}

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized

  try {
    const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString()

    const [errRes, useRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/error_logs?source=in.(gemini,anthropic)&created_at=gte.${encodeURIComponent(since)}` +
            `&select=source,feature,status_code,message,created_at&order=created_at.desc&limit=500`,
            { headers: sbHeaders(), cache: 'no-store' }),
      fetch(`${SB_URL}/rest/v1/gemini_usage_log?created_at=gte.${encodeURIComponent(since)}` +
            `&select=feature,created_at&order=created_at.desc&limit=500`,
            { headers: sbHeaders(), cache: 'no-store' }),
    ])
    const errs = errRes.ok ? await errRes.json() as ErrRow[] : []
    const uses = useRes.ok ? await useRes.json() as UseRow[] : []

    // The most recent success per agent. A failure older than it has already been survived.
    const lastOk = new Map<AgentId, string>()
    for (const u of uses) {
      const a = agentOfFeature(u.feature)
      if (!lastOk.has(a)) lastOk.set(a, u.created_at)
    }

    const byAgent = new Map<AgentId, { billing: ErrRow[]; rate: ErrRow[] }>()
    for (const e of errs) {
      if (e.status_code !== 429 && !isBilling(e)) continue
      const agent = agentOfFeature(e.feature)
      const ok = lastOk.get(agent)
      if (ok && ok > e.created_at) continue          // it has worked since; this one is history
      const slot = byAgent.get(agent) ?? { billing: [], rate: [] }
      if (isBilling(e)) slot.billing.push(e)
      else slot.rate.push(e)
      byAgent.set(agent, slot)
    }

    const affected = Array.from(byAgent.entries())
      .map(([agent, v]) => {
        const terminal = v.billing.length > 0
        const exhausted = terminal || v.rate.length >= RATE_LIMIT_TOLERANCE
        if (!exhausted) return null
        const newest = [...v.billing, ...v.rate].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
        const spec = agent === 'unattributed' ? null : AGENTS[agent]
        return {
          agent,
          label: spec?.label ?? 'Unattributed features',
          envKey: spec?.envKey ?? null,
          kind: terminal ? ('billing' as const) : ('quota' as const),
          failures: v.billing.length + v.rate.length,
          since: newest?.created_at ?? null,
          detail: (newest?.message ?? '').slice(0, 200),
        }
      })
      .filter((v): v is NonNullable<typeof v> => v !== null)

    return NextResponse.json({
      windowMinutes: WINDOW_MIN,
      ok: affected.length === 0,
      // Billing is terminal and nothing will work again until somebody acts; a spent quota
      // usually refills. The caller renders those at different severities.
      severity: affected.some(a => a.kind === 'billing') ? 'error' : affected.length ? 'warning' : 'ok',
      affected,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
