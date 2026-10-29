/**
 * POST /api/public/hr/[token]/submit  { name, email, consent: true } → the draft becomes the list.
 * A receipt goes to HR and a notice to whoever sent the link. → { ok, counts, submitted_at, mailErrors? }
 * When the link belongs to a policy, the list is priced on that policy's placement line; a
 * pricing failure is logged and never changes HR's result.
 */
import { NextRequest } from 'next/server'
import { submit } from '@/lib/hr/links'
import { longDate, sendSubmissionEmails } from '@/lib/hr/email'
import { errorMessage, openLink, pjson } from '@/lib/hr/public'
import { CONSENT_TEXT, toCensus, type HrLink, type HrSubmission } from '@/lib/hr/types'
import { sbTry } from '@/lib/crm/db'
import { coversFromSpec, priceLine } from '@/lib/placement/eb'
import { fillQuotationFromList } from '@/lib/gb/builder'
import type { PlacementLine } from '@/lib/placement/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Prices the submitted list: on the quotation the link was sent from, and on the policy's latest
 *  placement line. Never throws. */
async function priceSubmission(link: HrLink, submission: HrSubmission): Promise<void> {
  if (link.quotation_id) {
    try { await fillQuotationFromList(link.quotation_id, toCensus(submission)) }
    catch (e) { console.error('[hr/submit] quotation pricing failed', link.reference, e instanceof Error ? e.message : e) }
  }
  if (!link.policy_id) return
  try {
    const [line] = await sbTry<PlacementLine[]>(`placement_lines?policy_id=eq.${link.policy_id}&order=created_at.desc&limit=1`, [])
    if (!line) { console.error('[hr/submit] no placement line for policy', link.policy_id, link.reference); return }
    const census = toCensus(submission)
    if (census.length === 0) return
    await priceLine(line.id, { census, covers: coversFromSpec(line.spec), submissionId: submission.id, actor: `hr-link ${link.reference}` })
  } catch (e) {
    console.error('[hr/submit] pricing failed', link.reference, e instanceof Error ? e.message : e)
  }
}

export async function POST(req: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const r = await openLink(params.token)
  if ('response' in r) return r.response
  const b = await req.json().catch(() => null) as { name?: unknown; email?: unknown; consent?: unknown } | null
  const name = typeof b?.name === 'string' ? b.name.trim().slice(0, 200) : ''
  const email = typeof b?.email === 'string' ? b.email.trim().toLowerCase() : ''
  if (!name) return pjson({ error: 'Your name is required' }, 400)
  if (!EMAIL_RE.test(email)) return pjson({ error: 'Your email is not valid' }, 400)
  if (b?.consent !== true) return pjson({ error: 'Tick the consent statement to submit' }, 400)
  try {
    const consentText = CONSENT_TEXT(r.link.company_name, r.link.effective_date ? longDate(r.link.effective_date) : null)
    const { link, submission } = await submit(r.link.id, { name, email, consent: true, consentText })
    const mailErrors = await sendSubmissionEmails(link, submission)
    if (mailErrors.length) console.error('[hr/submit] mail', link.reference, mailErrors.join('; '))
    await priceSubmission(link, submission)
    return pjson({
      ok: true,
      counts: { employees: submission.employee_count, dependants: submission.dependant_count },
      submitted_at: submission.consent_at,
      ...(mailErrors.length ? { mailErrors } : {}),
    })
  } catch (e) {
    return pjson({ error: errorMessage(e) }, 409)
  }
}
