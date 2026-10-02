/**
 * One place that calls Gemini.
 *
 * Written on 2 Oct 2026 while taking Opus 4.8 out of the pricing matrix. That meant converting
 * eight call sites across six files, each of which had hand-rolled the same request, the same
 * error handling and the same usage logging slightly differently — and each of which had to
 * repeat the one non-obvious thing about Gemini: thinking tokens are drawn from maxOutputTokens,
 * so a budget sized for the answer alone returns an empty candidate with HTTP 200 rather than an
 * error. That is the bug that silently emptied the email classifiers in September.
 *
 * Going through here means the next model change is one line, the key an agent uses is decided in
 * one place, and every call is attributed to an agent on the spend page whether or not the caller
 * remembered to log it.
 */
import { geminiUrl } from './gemini-models'
import { agentKey, type AgentId } from './ai-agents'
import { logAiUsage, type AiFeature } from './gemini-usage'
import { logError } from './error-log'

export type Part = { text: string } | { inline_data: { mime_type: string; data: string } }

export type CallOptions = {
  agent: Exclude<AgentId, 'unattributed'>
  feature: AiFeature
  model: string
  /** Sent as systemInstruction, which Gemini weights differently from a turn of user content. */
  system?: string
  parts: Part[]
  /** Must cover the reasoning as well as the answer — see this file's header. */
  maxOutputTokens?: number
  /** Ask for a JSON body. Leave off when a PDF is attached: constraining the response format on a
   *  document read has in practice cost completeness on long brochures. */
  json?: boolean
  /** Share of maxOutputTokens the model may spend reasoning; the rest is kept for the answer.
   *  0.3 = 30% thinking, 70% output. Unset leaves the model's own default, which can spend
   *  the whole allowance thinking and return nothing. */
  thinkingShare?: number
  temperature?: number
  metadata?: Record<string, unknown>
}

export type CallResult = { text: string | null; error?: string }

export async function callGemini(opts: CallOptions): Promise<CallResult> {
  const { key, via } = agentKey(opts.agent)
  if (!key) return { text: null, error: `No Gemini API key for the ${opts.agent} agent` }

  try {
    const res = await fetch(`${geminiUrl(opts.model)}?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
        contents: [{ parts: opts.parts }],
        generationConfig: {
          temperature: opts.temperature ?? 0,
          maxOutputTokens: opts.maxOutputTokens ?? 32000,
          ...(opts.json ? { responseMimeType: 'application/json' } : {}),
          ...(opts.thinkingShare != null
            ? { thinkingConfig: { thinkingBudget: Math.max(0, Math.round((opts.maxOutputTokens ?? 32000) * opts.thinkingShare)) } }
            : {}),
        },
      }),
    })
    if (!res.ok) {
      const body = (await res.text()).slice(0, 1000)
      void logError({ source: 'gemini', feature: opts.feature, statusCode: res.status, message: body,
                      metadata: { ...opts.metadata, agent: opts.agent, model: opts.model, via } })
      return { text: null, error: `Gemini ${res.status}: ${body.slice(0, 200)}` }
    }
    const j = await res.json()
    void logAiUsage({ provider: 'gemini', model: opts.model, feature: opts.feature,
                      inputTokens: j.usageMetadata?.promptTokenCount ?? 0,
                      // Thinking is billed as output. Counting only the answer understated every
                      // reasoning model's cost on the spend page.
                      outputTokens: (j.usageMetadata?.candidatesTokenCount ?? 0) + (j.usageMetadata?.thoughtsTokenCount ?? 0),
                      metadata: { ...opts.metadata, agent: opts.agent,
                                  thinking_tokens: j.usageMetadata?.thoughtsTokenCount ?? 0 } })
    const text: string = (j?.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: string }) => p.text ?? '').join('')
    if (!text.trim()) {
      // Worth saying plainly rather than returning an empty string a caller reads as "no result":
      // a truncated response and a refusal look identical from the outside, and the usual cause
      // is the output budget being spent on reasoning.
      const reason = j?.candidates?.[0]?.finishReason ?? 'unknown'
      return { text: null, error: `The model returned nothing (finishReason: ${reason}). Usually the output budget was spent on reasoning.` }
    }
    return { text }
  } catch (e) {
    return { text: null, error: e instanceof Error ? e.message : 'call failed' }
  }
}
