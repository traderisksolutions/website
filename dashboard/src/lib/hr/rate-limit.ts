// HR Connect: a per-token request counter for the public routes. In memory, per server instance,
// 60 requests in 10 minutes. Enough to blunt a scripted guess at tokens; not a shared limiter,
// so two instances each allow 60. Keyed by the token's hash so the token itself is not held.
import { hashToken } from './tokens'

const WINDOW_MS = 10 * 60_000
const LIMIT = 60
const hits = new Map<string, { count: number; resetAt: number }>()

export function allowRequest(token: string, now = Date.now()): boolean {
  if (hits.size > 10_000) hits.forEach((v, k) => { if (v.resetAt <= now) hits.delete(k) })
  const key = hashToken(token)
  const cur = hits.get(key)
  if (!cur || cur.resetAt <= now) { hits.set(key, { count: 1, resetAt: now + WINDOW_MS }); return true }
  cur.count += 1
  return cur.count <= LIMIT
}
