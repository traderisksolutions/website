/**
 * Single source of truth for Gemini model IDs. All Gemini calls route through these so a
 * model swap is a one-line (or env) change — no hunting through 30 files.
 *
 * As of July 2026 everything runs on gemini-3.5-flash (Google's current GA flagship —
 * "most intelligent" and stable). The gemini-2.5-* models we were on are being deprecated.
 * Override per-tier via env if you later want to split Flash/Pro workloads again.
 */
export const GEMINI_FLASH = process.env.GEMINI_MODEL_FLASH || 'gemini-3.5-flash'
export const GEMINI_PRO   = process.env.GEMINI_MODEL_PRO   || 'gemini-3.5-flash'
export const GEMINI_EMBED = process.env.GEMINI_MODEL_EMBED || 'gemini-embedding-001'

// Default model for usage logging when a call site doesn't specify one.
export const GEMINI_DEFAULT = GEMINI_FLASH

// Build a generateContent (or other method) endpoint for a given model id.
export const geminiUrl = (model: string, method = 'generateContent') =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:${method}`
