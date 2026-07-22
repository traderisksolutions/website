import { GEMINI_DEFAULT } from './gemini-models'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

// Per-model token pricing (USD per 1M tokens → per token). Base input / output.
//   Gemini 3.6 Flash:      $1.50 in / $7.50 out — FLASH tier (drafting/analysis/extraction)
//   Gemini 3.1 Pro:        $2.00 in / $12.00 out — PRO tier (heavy reasoning, ≤200k context)
//   Gemini 3.1 Flash-Lite: $0.25 in / $1.50 out — LITE tier (high-volume classification/chase/bulk)
//   Gemini 3.5 Flash:      $1.50 in / $9.00 out — kept for historical log rows.
//   Gemini 2.5 Flash/Pro kept for historical log rows.
//   Claude Opus 4.8:       $5.00 in / $25.00 out
const PRICING: Record<string, { in: number; out: number }> = {
  'gemini-3.6-flash':       { in: 1.50 / 1e6, out: 7.50 / 1e6 },
  'gemini-3.1-pro-preview': { in: 2.00 / 1e6, out: 12.0 / 1e6 },
  'gemini-3.1-flash-lite':  { in: 0.25 / 1e6, out: 1.50 / 1e6 },
  'gemini-3.5-flash':       { in: 1.50 / 1e6, out: 9.00 / 1e6 },
  'gemini-2.5-flash':       { in: 0.30 / 1e6, out: 2.50 / 1e6 },
  'gemini-2.5-pro':         { in: 1.25 / 1e6, out: 10.0 / 1e6 },
  'claude-opus-4-8':        { in: 5.00 / 1e6, out: 25.0 / 1e6 },
}
const DEFAULT_MODEL = GEMINI_DEFAULT

// gemini-embedding-001 pricing: $0.000025 per 1,000 characters
const EMBED_COST_PER_CHAR = 0.000025 / 1_000

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

// Opus / cross-provider features layered on top of the original Gemini ones.
export type AiFeature =
  | GeminiFeature
  | 'nexus_strategy'
  | 'chat_consultant'
  | 'rfq_recommend'
  | 'rfq_quote_decision'
  | 'pm_map_propose'
  | 'pm_recommend'
  | 'pm_pricing'

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
    const price   = PRICING[p.model] ?? PRICING[DEFAULT_MODEL]
    const costUsd = (p.inputTokens || 0) * price.in + (p.outputTokens || 0) * price.out
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
