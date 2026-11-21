/**
 * Read every row a PostgREST query matches.
 *
 * The API caps every response at 1,000 rows (max-rows), whatever `limit=` asks for, and says
 * nothing when it does. Found 2 Oct 2026: a quote across all five insurers needs 1,840 rate rows,
 * got 1,000, and priced Singlife at S$0 with every member "plan not in rate table". Any read that
 * can pass 1,000 rows goes through here.
 *
 * Pages with limit/offset in a stable order: the query's own order with id appended, or id
 * alone. The first page asks for the total; the rest are read in parallel, six at a time. A failed page throws rather than returning what arrived so far, because a partial rate
 * table prices wrong without looking wrong.
 */
export const PAGE = 1000

export async function fetchAllRows<T>(url: string, headers: Record<string, string>, opts?: { maxRows?: number; key?: string }): Promise<T[]> {
  const u = new URL(url)
  u.searchParams.delete('limit')
  u.searchParams.delete('offset')
  const order = u.searchParams.get('order')
  // `key` is the unique column list for tables without an id (join tables: 'thread_id,work_item_id').
  if (opts?.key) u.searchParams.set('order', order ? `${order},${opts.key}` : opts.key)
  else u.searchParams.set('order', order ? (/(^|,)id(\.|,|$)/.test(order) ? order : `${order},id`) : 'id')
  const max = opts?.maxRows ?? 200_000
  const pageUrl = (offset: number) => {
    const p = new URL(u)
    p.searchParams.set('limit', String(PAGE))
    p.searchParams.set('offset', String(offset))
    return p.toString()
  }
  const read = async (offset: number, h: Record<string, string>) => {
    const res = await fetch(pageUrl(offset), { headers: h, cache: 'no-store' })
    if (!res.ok) throw new Error(`Read failed at row ${offset}: ${res.status} ${(await res.text()).slice(0, 200)}`)
    return { res, rows: await res.json() as T[] }
  }

  // The first page carries the total (Content-Range: 0-999/12345); the rest are read six at a time
  // and put back in order (21 Nov 2026: one page after another, a 30-page read took over 2 s).
  const first = await read(0, { ...headers, Prefer: [headers.Prefer, 'count=exact'].filter(Boolean).join(',') })
  if (first.rows.length < PAGE) return first.rows
  const total = Number(first.res.headers.get('content-range')?.split('/')[1])
  if (!Number.isFinite(total)) return sequential(first.rows, PAGE)
  if (total > max) throw new Error(`More than ${max} rows; narrow the query`)
  const offsets: number[] = []
  for (let o = PAGE; o < total; o += PAGE) offsets.push(o)
  const pages: T[][] = new Array(offsets.length)
  for (let i = 0; i < offsets.length; i += 6) {
    const got = await Promise.all(offsets.slice(i, i + 6).map(o => read(o, headers)))
    got.forEach((g, k) => { pages[i + k] = g.rows })
  }
  return [first.rows, ...pages].flat()

  // A server that sends no total: page on one at a time, as before.
  async function sequential(out: T[], from: number): Promise<T[]> {
    for (let offset = from; offset < max; offset += PAGE) {
      const { rows } = await read(offset, headers)
      out.push(...rows)
      if (rows.length < PAGE) return out
    }
    throw new Error(`More than ${max} rows; narrow the query`)
  }
}
