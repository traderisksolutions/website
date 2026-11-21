/**
 * fetch() for the areas whose /api routes became one server action each (route-gateway.ts).
 * Same arguments, a real Response back, so the calling code (res.ok, res.json()) did not change.
 * Only a JSON or empty body passes; these areas send nothing else.
 */
import type { GatewayAnswer } from '@/lib/actions/route-gateway'

export function actionFetch(call: (url: string, method: string, body: string | null) => Promise<GatewayAnswer>) {
  return async (url: string, init: RequestInit = {}): Promise<Response> => {
    const body = typeof init.body === 'string' ? init.body : init.body == null ? null : JSON.stringify(init.body)
    const a = await call(url, init.method ?? 'GET', body)
    return new Response(a.status === 204 ? null : a.body, { status: a.status, headers: { 'content-type': a.type } })
  }
}
