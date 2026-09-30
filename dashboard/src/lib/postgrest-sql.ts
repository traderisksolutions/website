/**
 * PostgREST query string -> SQL.
 *
 * The dashboard makes 837 calls shaped like `${SB_URL}/rest/v1/<table>?<postgrest query>`.
 * Rewriting every one of them by hand would be 218 files of risk, so instead this translates
 * the subset of PostgREST the app actually uses into parameterised SQL, and the calls keep
 * their current shape. Pure: no I/O, so every rule below is unit-testable.
 *
 * Deliberately NOT supported: embedded resources (`companies(id,name)`), which only 16 calls
 * use. Those are detected and rejected loudly rather than silently returning wrong rows.
 */

export class UnsupportedQuery extends Error {}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/
const q = (id: string) => { if (!IDENT.test(id)) throw new UnsupportedQuery(`bad identifier: ${id}`); return `"${id}"` }

const OPS: Record<string, string> = {
  eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=',
  like: 'like', ilike: 'ilike', match: '~', imatch: '~*',
}

/** `name:company_name` -> aliased column; `*` stays `*`. */
function selectList(sel: string | null): string {
  if (!sel || sel.trim() === '*') return '*'
  if (/\(/.test(sel)) throw new UnsupportedQuery('embedded resources are not supported')
  return sel.split(',').map(part => {
    const s = part.trim()
    if (s === '*') return '*'
    const [a, b] = s.split(':')
    return b ? `${q(b.trim())} as ${q(a.trim())}` : q(s)
  }).join(', ')
}

/** Splits `in.(a,b,"c,d")` respecting quotes. */
function splitList(raw: string): string[] {
  const out: string[] = []; let cur = ''; let inQ = false
  for (const ch of raw) {
    if (ch === '"') { inQ = !inQ; continue }
    if (ch === ',' && !inQ) { out.push(cur); cur = ''; continue }
    cur += ch
  }
  out.push(cur)
  return out.map(s => s.trim()).filter(s => s !== '')
}

function condition(col: string, spec: string, params: unknown[]): string {
  let negate = false
  let rest = spec
  if (rest.startsWith('not.')) { negate = true; rest = rest.slice(4) }
  const dot = rest.indexOf('.')
  if (dot < 0) throw new UnsupportedQuery(`bad filter on ${col}: ${spec}`)
  const op = rest.slice(0, dot)
  const val = rest.slice(dot + 1)
  let sql: string

  if (op === 'is') {
    if (val === 'null') sql = `${q(col)} is null`
    else if (val === 'true' || val === 'false') sql = `${q(col)} is ${val}`
    else throw new UnsupportedQuery(`unsupported is.${val}`)
  } else if (op === 'in') {
    const items = splitList(val.replace(/^\(/, '').replace(/\)$/, ''))
    if (items.length === 0) return negate ? 'true' : 'false'
    const ph = items.map(v => { params.push(v); return `$${params.length}` })
    sql = `${q(col)} in (${ph.join(', ')})`
  } else if (OPS[op]) {
    params.push(val)
    sql = `${q(col)} ${OPS[op]} $${params.length}`
  } else {
    throw new UnsupportedQuery(`unsupported operator: ${op}`)
  }
  return negate ? `not (${sql})` : sql
}

function orderBy(raw: string): string {
  return raw.split(',').map(part => {
    const [col, ...mods] = part.trim().split('.')
    let s = q(col)
    if (mods.includes('desc')) s += ' desc'
    else if (mods.includes('asc')) s += ' asc'
    if (mods.includes('nullsfirst')) s += ' nulls first'
    else if (mods.includes('nullslast')) s += ' nulls last'
    return s
  }).join(', ')
}

export interface Translated { text: string; values: unknown[] }

/** `table` plus a PostgREST query string (without the leading `?`). */
export function selectToSql(table: string, query: string): Translated {
  const p = new URLSearchParams(query)
  const params: unknown[] = []
  const cols = selectList(p.get('select'))
  const where: string[] = []

  for (const [key, val] of Array.from(p.entries())) {
    if (['select', 'order', 'limit', 'offset'].includes(key)) continue
    if (key === 'or' || key === 'and') throw new UnsupportedQuery(`${key}= is not supported`)
    if (key.includes('(') || key.includes('.')) throw new UnsupportedQuery(`embedded filter: ${key}`)
    where.push(condition(key, val, params))
  }

  let text = `select ${cols} from public.${q(table)}`
  if (where.length) text += ` where ${where.join(' and ')}`
  const ord = p.get('order'); if (ord) text += ` order by ${orderBy(ord)}`
  const lim = p.get('limit')
  if (lim) { if (!/^\d+$/.test(lim)) throw new UnsupportedQuery('bad limit'); text += ` limit ${lim}` }
  const off = p.get('offset')
  if (off) { if (!/^\d+$/.test(off)) throw new UnsupportedQuery('bad offset'); text += ` offset ${off}` }
  return { text, values: params }
}

/** Count for a `Prefer: count=exact` request; reuses the same filters. */
export function countToSql(table: string, query: string): Translated {
  const p = new URLSearchParams(query); p.delete('select'); p.delete('order'); p.delete('limit'); p.delete('offset')
  const { text, values } = selectToSql(table, p.toString())
  return { text: text.replace(/^select \* from/, 'select count(*)::int as count from'), values }
}
