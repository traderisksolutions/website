/**
 * Thin Supabase REST helpers for the CRM library. Server-side only (service key).
 *
 * Two flavours on purpose:
 *   - sb()    throws on any non-2xx, for writes and for reads the caller cannot do without.
 *   - sbTry() returns a fallback instead — used for every read that touches a column or table
 *             added by 20260910_companies_crm.sql, so the app keeps working (with reduced
 *             information) until the migration has been applied on the hosted database.
 */
import { SB_URL, sbHeaders } from '@/lib/sb'
import type { Company, CompanyKind, Stage } from './types'
import { STAGES, COMPANY_KINDS } from './types'

export type Json = Record<string, unknown>
export const enc = encodeURIComponent

export async function sb<T = Json[]>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...sbHeaders(init?.method && init.method !== 'GET' ? 'return=representation' : 'return=minimal'), ...(init?.headers as Record<string, string> ?? {}) },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Supabase ${path.split('?')[0]} failed (${res.status}): ${(await res.text()).slice(0, 300)}`)
  const text = await res.text()
  return (text ? JSON.parse(text) : []) as T
}

export async function sbTry<T>(path: string, fallback: T, init?: RequestInit): Promise<T> {
  try { return await sb<T>(path, init) } catch { return fallback }
}

/** Runs one request per chunk of ids so a PostgREST `in.(...)` filter never overflows the URL. */
export async function inChunks<T>(ids: string[], size: number, fn: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += size) out.push(...await fn(ids.slice(i, i + size)))
  return out
}

// ── Email helpers ─────────────────────────────────────────────────────────────────────────────

export const TRS_DOMAIN = 'trade-risksol.com'
/** Our own addresses. The unhyphenated spelling is in use too, and without it TRS gets treated
 *  as an outside organisation and given a company record of its own. */
export const TRS_DOMAINS = new Set([TRS_DOMAIN, 'traderisksol.com'])

export const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.com.sg', 'hotmail.com', 'hotmail.sg', 'outlook.com',
  'outlook.sg', 'live.com', 'icloud.com', 'me.com', 'ymail.com', 'protonmail.com', 'proton.me', 'qq.com', '163.com',
])

export function emailDomain(email: string | null | undefined): string {
  const m = /@([\w.-]+)/.exec(email ?? '')
  return m ? m[1].toLowerCase() : ''
}

export const isInternal = (email: string | null | undefined) => TRS_DOMAINS.has(emailDomain(email))

export function isAutomated(email: string | null | undefined): boolean {
  const l = (email ?? '').toLowerCase()
  return l.includes('noreply') || l.includes('no-reply') || l.includes('donotreply') || l.includes('do-not-reply') ||
         l.includes('mailer-daemon') || l.includes('postmaster') || l.includes('notification') || l.endsWith('@google.com')
}

/** "Jane Doe <jane@x.com>" → "jane@x.com" (already-bare addresses pass through). */
export function bareEmail(addr: string | null | undefined): string {
  const m = /<([^>]+)>/.exec(addr ?? '')
  return (m ? m[1] : (addr ?? '')).trim().toLowerCase()
}

export function displayNameFromAddress(addr: string | null | undefined): string | null {
  const m = /^\s*"?([^"<]+?)"?\s*</.exec(addr ?? '')
  return m ? m[1].trim() : null
}

// ── Company row normalisation ─────────────────────────────────────────────────────────────────

/** The live table's name column is `company_name`; the CRM columns may not exist yet. Read
 *  with select=* and normalise here so no caller has to know either fact. */
export function normalizeCompany(row: Json): Company {
  const stage = String(row.stage ?? 'client')
  const kind  = String(row.kind ?? 'client')
  const rawDomains = Array.isArray(row.domains) ? (row.domains as unknown[]).map(d => String(d).toLowerCase()) : []
  const legacyDomain = typeof row.domain === 'string' && row.domain.trim() ? row.domain.trim().toLowerCase() : null
  const domains = Array.from(new Set([...rawDomains, ...(legacyDomain && rawDomains.length === 0 ? [legacyDomain] : [])]))
  return {
    id:               String(row.id),
    name:             String(row.company_name ?? row.name ?? ''),
    kind:             (COMPANY_KINDS as readonly string[]).includes(kind) ? kind as CompanyKind : 'client',
    stage:            (STAGES as readonly string[]).includes(stage) ? stage as Stage : 'client',
    stage_changed_at: (row.stage_changed_at as string | null) ?? null,
    owner_email:      (row.owner_email as string | null) ?? null,
    domains,
    domain:           legacyDomain,
    type:             (row.type as string | null) ?? null,
    industry:         (row.industry as string | null) ?? null,
    address:          (row.address as string | null) ?? null,
    notes:            (row.notes as string | null) ?? null,
    source:           (row.source as string | null) ?? null,
    ai_brief:         (row.ai_brief as Company['ai_brief']) ?? null,
    ai_brief_at:      (row.ai_brief_at as string | null) ?? null,
    ai_brief_model:   (row.ai_brief_model as string | null) ?? null,
    created_at:       String(row.created_at ?? ''),
    updated_at:       String(row.updated_at ?? row.created_at ?? ''),
  }
}

export async function getCompany(id: string): Promise<Company | null> {
  const rows = await sbTry<Json[]>(`companies?id=eq.${enc(id)}&select=*&limit=1`, [])
  return rows[0] ? normalizeCompany(rows[0]) : null
}

/** All client companies (the CRM never lists insurers or partners). Falls back to every row
 *  when the `kind` column is not there yet. */
export async function listClientCompanies(): Promise<Company[]> {
  let rows = await sbTry<Json[] | null>(`companies?kind=eq.client&select=*&order=company_name.asc&limit=1000`, null)
  if (rows === null) rows = await sbTry<Json[]>(`companies?select=*&order=company_name.asc&limit=1000`, [])
  return rows.map(normalizeCompany)
}

/** Every contact id belonging to a company: direct FK union the company_contacts junction. */
export async function getCompanyContactIds(companyId: string): Promise<string[]> {
  const [direct, junction] = await Promise.all([
    sbTry<{ id: string }[]>(`contacts?company_id=eq.${enc(companyId)}&select=id`, []),
    sbTry<{ contact_id: string }[]>(`company_contacts?company_id=eq.${enc(companyId)}&select=contact_id`, []),
  ])
  return Array.from(new Set([...direct.map(r => r.id), ...junction.map(r => r.contact_id)]))
}

/** Every thread id belonging to a company: direct company_id union threads whose contact is
 *  one of the company's contacts but whose company_id was never stamped. */
export async function getCompanyThreadIds(companyId: string): Promise<string[]> {
  const contactIds = await getCompanyContactIds(companyId)
  const [direct, viaContact] = await Promise.all([
    sbTry<{ id: string }[]>(`email_threads?company_id=eq.${enc(companyId)}&deleted_at=is.null&select=id&limit=1000`, []),
    contactIds.length
      ? inChunks(contactIds, 100, chunk => sbTry<{ id: string }[]>(`email_threads?contact_id=in.(${chunk.join(',')})&company_id=is.null&deleted_at=is.null&select=id&limit=1000`, []))
      : Promise.resolve([] as { id: string }[]),
  ])
  return Array.from(new Set([...direct.map(r => r.id), ...viaContact.map(r => r.id)]))
}
