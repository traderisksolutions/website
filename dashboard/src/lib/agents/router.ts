/**
 * Model routing for the AI agents.
 *
 * Flash handles the ordinary case: one thread, one company, draft a reply. Opus is reserved for
 * work that is actually hard — several companies in play, or a deep read across many threads —
 * because it costs roughly thirty times as much per token and most inbox work does not need it.
 *
 * Pure: no I/O, so every routing rule here is unit-testable and the decision is auditable.
 */
import { GEMINI_FLASH, GEMINI_PRO } from '@/lib/gemini-models'

export type Tier = 'flash' | 'pro' | 'opus'

export const OPUS_MODEL = 'claude-opus-5'

export interface RouteInput {
  /** How many distinct companies the question spans. */
  companyCount: number
  /** Threads the agent has been asked to read. */
  threadCount: number
  /** Rough size of the material, in characters. */
  contextChars: number
  /** The operator explicitly asked for the deep read. */
  deepAnalysis?: boolean
  /** Spend already booked this month, in USD. */
  monthSpendUsd?: number
}

export interface RouteDecision {
  tier:    Tier
  model:   string
  reason:  string
  /** False when the budget ceiling forced a downgrade, so the caller can say so. */
  honoured: boolean
}

/** Monthly ceiling for Opus. Past this, deep analysis degrades to Pro rather than failing. */
export const OPUS_MONTHLY_BUDGET_USD = 50

export function routeModel(i: RouteInput): RouteDecision {
  const overBudget = (i.monthSpendUsd ?? 0) >= OPUS_MONTHLY_BUDGET_USD

  // Opus earns its cost on cross-company judgement, or a deliberate deep read.
  const wantsOpus =
    i.companyCount >= 2 ||
    i.deepAnalysis === true ||
    i.threadCount >= 8 ||
    i.contextChars >= 120_000

  if (wantsOpus && overBudget) {
    return {
      tier: 'pro', model: GEMINI_PRO, honoured: false,
      reason: `Opus budget of $${OPUS_MONTHLY_BUDGET_USD} reached this month; using Pro instead`,
    }
  }
  if (wantsOpus) {
    const why =
      i.companyCount >= 2 ? `${i.companyCount} companies in play`
      : i.deepAnalysis    ? 'deep analysis requested'
      : i.threadCount >= 8 ? `${i.threadCount} threads to read`
      : 'large context'
    return { tier: 'opus', model: OPUS_MODEL, honoured: true, reason: why }
  }
  if (i.threadCount >= 3 || i.contextChars >= 40_000) {
    return { tier: 'pro', model: GEMINI_PRO, honoured: true, reason: 'more than one thread of context' }
  }
  return { tier: 'flash', model: GEMINI_FLASH, honoured: true, reason: 'single thread, ordinary reply' }
}
