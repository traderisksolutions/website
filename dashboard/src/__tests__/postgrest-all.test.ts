import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchAllRows, PAGE } from '@/lib/postgrest-all'

/** A fake PostgREST holding `total` rows numbered 0…total-1, answering by offset, slow on early pages. */
function server(total: number, opts: { failAt?: number; noCount?: boolean } = {}) {
  return vi.fn(async (url: string) => {
    const u = new URL(url)
    const offset = Number(u.searchParams.get('offset'))
    if (offset === opts.failAt) return new Response('boom', { status: 500 })
    await new Promise(r => setTimeout(r, offset === PAGE ? 20 : 1))   // page 2 answers last
    const rows = Array.from({ length: Math.max(0, Math.min(PAGE, total - offset)) }, (_, i) => ({ n: offset + i }))
    const headers = opts.noCount ? {} : { 'content-range': `${offset}-${offset + rows.length - 1}/${total}` }
    return new Response(JSON.stringify(rows), { status: 200, headers })
  })
}

describe('fetchAllRows', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('returns every row in order when pages answer out of order', async () => {
    vi.stubGlobal('fetch', server(4_500))
    const rows = await fetchAllRows<{ n: number }>('https://db.invalid/rest/v1/t?select=n', {})
    expect(rows.length).toBe(4_500)
    expect(rows.every((r, i) => r.n === i)).toBe(true)
  })

  it('throws when any page fails, rather than returning part of the rows', async () => {
    vi.stubGlobal('fetch', server(4_500, { failAt: 2 * PAGE }))
    await expect(fetchAllRows('https://db.invalid/rest/v1/t?select=n', {})).rejects.toThrow(/row 2000: 500/)
  })

  it('pages one at a time when the server sends no total', async () => {
    vi.stubGlobal('fetch', server(2_300, { noCount: true }))
    const rows = await fetchAllRows<{ n: number }>('https://db.invalid/rest/v1/t?select=n', {})
    expect(rows.map(r => r.n)).toEqual(Array.from({ length: 2_300 }, (_, i) => i))
  })

  it('reads a single short page once', async () => {
    const f = server(12); vi.stubGlobal('fetch', f)
    expect((await fetchAllRows('https://db.invalid/rest/v1/t?select=n', {})).length).toBe(12)
    expect(f).toHaveBeenCalledTimes(1)
  })
})
