/**
 * Single source of truth for Gemini model IDs. All Gemini calls route through these so a
 * model swap is a one-line (or env) change — no hunting through 30 files.
 *
 * Tiers (as of July 2026):
 *   FLASH — gemini-3.6-flash        — drafting, analysis, extraction (quality-sensitive, lower volume)
 *   PRO   — gemini-3.1-pro-preview  — heavy reasoning (quote recommendation / decision)
 *   LITE  — gemini-3.1-flash-lite   — high-volume classification / chase / bulk outbound (cost-sensitive)
 *   EMBED — gemini-embedding-001    — RAG embeddings (can't run on a chat model)
 * Override any tier via env (GEMINI_MODEL_FLASH / _PRO / _LITE / _EMBED) without a redeploy.
 */
export const GEMINI_FLASH = process.env.GEMINI_MODEL_FLASH || 'gemini-3.6-flash'
export const GEMINI_PRO   = process.env.GEMINI_MODEL_PRO   || 'gemini-3.1-pro-preview'
export const GEMINI_LITE  = process.env.GEMINI_MODEL_LITE  || 'gemini-3.1-flash-lite'
export const GEMINI_EMBED = process.env.GEMINI_MODEL_EMBED || 'gemini-embedding-001'

// Default model for usage logging when a call site doesn't specify one.
export const GEMINI_DEFAULT = GEMINI_FLASH

// Build a generateContent (or other method) endpoint for a given model id.
export const geminiUrl = (model: string, method = 'generateContent') =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:${method}`
