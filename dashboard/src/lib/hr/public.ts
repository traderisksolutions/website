// HR Connect: what every public route does first. The token in the path is the credential:
// shape-checked, rate-limited, looked up by hash. Unknown → 404, expired or closed → 410.
// Responses never carry token_hash, sent_by, or anyone's email but the recipient's own.
import { NextResponse } from 'next/server'
import type { HrLink, HrSubmission } from './types'
import { isMigrationPending, latestSubmission, linkByToken, MIGRATION_PENDING_LINE } from './links'
import { isToken } from './tokens'
import { allowRequest } from './rate-limit'

export const NO_STORE = { 'Cache-Control': 'private, no-store' }
export const pjson = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

export type PublicLink = {
  reference: string
  company_name: string
  effective_date: string | null
  recipient_name: string
  requested_by: string | null
  expires_at: string
  status: HrLink['status']
}

export const publicLink = (l: HrLink): PublicLink => ({
  reference: l.reference,
  company_name: l.company_name,
  effective_date: l.effective_date,
  recipient_name: l.recipient_name,
  requested_by: l.requested_by,
  expires_at: l.expires_at,
  status: l.status,
})

/** The body of a 410: enough for the page to say what happened and who to contact. */
export async function closedBody(link: HrLink) {
  const reason = link.status === 'submitted' ? 'submitted' : link.status === 'closed' ? 'closed' : 'expired'
  const out: Record<string, unknown> = { error: reason, reason, link: publicLink(link) }
  if (reason === 'submitted') {
    const s = await latestSubmission(link.id).catch(() => null)
    if (s) out.submission = { employee_count: s.employee_count, dependant_count: s.dependant_count, submitted_by_name: s.submitted_by_name, consent_at: s.consent_at }
  }
  return out
}

/** The link for a token, or the response to send instead. */
export async function openLink(token: string): Promise<{ link: HrLink } | { response: NextResponse }> {
  if (!isToken(token)) return { response: pjson({ error: 'not_found' }, 404) }
  if (!allowRequest(token)) return { response: pjson({ error: 'too_many_requests' }, 429) }
  try {
    const found = await linkByToken(token)
    if (!found) return { response: pjson({ error: 'not_found' }, 404) }
    if (found.expired) return { response: pjson(await closedBody(found.link), 410) }
    return { link: found.link }
  } catch (e) {
    if (isMigrationPending(e)) return { response: pjson({ error: MIGRATION_PENDING_LINE, migrationPending: true }, 503) }
    return { response: pjson({ error: 'failed' }, 500) }
  }
}

/** The submission as HR may see it: their own list, nothing about the link's internals. */
export const publicSubmission = (s: HrSubmission | null) => s && {
  source: s.source,
  source_meta: s.source_meta,
  employees: s.employees,
  dependants: s.dependants,
  employee_count: s.employee_count,
  dependant_count: s.dependant_count,
  status: s.status,
  updated_at: s.updated_at,
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'failed')
