/**
 * POST /api/public/hr/[token]/hibob  { serviceUserId, token } → fetchHiBob → draft → { read }
 * The credential is used for this one fetch. It is not stored, not logged, not echoed back.
 */
import { NextRequest } from 'next/server'
import { fetchHiBob } from '@/lib/hr/hibob'
import { HrConnectorError } from '@/lib/hr/connectors'
import { recordEvent, saveDraft } from '@/lib/hr/links'
import { errorMessage, openLink, pjson } from '@/lib/hr/public'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params
  const r = await openLink(params.token)
  if ('response' in r) return r.response
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const s = (k: string) => (typeof body?.[k] === 'string' ? (body[k] as string).trim() : '')
  if (!s('serviceUserId') || s('token').length < 10) return pjson({ error: 'Enter the service user ID and token' }, 400)
  try {
    const read = await fetchHiBob(s('serviceUserId'), s('token'))
    await saveDraft(r.link.id, read, r.link.company_id)
    await recordEvent(r.link.id, 'connected', { source: 'hibob', employees: read.employees.length, dependants: read.dependants.length })
    return pjson({ read })
  } catch (e) {
    const message = e instanceof HrConnectorError ? e.message : 'HiBob could not be read'
    await recordEvent(r.link.id, 'error', { stage: 'hibob', message }).catch(() => {})
    if (!(e instanceof HrConnectorError)) console.error('[hr/hibob]', errorMessage(e))
    return pjson({ error: message }, e instanceof HrConnectorError && (e.status === 401 || e.status === 400) ? e.status : 502)
  }
}
