const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

// Gemini 2.5 Flash pricing (non-thinking)
const INPUT_COST_PER_TOKEN  = 0.15  / 1_000_000   // $0.15 per 1M input tokens
const OUTPUT_COST_PER_TOKEN = 0.60  / 1_000_000   // $0.60 per 1M output tokens

export type GeminiFeature =
  | 'auto_summarize'
  | 'draft_reply'
  | 'refresh_summary'
  | 'email_analysis'
  | 'outbound_search'
  | 'summarize'

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
