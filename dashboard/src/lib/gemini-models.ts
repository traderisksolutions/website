/**
 * Single source of truth for Gemini model IDs. All Gemini calls route through these so a
 * model swap is a one-line (or env) change — no hunting through 30 files.
 *
 * Tiers (as of October 2026):
 *   LITE  — gemini-3.5-flash-lite  — every small task: classification, triage, thread filing,
 *                                    chase mail, rolling summaries. High volume, cost-sensitive.
 *   FLASH — gemini-3.6-flash       — drafting, extraction (quality-sensitive, lower volume)
 *   PRO   — gemini-3.1-pro-preview — heavy reasoning (quote recommendation / decision)
 *   DEEP  — gemini-3.8-flash       — cross-company and multi-thread analysis. Replaced Opus on
 *                                    this path; the 1M-token window is what the deep read needs
 *                                    and it costs a fraction of a frontier model per token.
 *   EMBED — gemini-embedding-001   — RAG embeddings (can't run on a chat model)
 *
 * Override any tier via env (GEMINI_MODEL_LITE / _FLASH / _PRO / _DEEP / _EMBED) without a
 * redeploy — which is also the rollback if DEEP turns out to under-reason on a hard question.
 */
export const GEMINI_LITE  = process.env.GEMINI_MODEL_LITE  || 'gemini-3.5-flash-lite'
export const GEMINI_FLASH = process.env.GEMINI_MODEL_FLASH || 'gemini-3.6-flash'
export const GEMINI_PRO   = process.env.GEMINI_MODEL_PRO   || 'gemini-3.1-pro-preview'
export const GEMINI_DEEP  = process.env.GEMINI_MODEL_DEEP  || 'gemini-3.8-flash'
export const GEMINI_EMBED = process.env.GEMINI_MODEL_EMBED || 'gemini-embedding-001'

// Default model for usage logging when a call site doesn't specify one.
export const GEMINI_DEFAULT = GEMINI_FLASH

// Build a generateContent (or other method) endpoint for a given model id.
export const geminiUrl = (model: string, method = 'generateContent') =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:${method}`
