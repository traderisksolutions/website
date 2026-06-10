const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

// Gemini 2.5 Flash pricing (non-thinking)
const INPUT_COST_PER_TOKEN  = 0.15  / 1_000_000   // $0.15 per 1M input tokens
const OUTPUT_COST_PER_TOKEN = 0.60  / 1_000_000   // $0.60 per 1M output tokens

// gemini-embedding-001 pricing: $0.000025 per 1,000 characters
const EMBED_COST_PER_CHAR = 0.000025 / 1_000

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

export interface GeminiUsageMeta {
  promptTokenCount?:     number
  candidatesTokenCount?: number
  totalTokenCount?:      number
}

export async function logGeminiUsage(
  feature:   GeminiFeature,
  usage:     GeminiUsageMeta,
  threadId?: string | null,
): Promise<void> {
  try {
    const inputTokens  = usage.promptTokenCount     ?? 0
    const outputTokens = usage.candidatesTokenCount ?? 0
    const costUsd      = inputTokens * INPUT_COST_PER_TOKEN + outputTokens * OUTPUT_COST_PER_TOKEN

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
        feature,
        input_tokens:  inputTokens,
        output_tokens: outputTokens,
        cost_usd:      costUsd,
        thread_id:     threadId ?? null,
      }),
    })
  } catch {
    // Non-fatal — never let logging break the main flow
  }
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
