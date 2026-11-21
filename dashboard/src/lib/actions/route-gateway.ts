/**
 * A route's handler called from a server action (21 Nov 2026). For the areas moved off /api in
 * the last clean-up pass (Nexus, Placements, Inbox), each route's code moved unchanged to
 * src/lib/<area>/handlers/ and is called here as the route was: the same request shape, the
 * signed-in person's cookies, the site's own origin. The /api address is gone; the handler keeps
 * its own session check. The client side is actionFetch (src/lib/action-fetch.ts).
 */
import { NextRequest } from 'next/server'
import { cookies, headers } from 'next/headers'

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response | void> | Response | void
export type RouteTable = { pattern: string; load: () => Promise<Record<string, unknown>> }[]
export type GatewayAnswer = { status: number; body: string; type: string }

/** Matches /api/nexus/cases/<id>/threads against /api/nexus/cases/[id]/threads; null when it does not fit. */
function match(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split('/'), b = path.split('/')
  if (a.length !== b.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < a.length; i++) {
    const m = a[i].match(/^\[(\w+)\]$/)
    if (m) { if (!b[i]) return null; params[m[1]] = decodeURIComponent(b[i]) }
    else if (a[i] !== b[i]) return null
  }
  return params
}

/**
 * The route a path reaches. As Next.js does, a fixed segment wins over [id], so
 * /placements/line-texts is not read as a placement id (21 Nov 2026: alphabetical order sent seven
 * paths to their [id] neighbour).
 */
export function pickRoute(table: RouteTable, pathname: string): { r: RouteTable[number]; params: Record<string, string> } | null {
  const dynamicCount = (p: string) => (p.match(/\[\w+\]/g) ?? []).length
  const hit = table.map(r => ({ r, params: match(r.pattern, pathname) })).filter(x => x.params)
    .sort((a, b) => dynamicCount(a.r.pattern) - dynamicCount(b.r.pattern))[0]
  return hit ? { r: hit.r, params: hit.params! } : null
}

export async function runRoute(table: RouteTable, url: string, method: string, body: string | null): Promise<GatewayAnswer> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  const full = new URL(url, `${proto}://${host}`)
  const found = pickRoute(table, full.pathname)
  if (!found) return { status: 404, body: JSON.stringify({ error: 'Not found' }), type: 'application/json' }
  const mod = await found.r.load()
  const handler = mod[method.toUpperCase()] as Handler | undefined
  if (typeof handler !== 'function') return { status: 405, body: JSON.stringify({ error: 'Method not allowed' }), type: 'application/json' }
  const jar = await cookies()
  const req = new NextRequest(full, {
    method: method.toUpperCase(),
    headers: { cookie: jar.toString(), 'content-type': 'application/json', host, 'x-forwarded-host': host, 'x-forwarded-proto': proto, origin: `${proto}://${host}` },
    body: method.toUpperCase() === 'GET' || method.toUpperCase() === 'HEAD' ? undefined : (body ?? undefined),
  })
  const res = await handler(req, { params: Promise.resolve(found.params!) })
  if (!res) return { status: 204, body: '', type: 'text/plain' }
  return { status: res.status, body: await res.text(), type: res.headers.get('content-type') ?? 'application/json' }
}
