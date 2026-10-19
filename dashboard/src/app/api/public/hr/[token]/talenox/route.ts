/**
 * POST /api/public/hr/[token]/talenox  { token } → fetchTalenox → draft → { read }
 * The Talenox token is used for this one fetch. It is not stored, not logged, not echoed back.
 */
import { NextRequest } from 'next/server'
import { fetchTalenox } from '@/lib/hr/talenox'
import { HrConnectorError } from '@/lib/hr/connectors'
import { recordEvent, saveDraft } from '@/lib/hr/links'
import { errorMessage, openLink, pjson } from '@/lib/hr/public'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const r = await openLink(params.token)
  if ('response' in r) return r.response
  const body = await req.json().catch(() => null) as { token?: unknown } | null
  const apiToken = typeof body?.token === 'string' ? body.token.trim() : ''
  if (apiToken.length < 10) return pjson({ error: 'Paste the Talenox API token' }, 400)
  try {
    const read = await fetchTalenox(apiToken)
    await saveDraft(r.link.id, read, r.link.company_id)
    await recordEvent(r.link.id, 'connected', { source: 'talenox', employees: read.employees.length, dependants: read.dependants.length })
    return pjson({ read })
  } catch (e) {
    const message = e instanceof HrConnectorError ? e.message : 'Talenox could not be read'
    await recordEvent(r.link.id, 'error', { stage: 'talenox', message }).catch(() => {})
    if (!(e instanceof HrConnectorError)) console.error('[hr/talenox]', errorMessage(e))
    return pjson({ error: message }, e instanceof HrConnectorError && e.status === 401 ? 401 : 502)
  }
}
