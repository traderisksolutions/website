/**
 * Claude model ids for the judgement work (Nexus strategy and timeline, the case chat).
 * Override with ANTHROPIC_MODEL_OPUS without a redeploy.
 *
 * If the API rejects the primary model (404 not_found or 400 invalid model), the call is retried
 * once on the previous Opus, so a bad model id downgrades the run instead of failing it.
 */
export const OPUS_MODEL          = process.env.ANTHROPIC_MODEL_OPUS || 'claude-opus-5-5'
export const OPUS_FALLBACK_MODEL = 'claude-opus-4-8'

export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

/** POST to the Messages API with `body.model = OPUS_MODEL`; on a model-not-found error, retry
 *  once with OPUS_FALLBACK_MODEL. Returns the response and the model that produced it. */
export async function fetchOpus(body: Record<string, unknown>, apiKey: string, init?: { signal?: AbortSignal }): Promise<{ res: Response; model: string }> {
  const send = (model: string) => fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, model }),
    signal: init?.signal,
  })
  const res = await send(OPUS_MODEL)
  if (OPUS_MODEL === OPUS_FALLBACK_MODEL || (res.status !== 404 && res.status !== 400)) return { res, model: OPUS_MODEL }
  const text = await res.clone().text().catch(() => '')
  if (!/model/i.test(text)) return { res, model: OPUS_MODEL }
  console.warn(`[anthropic] ${OPUS_MODEL} rejected (${res.status}); retrying on ${OPUS_FALLBACK_MODEL}`)
  return { res: await send(OPUS_FALLBACK_MODEL), model: OPUS_FALLBACK_MODEL }
}
