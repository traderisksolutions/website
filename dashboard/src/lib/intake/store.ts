/**
 * Website intake: what buyers submit on the business's own sites (corpcover.com Find first).
 * Server only. Rows live in site_intakes (Cloud SQL via PostgREST), one per submission id.
 */
import 'server-only'
import { enc, isUuid, sb, sbCount } from '@/lib/sales/db'

export const INTAKE_STATUSES = ['partial', 'submitted', 'contacted', 'met', 'quoted', 'won', 'lost'] as const
export type IntakeStatus = (typeof INTAKE_STATUSES)[number]
export const STATUS_LABEL: Record<IntakeStatus, string> = {
  partial: 'Unfinished', submitted: 'New', contacted: 'Contacted', met: 'Met', quoted: 'Quoted', won: 'Won', lost: 'Lost',
}

export type Site = { id: string; key: string; name: string; domain: string }
export type IntakeRow = {
  id: string; site_id: string; kind: string; status: IntakeStatus
  company_name: string | null; contact_name: string | null; email: string | null; phone: string | null; industry: string | null
  product_requests: { product: string; chubb_form?: string; chubb_table_premium?: number | null }[]
  flags: string[]; booking: { day?: string; time?: string; format?: string; tz?: string } | null
  owner_email: string | null; submitted_at: string | null; created_at: string; updated_at: string
}
export type IntakeDetail = IntakeRow & {
  answers: Record<string, unknown>; proposal_fields: Record<string, Record<string, number>>
  documents: { kind?: string; name?: string; bytes?: number }[]; consent_pdpa_at: string | null
  source_url: string | null; note: string | null; company_id: string | null
}

const LIST_COLS = 'id,site_id,kind,status,company_name,contact_name,email,phone,industry,product_requests,flags,booking,owner_email,submitted_at,created_at,updated_at'

let sitesCache: { at: number; sites: Site[] } | null = null
export async function listSites(): Promise<Site[]> {
  if (sitesCache && Date.now() - sitesCache.at < 300_000) return sitesCache.sites
  const sites = await sb<Site[]>('marketing_sites?select=id,key,name,domain&order=sort_order.asc')
  sitesCache = { at: Date.now(), sites }
  return sites
}

// ---------- public intake ----------

const s = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim().slice(0, max)
  return t || null
}
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PUBLIC_STATUSES = new Set(['partial', 'submitted'])
const KINDS = new Set(['find', 'review', 'enquiry', 'chat'])

/** Cap a JSON value's serialised size; anything larger is dropped rather than truncated mid-structure. */
const capJson = <T>(v: unknown, max: number, fallback: T): T => {
  try { return v !== undefined && JSON.stringify(v).length <= max ? (v as T) : fallback } catch { return fallback }
}

export type IntakeInput = Record<string, unknown>

/** Validate and save one submission. Returns an error message, or null on success. */
export async function saveIntake(body: IntakeInput, meta: { userAgent: string | null }): Promise<string | null> {
  const id = typeof body.id === 'string' ? body.id : ''
  if (!isUuid(id)) return 'id must be a uuid'
  const site = (await listSites()).find(x => x.key === body.site)
  if (!site) return 'unknown site'
  const kind = typeof body.kind === 'string' && KINDS.has(body.kind) ? body.kind : 'find'
  const status = typeof body.status === 'string' && PUBLIC_STATUSES.has(body.status) ? body.status : 'partial'
  const client = (body.client && typeof body.client === 'object' ? body.client : {}) as Record<string, unknown>
  const email = s(client.email, 200)
  if (email && !EMAIL.test(email)) return 'email is not valid'
  if (status === 'submitted' && (!email || !s(client.company_name, 200) || !s(client.phone, 40))) return 'company name, email and phone are required to submit'

  const existing = (await sb<{ status: IntakeStatus; site_id: string; submitted_at: string | null }[]>(`site_intakes?id=eq.${id}&select=status,site_id,submitted_at&limit=1`))[0]
  if (existing && existing.site_id !== site.id) return 'id belongs to another site'
  // A buyer re-saving never moves a row backwards once staff have started on it.
  const nextStatus = existing && !PUBLIC_STATUSES.has(existing.status) ? existing.status : existing?.status === 'submitted' ? 'submitted' : status
  const now = new Date().toISOString()
  const row = {
    id, site_id: site.id, kind, status: nextStatus,
    company_name: s(client.company_name, 200), contact_name: s(client.contact_name, 200), email: email?.toLowerCase() ?? null,
    phone: s(client.phone, 40), industry: s(client.industry, 60),
    answers: capJson(body.answers, 60_000, {}), product_requests: capJson(body.product_requests, 20_000, []),
    flags: Array.isArray(body.flags) ? body.flags.filter((f): f is string => typeof f === 'string').slice(0, 30).map(f => f.slice(0, 60)) : [],
    proposal_fields: capJson(body.proposal_fields, 20_000, {}), documents: capJson(body.documents, 10_000, []),
    booking: capJson(body.booking, 2_000, null),
    consent_pdpa_at: body.consent_pdpa === true ? now : null,
    source_url: s(body.source_url, 500), user_agent: meta.userAgent?.slice(0, 300) ?? null,
    submitted_at: existing?.submitted_at ?? (status === 'submitted' ? now : null),
    updated_at: now,
  }
  await sb('site_intakes?on_conflict=id', { method: 'POST', prefer: 'return=minimal,resolution=merge-duplicates', body: JSON.stringify(row) })
  return null
}

// ---------- staff views ----------

export async function intakeCounts(): Promise<Record<string, { total: number; open: number }>> {
  const sites = await listSites()
  const out: Record<string, { total: number; open: number }> = {}
  await Promise.all(sites.map(async site => {
    const [total, open] = await Promise.all([
      sbCount(`site_intakes?site_id=eq.${site.id}`),
      sbCount(`site_intakes?site_id=eq.${site.id}&status=eq.submitted`),
    ])
    out[site.key] = { total, open }
  }))
  return out
}

export async function listIntakes(siteKey: string, opts: { status?: string; q?: string }): Promise<IntakeRow[]> {
  const site = (await listSites()).find(x => x.key === siteKey)
  if (!site) return []
  const filters = [`site_id=eq.${site.id}`]
  if (opts.status && (INTAKE_STATUSES as readonly string[]).includes(opts.status)) filters.push(`status=eq.${opts.status}`)
  else if (opts.status === 'open') filters.push('status=in.(submitted,contacted,met,quoted)')
  const q = opts.q?.trim().replace(/[(),*]/g, ' ').slice(0, 80)
  if (q) filters.push(`or=(company_name.ilike.*${enc(q)}*,contact_name.ilike.*${enc(q)}*,email.ilike.*${enc(q)}*,phone.ilike.*${enc(q)}*)`)
  return sb<IntakeRow[]>(`site_intakes?${filters.join('&')}&select=${LIST_COLS}&order=updated_at.desc&limit=500`)
}

export async function getIntake(id: string): Promise<IntakeDetail | null> {
  if (!isUuid(id)) return null
  return (await sb<IntakeDetail[]>(`site_intakes?id=eq.${id}&select=*&limit=1`))[0] ?? null
}

export async function updateIntake(id: string, patch: { status?: unknown; owner_email?: unknown; note?: unknown }): Promise<string | null> {
  if (!isUuid(id)) return 'not found'
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.status !== undefined) {
    if (typeof patch.status !== 'string' || !(INTAKE_STATUSES as readonly string[]).includes(patch.status) || patch.status === 'partial') return 'invalid status'
    row.status = patch.status
  }
  if (patch.owner_email !== undefined) row.owner_email = patch.owner_email === null ? null : s(patch.owner_email, 200)
  if (patch.note !== undefined) row.note = patch.note === null ? null : s(patch.note, 4000)
  await sb(`site_intakes?id=eq.${id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify(row) })
  return null
}
