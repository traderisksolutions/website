/**
 * Model calls for the company agent. Gemini Flash is the default for the brief, triage and
 * next-action extraction (cheap, fast); Claude Opus is used only when the caller asks for a
 * deep analysis or in the company chat. Both return parsed JSON and log usage the same way the
 * rest of the dashboard does, so AI spend shows up per feature on the AI Usage page.
 */
import { GEMINI_FLASH, geminiUrl } from '@/lib/gemini-models'
import { logGeminiUsage, logAnthropicUsage, type AiFeature } from '@/lib/gemini-usage'
import { logError } from '@/lib/error-log'

export const OPUS_MODEL = 'claude-opus-4-8'
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

export function geminiKey(): string | null {
  return process.env.GEMINI_API_KEY_DRAFT_EMAIL || process.env.GEMINI_API_KEY_EMAIL_ANALYSIS || process.env.GEMINI_API_KEY || null
}

export function anthropicKey(): string | null {
  return process.env.ANTHROPIC_API_KEY || null
}

/** Tolerant JSON parse: strips code fences and anything before the first `{` or `[`. */
export function parseJsonLoose<T>(raw: string): T | null {
  const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim()
  const start = Math.min(...['{', '['].map(ch => { const i = cleaned.indexOf(ch); return i < 0 ? Infinity : i }))
  if (!Number.isFinite(start)) return null
  const body = cleaned.slice(start)
  for (const end of [body.length, body.lastIndexOf('}') + 1, body.lastIndexOf(']') + 1]) {
    if (end <= 0) continue
    try { return JSON.parse(body.slice(0, end)) as T } catch { /* try the next cut */ }
  }
  return null
}

export interface AiResult<T> { data: T | null; model: string; error?: string }

export async function geminiJson<T>(opts: {
  prompt: string; system?: string; model?: string; feature: AiFeature; resourceId?: string | null
  temperature?: number; maxOutputTokens?: number
}): Promise<AiResult<T>> {
  const model = opts.model ?? GEMINI_FLASH
  const key = geminiKey()
  if (!key) return { data: null, model, error: 'Gemini is not configured (no GEMINI_API_KEY).' }
  try {
    const body: Record<string, unknown> = {
      contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
      generationConfig: { temperature: opts.temperature ?? 0.2, responseMimeType: 'application/json', maxOutputTokens: opts.maxOutputTokens ?? 4000 },
    }
    if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] }
    const res = await fetch(`${geminiUrl(model)}?key=${key}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) {
      const msg = await res.text()
      void logError({ source: 'gemini', feature: opts.feature, statusCode: res.status, message: msg.slice(0, 500), resourceType: 'company', resourceId: opts.resourceId ?? null })
      return { data: null, model, error: `Gemini error ${res.status}` }
    }
    const json = await res.json()
    void logGeminiUsage(opts.feature, json?.usageMetadata ?? {}, opts.resourceId ?? null, model)
    const raw: string = json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
    const data = parseJsonLoose<T>(raw)
    return data ? { data, model } : { data: null, model, error: 'The model returned something that was not valid JSON.' }
  } catch (e) {
    void logError({ source: 'gemini', feature: opts.feature, message: String(e), resourceType: 'company', resourceId: opts.resourceId ?? null })
    return { data: null, model, error: String(e) }
  }
}

export async function opusJson<T>(opts: {
  prompt: string; system: string; feature: AiFeature; resourceId?: string | null; maxTokens?: number
}): Promise<AiResult<T>> {
  const key = anthropicKey()
  if (!key) return { data: null, model: OPUS_MODEL, error: 'Deep analysis needs ANTHROPIC_API_KEY, which is not set.' }
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: OPUS_MODEL, max_tokens: opts.maxTokens ?? 4000, system: opts.system,
        thinking: { type: 'adaptive' },
        messages: [{ role: 'user', content: `${opts.prompt}\n\nReturn ONLY the JSON object. No prose before or after it.` }],
      }),
    })
    if (!res.ok) {
      const msg = await res.text()
      void logError({ source: 'anthropic', feature: opts.feature, statusCode: res.status, message: msg.slice(0, 500), resourceType: 'company', resourceId: opts.resourceId ?? null })
      return { data: null, model: OPUS_MODEL, error: `Claude error ${res.status}` }
    }
    const json = await res.json()
    void logAnthropicUsage(opts.feature, json?.usage, opts.resourceId ?? null, OPUS_MODEL)
    const raw: string = (json?.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('')
    const data = parseJsonLoose<T>(raw)
    return data ? { data, model: OPUS_MODEL } : { data: null, model: OPUS_MODEL, error: 'The model returned something that was not valid JSON.' }
  } catch (e) {
    void logError({ source: 'anthropic', feature: opts.feature, message: String(e), resourceType: 'company', resourceId: opts.resourceId ?? null })
    return { data: null, model: OPUS_MODEL, error: String(e) }
  }
}
