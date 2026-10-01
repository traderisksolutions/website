/**
 * Model routing for the AI agents.
 *
 * Lite handles small tasks (classification, filing, summaries) and never appears here — those
 * call sites pick GEMINI_LITE directly. This router covers the reading-and-drafting path:
 *
 *   flash — one thread, one company, draft a reply
 *   pro   — several threads of context in one company
 *   deep  — several companies in play, or a deliberate read across a whole company archive
 *
 * The deep tier ran on Opus until 1 Oct 2026 and now runs on gemini-3.8-flash. The reason is
 * cost: the deep path is entered by cross-company questions, which carry the largest contexts,
 * and a frontier model there cost roughly thirty times as much per token. gemini-3.8-flash takes
 * a 1M-token context, which is what a whole-archive read actually needs.
 *
 * Trade-off worth knowing: 3.8-flash is a Flash-tier model, so it reasons less deeply than Opus
 * did on genuinely hard judgement. If a deep answer comes back thin, set GEMINI_MODEL_DEEP to
 * gemini-3.1-pro-preview (no redeploy) and the same path runs on the reasoning tier.
 *
 * Pure: no I/O, so every routing rule here is unit-testable and the decision is auditable.
 */
import { GEMINI_FLASH, GEMINI_PRO, GEMINI_DEEP } from '@/lib/gemini-models'

export type Tier = 'flash' | 'pro' | 'deep'

/** The model the deep tier runs on. Named for the job, not the vendor, so a swap is one line. */
export const DEEP_MODEL = GEMINI_DEEP

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

/**
 * Monthly ceiling for the deep tier. Past this, deep analysis degrades to Pro rather than
 * failing. The ceiling stays even though the deep tier is now Gemini: it is a runaway-loop
 * guard as much as a cost guard, and a cheap model called in a loop still bills.
 */
export const DEEP_MONTHLY_BUDGET_USD = 50

export function routeModel(i: RouteInput): RouteDecision {
  const overBudget = (i.monthSpendUsd ?? 0) >= DEEP_MONTHLY_BUDGET_USD

  // The deep tier earns its context on cross-company judgement, or a deliberate deep read.
  const wantsDeep =
    i.companyCount >= 2 ||
    i.deepAnalysis === true ||
    i.threadCount >= 8 ||
    i.contextChars >= 120_000

  if (wantsDeep && overBudget) {
    return {
      tier: 'pro', model: GEMINI_PRO, honoured: false,
      reason: `Deep-analysis budget of $${DEEP_MONTHLY_BUDGET_USD} reached this month; using Pro instead`,
    }
  }
  if (wantsDeep) {
    const why =
      i.companyCount >= 2 ? `${i.companyCount} companies in play`
      : i.deepAnalysis    ? 'deep analysis requested'
      : i.threadCount >= 8 ? `${i.threadCount} threads to read`
      : 'large context'
    return { tier: 'deep', model: DEEP_MODEL, honoured: true, reason: why }
  }
  if (i.threadCount >= 3 || i.contextChars >= 40_000) {
    return { tier: 'pro', model: GEMINI_PRO, honoured: true, reason: 'more than one thread of context' }
  }
  return { tier: 'flash', model: GEMINI_FLASH, honoured: true, reason: 'single thread, ordinary reply' }
}
