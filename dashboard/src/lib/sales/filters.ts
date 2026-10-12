// URL search params → validated lead filters → a PostgREST query. Pure; shared by the page,
// the API and the export, and tested in src/__tests__/sales-rules.test.ts.

import { ACTIONS, EMAIL_STATUSES, OUTREACH_STATUSES, LIST_COLUMNS } from './types'

/** Fit bands on fit_score. Change the numbers here. */
export const FIT_BANDS = { strong: 80, good: 70 } as const

export const SORTS = ['score_desc', 'fit_desc', 'intent_desc', 'newest', 'company_asc'] as const
export const PAGE_SIZES = [25, 50, 100] as const
export type Sort = (typeof SORTS)[number]

export type LeadFilters = {
  location: string // "all" or an ISO-2 code
  outreach: 'any' | 'none' | (typeof OUTREACH_STATUSES)[number]
  email: 'any' | 'none' | (typeof EMAIL_STATUSES)[number]
  fit: 'any' | 'strong' | 'good' | 'weak'
  action: 'any' | (typeof ACTIONS)[number]
  hasContact: 'any' | 'yes' | 'no'
  added: 'any' | '24h' | '7d'
  sort: Sort
  q: string
  page: number
  pageSize: (typeof PAGE_SIZES)[number]
}

export const DEFAULT_FILTERS: LeadFilters = {
  location: 'all', outreach: 'any', email: 'any', fit: 'any', action: 'any', hasContact: 'any', added: 'any',
  sort: 'score_desc', q: '', page: 1, pageSize: 50,
}

type Params = Record<string, string | string[] | undefined> | URLSearchParams

function get(p: Params, key: string): string | undefined {
  const v = p instanceof URLSearchParams ? p.get(key) ?? undefined : p[key]
  return Array.isArray(v) ? v[0] : v
}

function pick<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return value !== undefined && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

/** Strips the characters that carry meaning in PostgREST's or() grammar and in ilike
 *  patterns, rather than trying to escape them. */
export function cleanQuery(raw: string | undefined): string {
  return (raw ?? '').replace(/[%,()*\\:"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
}

export function parseFilters(p: Params): LeadFilters {
  const loc = (get(p, 'location') ?? '').toUpperCase()
  const page = Math.floor(Number(get(p, 'page')))
  const size = Number(get(p, 'pageSize'))
  return {
    location: /^[A-Z]{2}$/.test(loc) ? loc : 'all',
    outreach: pick(get(p, 'outreach'), ['any', 'none', ...OUTREACH_STATUSES], 'any'),
    email: pick(get(p, 'email'), ['any', 'none', ...EMAIL_STATUSES], 'any'),
    fit: pick(get(p, 'fit'), ['any', 'strong', 'good', 'weak'], 'any'),
    action: pick(get(p, 'action'), ['any', ...ACTIONS], 'any'),
    hasContact: pick(get(p, 'hasContact'), ['any', 'yes', 'no'], 'any'),
    added: pick(get(p, 'added'), ['any', '24h', '7d'], 'any'),
    sort: pick(get(p, 'sort'), SORTS, 'score_desc'),
    q: cleanQuery(get(p, 'q')),
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, 10_000) : 1,
    pageSize: (PAGE_SIZES as readonly number[]).includes(size) ? (size as LeadFilters['pageSize']) : 50,
  }
}

/** Filters → query string, omitting defaults so URLs stay short. */
export function toSearch(f: LeadFilters, extra: Record<string, string | null> = {}): string {
  const out = new URLSearchParams()
  for (const [k, v] of Object.entries(f)) {
    if (v !== DEFAULT_FILTERS[k as keyof LeadFilters] && v !== '') out.set(k, String(v))
  }
  for (const [k, v] of Object.entries(extra)) if (v) out.set(k, v)
  const s = out.toString()
  return s ? `?${s}` : ''
}

export function activeFilterCount(f: LeadFilters): number {
  return (['outreach', 'email', 'fit', 'action', 'hasContact', 'added'] as const).filter(k => f[k] !== 'any').length + (f.q ? 1 : 0)
}

export const ADDED_WINDOW_MS = { '24h': 86_400_000, '7d': 7 * 86_400_000 } as const

/** Start of an "added" window, rounded down to the minute so the server and the browser
 *  agree on it within one render. */
export function addedSince(window: '24h' | '7d', now = Date.now()): string {
  return new Date(Math.floor((now - ADDED_WINDOW_MS[window]) / 60_000) * 60_000).toISOString()
}

/** The PostgREST filter clauses (without select/order/limit) for a set of filters. */
export function filterClauses(f: LeadFilters): string[] {
  const c: string[] = []
  if (f.location !== 'all') c.push(`location=eq.${f.location}`)
  if (f.outreach === 'none') c.push('outreach_status=is.null')
  else if (f.outreach !== 'any') c.push(`outreach_status=eq.${f.outreach}`)
  if (f.email === 'none') c.push('contact_email=is.null')
  else if (f.email === 'verified') c.push('email_verified=is.true')
  else if (f.email !== 'any') c.push(`email_status=eq.${f.email}`)
  if (f.fit === 'strong') c.push(`fit_score=gte.${FIT_BANDS.strong}`)
  else if (f.fit === 'good') c.push(`fit_score=gte.${FIT_BANDS.good}`, `fit_score=lt.${FIT_BANDS.strong}`)
  else if (f.fit === 'weak') c.push(`or=(fit_score.is.null,fit_score.lt.${FIT_BANDS.good})`)
  if (f.action !== 'any') c.push(`recommended_action=eq.${f.action}`)
  if (f.hasContact === 'yes') c.push('contact_count=gte.1')
  else if (f.hasContact === 'no') c.push('contact_count=eq.0')
  if (f.added !== 'any') c.push(`created_at=gte.${addedSince(f.added)}`)
  if (f.q) {
    const like = `*${f.q}*`
    c.push(`or=(company.ilike.${like},domain.ilike.${like},contact_name.ilike.${like},contact_email.ilike.${like},industry.ilike.${like})`)
  }
  return c.map(x => {
    const i = x.indexOf('=')
    return `${x.slice(0, i)}=${encodeURIComponent(x.slice(i + 1)).replace(/%2C/g, ',').replace(/%28/g, '(').replace(/%29/g, ')').replace(/%2A/g, '*').replace(/%3A/g, ':')}`
  })
}

export function orderClause(f: LeadFilters): string {
  switch (f.sort) {
    case 'fit_desc': return 'order=fit_score.desc.nullslast,total_score.desc.nullslast,id.asc'
    case 'intent_desc': return 'order=intent_score.desc.nullslast,total_score.desc.nullslast,id.asc'
    case 'newest': return 'order=created_at.desc,id.asc'
    case 'company_asc': return 'order=company.asc.nullslast,id.asc'
    default: return 'order=total_score.desc.nullslast,id.asc'
  }
}

/** The full leads_unified query path for a page of the table. */
export function leadsListPath(f: LeadFilters, columns = LIST_COLUMNS): string {
  const offset = (f.page - 1) * f.pageSize
  return `leads_unified?select=${columns}&${[...filterClauses(f), orderClause(f), `limit=${f.pageSize}`, `offset=${offset}`].join('&')}`
}
