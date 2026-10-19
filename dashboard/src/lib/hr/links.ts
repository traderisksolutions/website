// HR Connect: the link lifecycle. One link per request for an employee list; a token the HR
// contact holds, a hashed copy here, events for the timeline, one draft submission that becomes
// the submitted list.
//
// Lag rule: the dashboard may deploy before migration 20261019_hr_connect is applied. Callers
// catch with isMigrationPending() and answer { migrationPending: true }.
import { enc, isUuid, sb } from '@/lib/sales/db'
import type { HrLink, HrLinkEvent, HrList, HrRead, HrSource, HrSubmission } from './types'
import { expiryFrom, hashToken, isLinkExpired, makeToken, nextReference } from './tokens'

export const MIGRATION_PENDING_LINE = 'Migration 20261019_hr_connect is not applied yet.'

/** A PostgREST error for a table the migration has not created yet. */
export function isMigrationPending(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e)
  return /does not exist|42P01|PGRST205/i.test(m)
}

const isConflict = (e: unknown) => e instanceof Error && /\(409\)|23505/.test(e.message)

/** Every column except token_hash. The hash never leaves this module. */
const LINK_COLS = 'id,reference,company_id,company_name,quotation_id,effective_date,recipient_name,recipient_email,cc_email,requested_by,message,status,sent_by,sent_at,expires_at,opened_at,submitted_at,created_at,updated_at'
const SUB_COLS = 'id,link_id,company_id,source,source_meta,employees,dependants,employee_count,dependant_count,status,submitted_by_name,submitted_by_email,consent_text,consent_at,created_at,updated_at'

export type CreateLinkInput = {
  company_id?: string | null
  company_name: string
  quotation_id?: string | null
  effective_date?: string | null
  recipient_name: string
  recipient_email: string
  cc_email?: string | null
  requested_by?: string | null
  message?: string | null
}

async function addEvent(linkId: string, kind: HrLinkEvent['kind'], detail: Record<string, unknown> = {}): Promise<void> {
  await sb('hr_link_events', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify({ link_id: linkId, kind, detail }) })
}

async function highestReference(year: number): Promise<string | null> {
  const rows = await sb<{ reference: string }[]>(`hr_links?reference=like.${enc(`GB-${year}-%`)}&select=reference&order=reference.desc&limit=1`)
  return rows[0]?.reference ?? null
}

/** Creates the link and its `sent` event. Returns the one-time token; only its hash is stored. */
export async function createLink(input: CreateLinkInput, actor: { email: string }): Promise<{ link: HrLink; token: string }> {
  const token = makeToken()
  const now = new Date()
  const year = now.getUTCFullYear()
  const row = {
    company_id: isUuid(input.company_id) ? input.company_id : null,
    company_name: input.company_name.trim(),
    quotation_id: isUuid(input.quotation_id) ? input.quotation_id : null,
    effective_date: input.effective_date || null,
    recipient_name: input.recipient_name.trim(),
    recipient_email: input.recipient_email.trim().toLowerCase(),
    cc_email: input.cc_email?.trim().toLowerCase() || null,
    requested_by: input.requested_by?.trim() || null,
    message: input.message ?? '',
    token_hash: hashToken(token),
    status: 'sent',
    sent_by: actor.email,
    sent_at: now.toISOString(),
    expires_at: expiryFrom(now),
  }
  let link: HrLink | undefined
  // Two senders at the same second can pick the same number; the unique index says so and we go once more.
  for (let attempt = 0; attempt < 2 && !link; attempt++) {
    const reference = nextReference(await highestReference(year), year)
    try {
      link = (await sb<HrLink[]>(`hr_links?select=${LINK_COLS}`, { method: 'POST', body: JSON.stringify({ ...row, reference }) }))[0]
    } catch (e) {
      if (!isConflict(e) || attempt === 1) throw e
    }
  }
  if (!link) throw new Error('hr_links insert returned no row')
  await addEvent(link.id, 'sent', { to: link.recipient_email, cc: link.cc_email, by: actor.email })
  return { link, token }
}

/** The link a token opens, or null. Marks the first open; marks an overdue link expired. */
export async function linkByToken(token: string): Promise<{ link: HrLink; expired: boolean } | null> {
  const rows = await sb<HrLink[]>(`hr_links?token_hash=eq.${hashToken(token)}&select=${LINK_COLS}&limit=1`)
  const link = rows[0]
  if (!link) return null
  const now = new Date()
  const expired = isLinkExpired(link, now)
  if (expired && (link.status === 'sent' || link.status === 'opened')) {
    await sb(`hr_links?id=eq.${link.id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ status: 'expired', updated_at: now.toISOString() }) })
    await addEvent(link.id, 'expired', {})
    return { link: { ...link, status: 'expired' }, expired: true }
  }
  if (!expired && link.status === 'sent') {
    const opened_at = now.toISOString()
    await sb(`hr_links?id=eq.${link.id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ status: 'opened', opened_at, updated_at: opened_at }) })
    await addEvent(link.id, 'opened', {})
    return { link: { ...link, status: 'opened', opened_at }, expired: false }
  }
  return { link, expired }
}

export async function listLinks(filter: { company_id?: string | null } = {}): Promise<HrLink[]> {
  const where = isUuid(filter.company_id) ? `&company_id=eq.${filter.company_id}` : ''
  return sb<HrLink[]>(`hr_links?select=${LINK_COLS}${where}&order=created_at.desc&limit=500`)
}

export async function getLink(id: string): Promise<{ link: HrLink; events: HrLinkEvent[]; submission: HrSubmission | null } | null> {
  if (!isUuid(id)) return null
  const link = (await sb<HrLink[]>(`hr_links?id=eq.${id}&select=${LINK_COLS}&limit=1`))[0]
  if (!link) return null
  const [events, submission] = await Promise.all([
    sb<HrLinkEvent[]>(`hr_link_events?link_id=eq.${id}&select=id,link_id,kind,detail,created_at&order=created_at.asc`),
    latestSubmission(id),
  ])
  return { link, events, submission }
}

/** A new token and a new 7-day window; the old token stops working at once. */
export async function resend(id: string, actor: { email: string }): Promise<{ link: HrLink; token: string } | null> {
  if (!isUuid(id)) return null
  const current = (await sb<HrLink[]>(`hr_links?id=eq.${id}&select=${LINK_COLS}&limit=1`))[0]
  if (!current) return null
  if (current.status === 'submitted') throw new Error('The list has been submitted; this link cannot be resent')
  const token = makeToken()
  const now = new Date()
  const patch = { token_hash: hashToken(token), status: 'sent', sent_by: actor.email, sent_at: now.toISOString(), expires_at: expiryFrom(now), opened_at: null, updated_at: now.toISOString() }
  const link = (await sb<HrLink[]>(`hr_links?id=eq.${id}&select=${LINK_COLS}`, { method: 'PATCH', body: JSON.stringify(patch) }))[0]
  await addEvent(id, 'resent', { to: link.recipient_email, cc: link.cc_email, by: actor.email })
  return { link, token }
}

export async function closeLink(id: string, actor: { email: string }): Promise<HrLink | null> {
  if (!isUuid(id)) return null
  const now = new Date().toISOString()
  const link = (await sb<HrLink[]>(`hr_links?id=eq.${id}&status=neq.submitted&select=${LINK_COLS}`, { method: 'PATCH', body: JSON.stringify({ status: 'closed', updated_at: now }) }))[0]
  if (!link) return (await sb<HrLink[]>(`hr_links?id=eq.${id}&select=${LINK_COLS}&limit=1`))[0] ?? null
  await addEvent(id, 'closed', { by: actor.email })
  return link
}

export async function latestSubmission(linkId: string): Promise<HrSubmission | null> {
  const rows = await sb<HrSubmission[]>(`hr_submissions?link_id=eq.${linkId}&select=${SUB_COLS}&order=updated_at.desc&limit=1`)
  return rows[0] ?? null
}

async function draftFor(linkId: string): Promise<HrSubmission | null> {
  const rows = await sb<HrSubmission[]>(`hr_submissions?link_id=eq.${linkId}&status=eq.draft&select=${SUB_COLS}&order=updated_at.desc&limit=1`)
  return rows[0] ?? null
}

/**
 * The single draft row for a link: created on the first read, replaced on every later one.
 * A connector or file read brings its source and meta; HR's edits on the review page bring only
 * the two lists and keep the source they came from.
 */
export async function saveDraft(linkId: string, read: HrList & Partial<Pick<HrRead, 'source' | 'meta'>>, companyId: string | null = null): Promise<HrSubmission> {
  const now = new Date().toISOString()
  const existing = await draftFor(linkId)
  const body: Record<string, unknown> = {
    employees: read.employees,
    dependants: read.dependants,
    employee_count: read.employees.length,
    dependant_count: read.dependants.length,
    updated_at: now,
  }
  if (read.source) body.source = read.source
  if (read.meta) body.source_meta = read.meta
  if (existing) {
    return (await sb<HrSubmission[]>(`hr_submissions?id=eq.${existing.id}&select=${SUB_COLS}`, { method: 'PATCH', body: JSON.stringify(body) }))[0]
  }
  const insert = { link_id: linkId, company_id: companyId, source: (read.source ?? 'manual') as HrSource, source_meta: read.meta ?? {}, status: 'draft', ...body }
  return (await sb<HrSubmission[]>(`hr_submissions?select=${SUB_COLS}`, { method: 'POST', body: JSON.stringify(insert) }))[0]
}

export async function recordEvent(linkId: string, kind: HrLinkEvent['kind'], detail: Record<string, unknown> = {}): Promise<void> {
  await addEvent(linkId, kind, detail)
}

/** Submits the draft: both rows go to `submitted`, and the link accepts no more edits. */
export async function submit(linkId: string, by: { name: string; email: string; consent: boolean; consentText: string }): Promise<{ link: HrLink; submission: HrSubmission }> {
  if (!by.consent) throw new Error('Consent is required')
  const draft = await draftFor(linkId)
  if (!draft) throw new Error('Nothing has been provided yet')
  if (draft.employees.length === 0) throw new Error('The list has no employees')
  const now = new Date().toISOString()
  const submission = (await sb<HrSubmission[]>(`hr_submissions?id=eq.${draft.id}&select=${SUB_COLS}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'submitted', submitted_by_name: by.name.trim(), submitted_by_email: by.email.trim().toLowerCase(), consent_text: by.consentText, consent_at: now, updated_at: now }),
  }))[0]
  const link = (await sb<HrLink[]>(`hr_links?id=eq.${linkId}&select=${LINK_COLS}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'submitted', submitted_at: now, updated_at: now }),
  }))[0]
  await addEvent(linkId, 'submitted', { employees: submission.employee_count, dependants: submission.dependant_count, by: submission.submitted_by_email })
  return { link, submission }
}
