/**
 * Read every row a PostgREST query matches.
 *
 * The API caps every response at 1,000 rows (max-rows), whatever `limit=` asks for, and says
 * nothing when it does. Found 2 Oct 2026: a quote across all five insurers needs 1,840 rate rows,
 * got 1,000, and priced Singlife at S$0 with every member "plan not in rate table". Any read that
 * can pass 1,000 rows goes through here.
 *
 * Pages with limit/offset in a stable order: the query's own order with id appended, or id
 * alone. A failed page throws rather than returning what arrived so far, because a partial rate
 * table prices wrong without looking wrong.
 */
export const PAGE = 1000

export async function fetchAllRows<T>(url: string, headers: Record<string, string>, opts?: { maxRows?: number }): Promise<T[]> {
  const u = new URL(url)
  u.searchParams.delete('limit')
  u.searchParams.delete('offset')
  const order = u.searchParams.get('order')
  u.searchParams.set('order', order ? (/(^|,)id(\.|,|$)/.test(order) ? order : `${order},id`) : 'id')

  const max = opts?.maxRows ?? 200_000
  const out: T[] = []
  for (let offset = 0; offset < max; offset += PAGE) {
    u.searchParams.set('limit', String(PAGE))
    u.searchParams.set('offset', String(offset))
    const res = await fetch(u.toString(), { headers, cache: 'no-store' })
    if (!res.ok) throw new Error(`Read failed at row ${offset}: ${res.status} ${(await res.text()).slice(0, 200)}`)
    const rows = await res.json() as T[]
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
  throw new Error(`More than ${max} rows; narrow the query`)
}
