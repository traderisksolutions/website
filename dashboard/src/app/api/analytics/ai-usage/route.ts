/**
 * GET /api/analytics/ai-usage?days=30
 *
 * AI spend, aggregated on the server.
 *
 * It used to ask for `limit=5000` raw rows and sum them in the browser. PostgREST here runs with
 * PGRST_DB_MAX_ROWS=1000, so that request silently returned 1000 rows and any busy period was
 * under-reported with nothing to show it had been truncated. This pages through in 1000s until a
 * short page comes back, so the total is the total.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { agentOfFeature, type AgentId } from '@/lib/ai-agents'

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const PAGE = 1000

interface Row {
  created_at: string
  feature: string | null
  provider: string | null
  model: string | null
  input_tokens: number | null
  output_tokens: number | null
  cost_usd: number | null
  ok: boolean | null
}

interface Bucket { calls: number; input: number; output: number; cost: number; failures: number }
const blank = (): Bucket => ({ calls: 0, input: 0, output: 0, cost: 0, failures: 0 })

function add(b: Bucket, r: Row) {
  b.calls += 1
  b.input += r.input_tokens ?? 0
  b.output += r.output_tokens ?? 0
  b.cost += Number(r.cost_usd ?? 0)
  if (r.ok === false) b.failures += 1
}

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized

  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) return NextResponse.json({ error: 'SUPABASE_SERVICE_KEY not set' }, { status: 500 })

  try {
    const days = Math.max(1, Math.min(365, Number(req.nextUrl.searchParams.get('days') ?? 30)))
    const since = new Date(Date.now() - days * 86_400_000).toISOString()

    const rows: Row[] = []
    let offset = 0
    let truncated = false
    for (;;) {
      const res = await fetch(
        `${SB_URL}/rest/v1/gemini_usage_log` +
        `?select=created_at,feature,provider,model,input_tokens,output_tokens,cost_usd,ok` +
        `&created_at=gte.${encodeURIComponent(since)}&order=created_at.asc` +
        `&limit=${PAGE}&offset=${offset}`,
        { headers: { apikey: k, Authorization: `Bearer ${k}` }, cache: 'no-store' },
      )
      if (!res.ok) {
        const body = await res.text()
        return NextResponse.json({ error: `ledger read failed: ${body.slice(0, 300)}` }, { status: res.status })
      }
      const page = await res.json() as Row[]
      rows.push(...page)
      if (page.length < PAGE) break
      offset += PAGE
      if (offset > 100_000) { truncated = true; break }   // a stop, not a silent cap
    }

    const byAgent   = new Map<AgentId, Bucket>()
    const byModel   = new Map<string, Bucket>()
    const byFeature = new Map<string, Bucket>()
    const byDay     = new Map<string, Map<AgentId, Bucket>>()
    const total     = blank()

    for (const r of rows) {
      const agent = agentOfFeature(r.feature)
      const model = r.model ?? 'unrecorded'
      const feat  = r.feature ?? 'unrecorded'
      const day   = (r.created_at ?? '').slice(0, 10)

      if (!byAgent.has(agent))   byAgent.set(agent, blank())
      if (!byModel.has(model))   byModel.set(model, blank())
      if (!byFeature.has(feat))  byFeature.set(feat, blank())
      if (!byDay.has(day))       byDay.set(day, new Map())
      const dayMap = byDay.get(day)!
      if (!dayMap.has(agent))    dayMap.set(agent, blank())

      add(byAgent.get(agent)!, r)
      add(byModel.get(model)!, r)
      add(byFeature.get(feat)!, r)
      add(dayMap.get(agent)!, r)
      add(total, r)
    }

    // Oldest row overall, so the page can say when the ledger actually starts rather than
    // implying a quiet month was a cheap one.
    const firstRes = await fetch(
      `${SB_URL}/rest/v1/gemini_usage_log?select=created_at&order=created_at.asc&limit=1`,
      { headers: { apikey: k, Authorization: `Bearer ${k}` }, cache: 'no-store' },
    )
    const firstRows = firstRes.ok ? await firstRes.json() as { created_at: string }[] : []
    const lastRes = await fetch(
      `${SB_URL}/rest/v1/gemini_usage_log?select=created_at&order=created_at.desc&limit=1`,
      { headers: { apikey: k, Authorization: `Bearer ${k}` }, cache: 'no-store' },
    )
    const lastRows = lastRes.ok ? await lastRes.json() as { created_at: string }[] : []

    const obj = <T extends string>(m: Map<T, Bucket>) =>
      Array.from(m.entries()).map(([key, b]) => ({ key, ...b })).sort((a, b) => b.cost - a.cost)

    return NextResponse.json({
      days,
      since,
      total,
      truncated,
      ledgerFirst: firstRows[0]?.created_at ?? null,
      ledgerLast:  lastRows[0]?.created_at ?? null,
      agents:   obj(byAgent),
      models:   obj(byModel),
      features: obj(byFeature),
      daily: Array.from(byDay.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, m]) => {
          const out: Record<string, number | string> = { date }
          let cost = 0
          for (const [agent, b] of Array.from(m.entries())) { out[agent] = b.cost; cost += b.cost }
          out.cost = cost
          return out
        }),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
