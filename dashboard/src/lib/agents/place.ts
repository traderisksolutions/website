/**
 * The AI Agents place, read on the server (Jarod's approved design, 20 Nov 2026; monitoring only):
 * per agent its flow, key (own, shared or missing: names only, never a value), status, and the
 * last 30 days of the usage log split by day, function and model. No model is called; no writes.
 */
import { db, rows } from '@/lib/db/client'
import { AGENTS, agentKeyStatus, agentOfFeature, type AgentId } from '@/lib/ai-agents'
import { housekeepingOn } from '@/lib/housekeeping-switch'
import { manualMode } from '@/lib/ai-gate'
import { FLOWS, type Flow } from './flows'
import { history, inForce } from './documents'
import { AGENT_KNOWLEDGE, KNOWLEDGE, docKeyOfAgent, docKeyOfKnowledge, type DocVersion, type KnowledgeKey } from './knowledge'

export const SGD_PER_USD = 1.35
const DAYS = 30

type UsageRow = { created_at: string; feature: string | null; model: string | null; input_tokens: number | null; output_tokens: number | null; cost_usd: number | string | null; ok: boolean | null }
export type Tally = { calls: number; failed: number; tokens: number; sgd: number }
export type AgentId8 = Exclude<AgentId, 'unattributed'>
export type AgentSummary = {
  id: AgentId8; name: string; work: string; sources: string[]; model: string
  key: 'own' | 'shared' | 'missing'; keyName: string; status: 'Active' | 'Off'
  last30: Tally; previous: Tally; lastRun: string | null
}
export type AgentDetail = AgentSummary & {
  flow: Flow
  /** Last 14 days, oldest first: calls that answered and calls that failed. */
  days: { day: string; ok: number; failed: number }[]
  functions: { feature: string; model: string; calls: number; failed: number; tokens: number; sgd: number }[]
}
export type Place = { agents: AgentSummary[]; mode: 'manual' | 'auto'; unattributed: Tally; byModel: { model: string; agents: number; tally: Tally }[] }

const blank = (): Tally => ({ calls: 0, failed: 0, tokens: 0, sgd: 0 })
const add = (t: Tally, r: UsageRow) => {
  t.calls++; if (r.ok === false) t.failed++
  t.tokens += (r.input_tokens ?? 0) + (r.output_tokens ?? 0); t.sgd += Number(r.cost_usd ?? 0) * SGD_PER_USD
}

async function usage(days: number): Promise<UsageRow[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const out: UsageRow[] = []
  for (let from = 0; ; from += 1000) {
    const page = await rows('AI usage', db().from('gemini_usage_log').select('created_at,feature,model,input_tokens,output_tokens,cost_usd,ok')
      .gte('created_at', since).order('created_at', { ascending: true }).range(from, from + 999)) as UsageRow[]
    out.push(...page)
    if (page.length < 1000) return out
  }
}

function summary(id: AgentId8, mine: UsageRow[], cut: string): AgentSummary {
  const a = AGENTS[id]
  const last30 = blank(), previous = blank()
  for (const r of mine) add(r.created_at >= cut ? last30 : previous, r)
  return {
    id, name: FLOWS[id].name, work: a.work, sources: FLOWS[id].sources, model: a.model,
    key: agentKeyStatus(id), keyName: a.envKey,
    status: id === 'housekeeping' && !housekeepingOn() ? 'Off' : 'Active',
    last30, previous, lastRun: mine.filter(r => r.created_at >= cut).at(-1)?.created_at ?? null,
  }
}

/** Sixty days read, split into the last 30 and the 30 before, per agent. */
async function split() {
  const all = await usage(DAYS * 2)
  const cut = new Date(Date.now() - DAYS * 86_400_000).toISOString()
  const by = new Map<AgentId, UsageRow[]>()
  for (const r of all) { const id = agentOfFeature(r.feature); by.set(id, [...(by.get(id) ?? []), r]) }
  return { by, cut }
}

export async function loadPlace(): Promise<Place> {
  const { by, cut } = await split()
  const agents = (Object.keys(AGENTS) as AgentId8[]).map(id => summary(id, by.get(id) ?? [], cut))
  const unattributed = blank(); for (const r of by.get('unattributed') ?? []) if (r.created_at >= cut) add(unattributed, r)
  const models = new Map<string, { agents: Set<string>; tally: Tally }>()
  for (const [id, list] of by) for (const r of list) {
    if (r.created_at < cut) continue
    const m = r.model ?? 'Unknown'
    const e = models.get(m) ?? { agents: new Set<string>(), tally: blank() }
    e.agents.add(id); add(e.tally, r); models.set(m, e)
  }
  return {
    agents, mode: manualMode() ? 'manual' : 'auto', unattributed,
    byModel: [...models.entries()].map(([model, e]) => ({ model, agents: e.agents.size, tally: e.tally })).sort((a, b) => b.tally.sgd - a.tally.sgd),
  }
}

export async function loadAgent(id: string): Promise<AgentDetail | null> {
  if (!(id in AGENTS)) return null
  const aid = id as AgentId8
  const { by, cut } = await split()
  const mine = by.get(aid) ?? []
  const today = new Date()
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today.getTime() - (13 - i) * 86_400_000 + 8 * 3600_000).toISOString().slice(0, 10)
    const list = mine.filter(r => new Date(new Date(r.created_at).getTime() + 8 * 3600_000).toISOString().slice(0, 10) === d)
    return { day: d, ok: list.filter(r => r.ok !== false).length, failed: list.filter(r => r.ok === false).length }
  })
  const fns = new Map<string, { feature: string; model: string; calls: number; failed: number; tokens: number; sgd: number }>()
  for (const r of mine.filter(x => x.created_at >= cut)) {
    const k = `${r.feature ?? 'unknown'}|${r.model ?? ''}`
    const e = fns.get(k) ?? { feature: r.feature ?? 'unknown', model: r.model ?? 'Unknown', calls: 0, failed: 0, tokens: 0, sgd: 0 }
    e.calls++; if (r.ok === false) e.failed++; e.tokens += (r.input_tokens ?? 0) + (r.output_tokens ?? 0); e.sgd += Number(r.cost_usd ?? 0) * SGD_PER_USD
    fns.set(k, e)
  }
  return { ...summary(aid, mine, cut), flow: FLOWS[aid], days, functions: [...fns.values()].sort((a, b) => b.calls - a.calls) }
}

// ── Instructions and Knowledge ─────────────────────────────────────────────────────────────────

export type KnowledgeRow = { key: KnowledgeKey; title: string; kind: 'text' | 'drive'; version: number | null; savedAt: string | null; readers: string[]; driveUrl: string | null }

const driveFolder = () => { const id = process.env.GOOGLE_TRS_DRIVE_FOLDER_ID; return id ? `https://drive.google.com/drive/folders/${id}` : null }

export async function loadKnowledge(): Promise<KnowledgeRow[]> {
  const docs = await inForce().catch(() => new Map<string, DocVersion>())
  return KNOWLEDGE.map(k => {
    const d = docs.get(docKeyOfKnowledge(k.key))
    const readers = k.key === 'tone' ? ['Every agent'] : (Object.keys(AGENT_KNOWLEDGE) as AgentId8[]).filter(a => AGENT_KNOWLEDGE[a].includes(k.key)).map(a => FLOWS[a].name)
    return { key: k.key, title: k.title, kind: k.kind, version: d?.version ?? null, savedAt: d?.created_at ?? null, readers, driveUrl: k.kind === 'drive' ? driveFolder() : null }
  })
}

export async function loadAgentDocs(agent: AgentId8): Promise<{ instructions: DocVersion[]; knowledge: KnowledgeRow[] }> {
  const [instructions, knowledge] = await Promise.all([history(docKeyOfAgent(agent)).catch(() => [] as DocVersion[]), loadKnowledge()])
  return { instructions, knowledge: knowledge.filter(k => k.key === 'tone' || AGENT_KNOWLEDGE[agent].includes(k.key)) }
}
