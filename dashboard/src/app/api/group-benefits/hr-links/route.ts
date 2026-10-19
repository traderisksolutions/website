/**
 * HR Connect links, dashboard side.
 *   GET  ?company_id=   → { links, migrationPending }
 *   POST { company_id?, company_name, quotation_id?, effective_date?, recipient_name, recipient_email,
 *          cc_email?, requested_by?, message? }
 *        → creates the link, emails HR, { link } — or { link, mailError } when the mail did not go.
 */
import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/marketing/auth'
import { createLink, isMigrationPending, listLinks, MIGRATION_PENDING_LINE, recordEvent } from '@/lib/hr/links'
import { defaultMessage, sendLinkEmail, linkUrl } from '@/lib/hr/email'
import { toIsoDate } from '@/lib/dates/dob'

export const dynamic = 'force-dynamic'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function GET(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  try {
    const links = await listLinks({ company_id: req.nextUrl.searchParams.get('company_id') })
    return json({ links, migrationPending: false })
  } catch (e) {
    if (isMigrationPending(e)) return json({ links: [], migrationPending: true, message: MIGRATION_PENDING_LINE })
    return json({ error: e instanceof Error ? e.message : 'failed' }, 500)
  }
}

export async function POST(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const b = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!b) return json({ error: 'Body must be JSON' }, 400)
  const str = (k: string) => (typeof b[k] === 'string' ? (b[k] as string).trim() : '')

  const company_name = str('company_name')
  const recipient_name = str('recipient_name')
  const recipient_email = str('recipient_email').toLowerCase()
  const cc_email = str('cc_email').toLowerCase()
  if (!company_name) return json({ error: 'Company name is required' }, 400)
  if (!recipient_name) return json({ error: 'Recipient name is required' }, 400)
  if (!EMAIL_RE.test(recipient_email)) return json({ error: 'Recipient email is not valid' }, 400)
  if (cc_email && !EMAIL_RE.test(cc_email)) return json({ error: 'Copy email is not valid' }, 400)
  const effective_date = str('effective_date') ? toIsoDate(str('effective_date')) : null
  if (str('effective_date') && !effective_date) return json({ error: 'Effective date is unreadable; use YYYY-MM-DD or DD/MM/YYYY' }, 400)

  const input = {
    company_id: str('company_id') || null,
    company_name,
    quotation_id: str('quotation_id') || null,
    effective_date,
    recipient_name,
    recipient_email,
    cc_email: cc_email || null,
    requested_by: str('requested_by') || null,
    message: '',
  }
  input.message = str('message') || defaultMessage(input)

  try {
    const { link, token } = await createLink(input, who)
    try {
      await sendLinkEmail(link, token, who)
      return json({ link, url: linkUrl(token) })
    } catch (e) {
      const mailError = e instanceof Error ? e.message : 'Mail send failed'
      await recordEvent(link.id, 'error', { stage: 'send', message: mailError }).catch(() => {})
      return json({ link, mailError, url: linkUrl(token) })
    }
  } catch (e) {
    if (isMigrationPending(e)) return json({ error: MIGRATION_PENDING_LINE, migrationPending: true }, 503)
    return json({ error: e instanceof Error ? e.message : 'failed' }, 500)
  }
}
