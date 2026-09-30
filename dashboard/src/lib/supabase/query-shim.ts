/**
 * A small PostgREST query builder for the browser, shaped like the Supabase client's.
 *
 * The chat dock builds queries as `db().from('chat_messages').select('*').eq('thread_id', id)`
 * in 19 places. Rather than rewrite those, this reproduces the chained API and sends the request
 * to /api/db/<table>, which is session-guarded and allow-lists the chat tables.
 *
 * Supports only what the chat module uses: select / insert / update / upsert / delete,
 * eq / neq / is / in, order / limit, single / maybeSingle.
 */
// The callers assert their own row types (ChatThread, ChatMessage, ...), exactly as they did
// against the Supabase client, so the shim stays deliberately untyped at this boundary.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = any
export interface Result<T> { data: T | null; error: { message: string } | null }

export class Query<T = Row[]> implements PromiseLike<Result<T>> {
  private filters: string[] = []
  private cols = '*'
  private orderBy: string | null = null
  private lim: number | null = null
  private one = false
  private method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET'
  private body: unknown = undefined
  private prefer: string | undefined

  constructor(private table: string) {}

  select(cols = '*') { this.cols = cols; if (this.method === 'GET') this.prefer = undefined; return this as unknown as Query<T> }
  insert(values: Row | Row[]) { this.method = 'POST'; this.body = values; this.prefer = 'return=representation'; return this }
  update(values: Row)         { this.method = 'PATCH'; this.body = values; this.prefer = 'return=representation'; return this }
  upsert(values: Row | Row[], opts?: { onConflict?: string }) {
    this.method = 'POST'; this.body = values
    this.prefer = `resolution=merge-duplicates,return=representation`
    if (opts?.onConflict) this.filters.push(`on_conflict=${encodeURIComponent(opts.onConflict)}`)
    return this
  }
  delete() { this.method = 'DELETE'; return this }

  eq(col: string, v: unknown)  { this.filters.push(`${col}=eq.${encodeURIComponent(String(v))}`); return this }
  neq(col: string, v: unknown) { this.filters.push(`${col}=neq.${encodeURIComponent(String(v))}`); return this }
  is(col: string, v: null | boolean) { this.filters.push(`${col}=is.${v === null ? 'null' : String(v)}`); return this }
  in(col: string, vs: unknown[]) { this.filters.push(`${col}=in.(${vs.map(v => encodeURIComponent(String(v))).join(',')})`); return this }
  order(col: string, o?: { ascending?: boolean }) { this.orderBy = `${col}.${o?.ascending === false ? 'desc' : 'asc'}`; return this }
  limit(n: number) { this.lim = n; return this }
  single()      { this.one = true; this.lim = 1; return this as unknown as Query<T> }
  maybeSingle() { this.one = true; this.lim = 1; return this as unknown as Query<T> }

  private url() {
    const p = [...this.filters]
    if (this.method === 'GET' || this.prefer?.includes('representation')) p.push(`select=${encodeURIComponent(this.cols)}`)
    if (this.orderBy) p.push(`order=${this.orderBy}`)
    if (this.lim != null) p.push(`limit=${this.lim}`)
    return `/api/db/${this.table}${p.length ? '?' + p.join('&') : ''}`
  }

  async run(): Promise<Result<T>> {
    try {
      const res = await fetch(this.url(), {
        method: this.method,
        headers: { 'Content-Type': 'application/json', ...(this.prefer ? { 'x-prefer': this.prefer } : {}) },
        body: this.body === undefined ? undefined : JSON.stringify(this.body),
        cache: 'no-store',
      })
      const text = await res.text()
      const parsed = text ? JSON.parse(text) : null
      if (!res.ok) return { data: null, error: { message: typeof parsed?.message === 'string' ? parsed.message : `HTTP ${res.status}` } }
      const rows = Array.isArray(parsed) ? parsed : parsed == null ? [] : [parsed]
      return { data: (this.one ? (rows[0] ?? null) : rows) as T, error: null }
    } catch (e) {
      return { data: null, error: { message: e instanceof Error ? e.message : 'request failed' } }
    }
  }

  then<R1 = Result<T>, R2 = never>(
    onOk?: ((v: Result<T>) => R1 | PromiseLike<R1>) | null,
    onErr?: ((r: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> { return this.run().then(onOk, onErr) }
}

export const from = <T = any>(table: string) => new Query<T>(table)
