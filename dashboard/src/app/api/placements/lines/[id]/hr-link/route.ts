/**
 * POST /api/placements/lines/[id]/hr-link { recipient_name, recipient_email, cc_email?, message? }
 *   → { link, url } or { link, url, mailError } when the email did not go.
 * Sends the client's HR the employee-list page for this line's policy. When HR submits, the
 * list is priced on this line (public submit hook).
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createLink, isMigrationPending, MIGRATION_PENDING_LINE, recordEvent } from '@/lib/hr/links'
import { defaultMessage, linkUrl, sendLinkEmail } from '@/lib/hr/email'
import { fileEbCompanyFolder } from '@/lib/company-drive'
import * as store from '@/lib/placement/store'
import { loadLine } from '@/lib/placement/eb'
import { errorResponse, fail, gate, isText, isUuid, readBody } from '@/lib/placement/api'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
type Body = { recipient_name?: unknown; recipient_email?: unknown; cc_email?: unknown; message?: unknown }

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Line id is not valid')
  const b = await readBody<Body>(req)
  if (!b) return fail('Body must be a JSON object')
  if (!isText(b.recipient_name)) return fail('Recipient name is required')
  const recipient_email = typeof b.recipient_email === 'string' ? b.recipient_email.trim().toLowerCase() : ''
  if (!EMAIL_RE.test(recipient_email)) return fail('Recipient email is not valid')
  const cc_email = typeof b.cc_email === 'string' ? b.cc_email.trim().toLowerCase() : ''
  if (cc_email && !EMAIL_RE.test(cc_email)) return fail('Copy email is not valid')
  if (b.message != null && typeof b.message !== 'string') return fail('message must be text')

  try {
    const line = await loadLine(id)
    if (!line) return fail('Line not found', 404)
    if (!line.policy_id) return fail('Policy not created yet — recreate the placement', 409)
    const bundle = await store.loadPlacement(line.placement_id)
    const placement = bundle?.placements[0]
    if (!placement) return fail('Placement not found', 404)
    const company = await store.company(placement.company_id)
    if (!company) return fail('Company not found', 404)

    const input = {
      company_id: company.id, company_name: company.company_name, policy_id: line.policy_id,
      effective_date: placement.inception_date, recipient_name: b.recipient_name.trim(), recipient_email,
      cc_email: cc_email || null, requested_by: null, message: '',
    }
    input.message = (typeof b.message === 'string' && b.message.trim()) || defaultMessage(input)
    const { link, token } = await createLink(input, { email: actor })
    fileEbCompanyFolder(company.company_name)
    await store.log({ company_id: company.id, placement_id: placement.id, line_id: line.id, kind: 'sent', actor,
      text: `Employee list requested from ${link.recipient_name} (${link.recipient_email}), link ${link.reference}`, detail: { hr_link_id: link.id } })
    await store.patch('placement_lines', `id=eq.${line.id}`, { next_step: `Waiting for the employee list from ${link.recipient_name}` })
    try {
      await sendLinkEmail(link, token, { email: actor })
      return NextResponse.json({ link, url: linkUrl(token) }, { status: 201 })
    } catch (e) {
      const mailError = e instanceof Error ? e.message : 'Mail send failed'
      await recordEvent(link.id, 'error', { stage: 'send', message: mailError }).catch(() => {})
      return NextResponse.json({ link, url: linkUrl(token), mailError }, { status: 201 })
    }
  } catch (e) {
    if (isMigrationPending(e)) return fail(MIGRATION_PENDING_LINE, 503)
    return errorResponse(e)
  }
}
