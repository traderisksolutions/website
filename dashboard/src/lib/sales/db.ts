/**
 * PostgREST helpers for the sales module. Server only (service key).
 *
 *   sb()       throws on any non-2xx.
 *   sbCount()  HEAD with Prefer: count=exact → the total matching rows.
 *   sbAll()    every row of a query, 1,000 at a time (PostgREST's per-response cap).
 *   enc()      encodeURIComponent for filter values.
 */
import { SB_URL, sbHeaders } from '@/lib/sb'

export { SB_URL }
export const enc = encodeURIComponent
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (s: string | null | undefined): s is string => !!s && UUID.test(s)

export async function sb<T = Record<string, unknown>[]>(path: string, init?: RequestInit & { prefer?: string }): Promise<T> {
  const method = init?.method ?? 'GET'
  const prefer = init?.prefer ?? (method === 'GET' ? 'return=minimal' : 'return=representation')
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...sbHeaders(prefer), ...(init?.headers as Record<string, string> ?? {}) },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`${path.split('?')[0]} ${method} failed (${res.status}): ${(await res.text()).slice(0, 300)}`)
  const text = await res.text()
  return (text ? JSON.parse(text) : []) as T
}

/** Rows plus the exact total, for paged lists. A page past the end reads as empty. */
export async function sbPage<T>(path: string): Promise<{ rows: T[]; total: number }> {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: sbHeaders('count=exact'), cache: 'no-store' })
  if (res.status === 416) return { rows: [], total: Number(res.headers.get('content-range')?.split('/')[1] ?? 0) }
  if (!res.ok) throw new Error(`${path.split('?')[0]} failed (${res.status}): ${(await res.text()).slice(0, 300)}`)
  const total = Number(res.headers.get('content-range')?.split('/')[1] ?? 0)
  return { rows: (await res.json()) as T[], total }
}

export async function sbCount(path: string): Promise<number> {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { method: 'HEAD', headers: sbHeaders('count=exact'), cache: 'no-store' })
  if (!res.ok) throw new Error(`${path.split('?')[0]} count failed (${res.status})`)
  return Number(res.headers.get('content-range')?.split('/')[1] ?? 0)
}

export async function sbAll<T>(path: string, pageSize = 1000, maxRows = 50_000): Promise<T[]> {
  const out: T[] = []
  const sep = path.includes('?') ? '&' : '?'
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const rows = await sb<T[]>(`${path}${sep}limit=${pageSize}&offset=${offset}`)
    out.push(...rows)
    if (rows.length < pageSize) break
  }
  return out
}

export async function sbRpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  return sb<T>(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args), prefer: 'return=representation' })
}

/** Runs one request per chunk of ids so an in.(...) filter never overflows the URL. */
export async function inChunks<T>(ids: string[], size: number, fn: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += size) out.push(...await fn(ids.slice(i, i + size)))
  return out
}

/** Midnight in Singapore, as an ISO instant: the day boundary for caps. */
export function startOfSgtDay(now = new Date()): string {
  const sgt = new Date(now.getTime() + 8 * 3_600_000)
  return new Date(Date.UTC(sgt.getUTCFullYear(), sgt.getUTCMonth(), sgt.getUTCDate()) - 8 * 3_600_000).toISOString()
}
