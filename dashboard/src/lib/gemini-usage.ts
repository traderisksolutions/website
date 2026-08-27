import { GEMINI_DEFAULT } from './gemini-models'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

// Per-model pricing (USD per 1M tokens). Verified against ai.google.dev/gemini-api/docs/pricing
// and Anthropic's pricing page (25 Aug 2026). Three shapes, resolved by resolveRates() below:
//   - flat:   a single { inputPerMillion, outputPerMillion } — most models.
//   - dated:  flat + `next` — a scheduled price change (gemini-3.6-flash's promo rate stepping
//             up to $1.50/$7.50 on 1 Jan 2027). Resolved by comparing against `next.startsAt`.
//   - tiered: `tiers[]`, picked by inputTokens against each tier's `maxInputTokens` (the last
//             tier, with no `maxInputTokens`, is the catch-all above every bound). Used for
//             gemini-3.1-pro-preview, which doubles in price above 200k input tokens.
interface FlatRate  { inputPerMillion: number; outputPerMillion: number }
interface DatedRate extends FlatRate { validUntil: string; next: FlatRate & { startsAt: string } }
interface TieredRate { tiers: Array<FlatRate & { maxInputTokens?: number }> }
type ModelPricing = FlatRate | DatedRate | TieredRate

const PRICING: Record<string, ModelPricing> = {
  'claude-opus-4-8': { inputPerMillion: 5.00, outputPerMillion: 25.00 },

  'gemini-3.6-flash': {
    // Promo rate through 31 Dec 2026 — the DEFAULT model, so this is the rate most usage rows use.
    inputPerMillion: 0.75, outputPerMillion: 3.75, validUntil: '2026-12-31',
    next: { inputPerMillion: 1.50, outputPerMillion: 7.50, startsAt: '2027-01-01' },
  },

  'gemini-3.1-pro-preview': {
    tiers: [
      { maxInputTokens: 200_000, inputPerMillion: 2.00, outputPerMillion: 12.00 },
      { inputPerMillion: 4.00, outputPerMillion: 18.00 },
    ],
  },

  'gemini-3.1-flash-lite': { inputPerMillion: 0.25, outputPerMillion: 1.50 },

  // Retired — kept so historical log rows still price correctly.
  'gemini-3.5-flash': { inputPerMillion: 1.50, outputPerMillion: 9.00 },
  'gemini-2.5-flash':  { inputPerMillion: 0.30, outputPerMillion: 2.50 },
  'gemini-2.5-pro':    { inputPerMillion: 1.25, outputPerMillion: 10.0 },

  // Priced per token like every other row here, but logEmbeddingUsage only has a character count
  // to work with (none of the 3 embed call sites read usageMetadata off the response) — converted
  // there via an approximate ~4 characters/token, not exact.
  'gemini-embedding-001': { inputPerMillion: 0.15, outputPerMillion: 0 },
}
const DEFAULT_MODEL = GEMINI_DEFAULT

function resolveRates(pricing: ModelPricing, inputTokens: number, now: Date): FlatRate {
  if ('tiers' in pricing) {
    return pricing.tiers.find(t => t.maxInputTokens === undefined || inputTokens <= t.maxInputTokens)
      ?? pricing.tiers[pricing.tiers.length - 1]
  }
  if ('next' in pricing && now >= new Date(pricing.next.startsAt)) return pricing.next
  return pricing
}

const CHARS_PER_TOKEN_APPROX = 4
const EMBED_COST_PER_CHAR =
  resolveRates(PRICING['gemini-embedding-001'], 0, new Date()).inputPerMillion / 1e6 / CHARS_PER_TOKEN_APPROX

export type Provider = 'gemini' | 'anthropic'

export type GeminiFeature =
  | 'auto_summarize'
  | 'draft_reply'
  | 'draft_reply_drafter'
  | 'draft_reply_editor'
  | 'refresh_summary'
  | 'email_analysis'
  | 'outbound_search'
  | 'summarize'
  | 'rag_index'
  | 'rag_draft_reply'
  | 'draft_email'
  | 'inbound_auto_draft'
  | 'nexus_synthesis'
  | 'outbound_reply_draft'

// Opus / cross-provider features layered on top of the original Gemini ones.
export type AiFeature =
  | GeminiFeature
  | 'nexus_strategy'
  | 'chat_consultant'
  | 'rfq_recommend'
  | 'rfq_quote_decision'
  | 'pm_recommend'
  | 'pm_rate_extract'
  | 'pm_benefit_extract'
  | 'pm_rules_extract'
  | 'pm_shape_detect'
  | 'pm_plan_match'
  | 'pm_classify_categories'
  | 'debit_note_extract'
  | 'gb_recommend'
  | 'gb_plan_match'

export interface GeminiUsageMeta {
  promptTokenCount?:     number
  candidatesTokenCount?: number
  totalTokenCount?:      number
}

// Generic AI-usage ledger write (Gemini + Anthropic). Cost is derived from the
// model's per-token pricing. Never throws — logging must not break a flow.
export async function logAiUsage(p: {
  provider:     Provider
  model:        string
  feature:      AiFeature
  inputTokens:  number
  outputTokens: number
  threadId?:    string | null
  metadata?:    Record<string, unknown>
}): Promise<void> {
  try {
    const k = process.env.SUPABASE_SERVICE_KEY
    if (!k) return
    const pricing = PRICING[p.model] ?? PRICING[DEFAULT_MODEL]
    const rates   = resolveRates(pricing, p.inputTokens || 0, new Date())
    const costUsd = (p.inputTokens || 0) * (rates.inputPerMillion / 1e6) + (p.outputTokens || 0) * (rates.outputPerMillion / 1e6)
    await fetch(`${SB_URL}/rest/v1/gemini_usage_log`, {
      method:  'POST',
      headers: { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        provider:      p.provider,
        model:         p.model,
        feature:       p.feature,
        input_tokens:  p.inputTokens  || 0,
        output_tokens: p.outputTokens || 0,
        cost_usd:      costUsd,
        thread_id:     p.threadId ?? null,
        ...(p.metadata ? { metadata: JSON.stringify(p.metadata) } : {}),
      }),
    })
  } catch {
    // Non-fatal
  }
}

export async function logGeminiUsage(
  feature:   AiFeature,
  usage:     GeminiUsageMeta,
  threadId?: string | null,
  model:     string = DEFAULT_MODEL,
): Promise<void> {
  await logAiUsage({
    provider:     'gemini',
    model,
    feature,
    inputTokens:  usage.promptTokenCount     ?? 0,
    outputTokens: usage.candidatesTokenCount ?? 0,
    threadId,
  })
}

// Convenience for Anthropic (Opus) usage — reads the {input_tokens, output_tokens}
// shape returned by the Messages API.
export async function logAnthropicUsage(
  feature:   AiFeature,
  usage:     { input_tokens?: number; output_tokens?: number } | null | undefined,
  threadId?: string | null,
  model:     string = 'claude-opus-4-8',
): Promise<void> {
  await logAiUsage({
    provider:     'anthropic',
    model,
    feature,
    inputTokens:  usage?.input_tokens  ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    threadId,
  })
}

// Log embedding usage (text-embedding-004 — priced per character, no output tokens)
export async function logEmbeddingUsage(totalChars: number, fileCount: number): Promise<void> {
  try {
    const k = process.env.SUPABASE_SERVICE_KEY
    if (!k) return

    await fetch(`${SB_URL}/rest/v1/gemini_usage_log`, {
      method:  'POST',
      headers: {
        apikey:         k,
        Authorization:  `Bearer ${k}`,
        'Content-Type': 'application/json',
        Prefer:         'return=minimal',
      },
      body: JSON.stringify({
        provider:      'gemini',
        model:         'gemini-embedding-001',
        feature:       'rag_index',
        input_tokens:  totalChars,   // stored as char count (not tokens — different model)
        output_tokens: 0,
        cost_usd:      totalChars * EMBED_COST_PER_CHAR,
        thread_id:     null,
        metadata:      JSON.stringify({ files_indexed: fileCount, model: 'gemini-embedding-001' }),
      }),
    })
  } catch {
    // Non-fatal
  }
}
