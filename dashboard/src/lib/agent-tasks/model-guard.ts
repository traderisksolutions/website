/**
 * The credit guard. Before a drain runs the agents that read with the model, one tiny call
 * checks the model answers. When it does not (prepaid credit spent, the daily cap reached, the
 * service down) those agents are held in the queue, untouched, and one alert says why; the
 * rule-based agents run as usual. Held work runs on the first drain after the model answers.
 *
 * Without it, on 4 Nov 2026 the agents ran on an empty Gemini balance and fell back silently:
 * 121 attachments were filed by filename only, their insurer, policy number and premium unread.
 */
import { callGemini } from '@/lib/ai-call'
import { GEMINI_LITE } from '@/lib/gemini-models'
import { logError } from '@/lib/error-log'
import type { AgentName } from './queue'

/** Agents whose work is reading with the model; their fallbacks without it lose information. */
export const MODEL_AGENTS: ReadonlySet<AgentName> = new Set<AgentName>([
  'document_clerk', 'policy_reader', 'knowledge_keeper', 'placement', 'relay', 'endorsement_main', 'eb_movements',
])

export type ModelState = { ok: boolean; reason: string | null; checkedAt: number }
const TTL_MS = 5 * 60_000
const ALERT_EVERY_MS = 60 * 60_000
let state: ModelState | null = null
let alertedAt = 0

/** An empty answer still means the model is reachable and paid for. */
export const answered = (r: { text: string | null; error?: string | null }) => !!r.text || /^The model returned nothing/.test(r.error ?? '')

/** Whether the model answers, checked at most every 5 minutes per server instance. */
export async function modelState(now = Date.now()): Promise<ModelState> {
  if (state && now - state.checkedAt < TTL_MS) return state
  const r = await callGemini({ agent: 'housekeeping', feature: 'credit_probe', model: GEMINI_LITE, parts: [{ text: 'Reply with OK.' }], maxOutputTokens: 8, temperature: 0 })
  state = { ok: answered(r), reason: answered(r) ? null : (r.error ?? 'no answer').slice(0, 300), checkedAt: now }
  return state
}

/** Splits the agents into those to run now and those held for the model. Pure. */
export function splitAgents(agents: AgentName[], modelOk: boolean): { run: AgentName[]; held: AgentName[] } {
  if (modelOk) return { run: agents, held: [] }
  return { run: agents.filter(a => !MODEL_AGENTS.has(a)), held: agents.filter(a => MODEL_AGENTS.has(a)) }
}

/** One alert an hour while agents are held. */
export async function alertHeld(held: AgentName[], reason: string | null, now = Date.now()): Promise<void> {
  if (!held.length || now - alertedAt < ALERT_EVERY_MS) return
  alertedAt = now
  await logError({ source: 'gemini', feature: 'credit_guard', statusCode: 402,
    message: `Model unavailable, ${held.length} agent${held.length === 1 ? "" : "s"} held in the queue until it answers (${held.join(', ')}). Cause: ${reason ?? 'unknown'}. Top up Gemini or raise AI_DAILY_CAP_USD.`,
    metadata: { held } }).catch(() => {})
}

/** Tests only. */
export function resetModelState() { state = null; alertedAt = 0 }
