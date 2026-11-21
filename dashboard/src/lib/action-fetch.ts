/**
 * fetch() for the areas whose /api routes became one server action each (route-gateway.ts).
 * Same arguments, a real Response back, so the calling code (res.ok, res.json()) did not change.
 * Only a JSON or empty body passes; these areas send nothing else.
 *
 * Reads are gathered: the browser runs server actions one at a time, so GETs made together (or
 * while a batch is out) go as one gatewayReads call and run at once on the server. Writes go alone.
 */
import type { GatewayAnswer } from '@/lib/actions/route-gateway'
import { gatewayReads } from '@/app/gateway-batch'

type Waiting = { area: string; url: string; resolve: (a: GatewayAnswer) => void; reject: (e: unknown) => void }
let waiting: Waiting[] = []
let out = false

async function flush() {
  if (out || !waiting.length) return
  out = true
  const batch = waiting.splice(0, 50)
  try {
    const answers = await gatewayReads(batch.map(w => ({ area: w.area, url: w.url })))
    batch.forEach((w, i) => answers[i] ? w.resolve(answers[i]) : w.reject(new Error('No answer')))
  } catch (e) { batch.forEach(w => w.reject(e)) }
  finally { out = false; void flush() }
}

function read(area: string, url: string) {
  return new Promise<GatewayAnswer>((resolve, reject) => {
    waiting.push({ area, url, resolve, reject })
    setTimeout(() => void flush(), 0)
  })
}

export function actionFetch(call: (url: string, method: string, body: string | null) => Promise<GatewayAnswer>, area?: string) {
  return async (url: string, init: RequestInit = {}): Promise<Response> => {
    const method = (init.method ?? 'GET').toUpperCase()
    const body = typeof init.body === 'string' ? init.body : init.body == null ? null : JSON.stringify(init.body)
    const a = area && method === 'GET' ? await read(area, url) : await call(url, method, body)
    return new Response(a.status === 204 ? null : a.body, { status: a.status, headers: { 'content-type': a.type } })
  }
}

/** For tests: drop anything still waiting. */
export function resetActionReads() { waiting = []; out = false }
