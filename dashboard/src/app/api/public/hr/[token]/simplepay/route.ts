/**
 * POST /api/public/hr/[token]/simplepay  { key, companyId? } → fetchSimplePay → draft → { read }
 * With several companies on the key and no companyId: 409 { companies } so HR can pick one.
 * The SimplePay key is used for this one fetch. It is not stored, not logged, not echoed back.
 */
import { NextRequest } from 'next/server'
import { fetchSimplePay, SimplePayChooseCompany } from '@/lib/hr/simplepay'
import { HrConnectorError } from '@/lib/hr/connectors'
import { recordEvent, saveDraft } from '@/lib/hr/links'
import { errorMessage, openLink, pjson } from '@/lib/hr/public'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params
  const r = await openLink(params.token)
  if ('response' in r) return r.response
  const body = await req.json().catch(() => null) as { key?: unknown; companyId?: unknown } | null
  const apiKey = typeof body?.key === 'string' ? body.key.trim() : ''
  const companyId = typeof body?.companyId === 'string' && body.companyId.trim() ? body.companyId.trim() : null
  if (apiKey.length < 10) return pjson({ error: 'Paste the SimplePay API key' }, 400)
  try {
    const read = await fetchSimplePay(apiKey, companyId)
    await saveDraft(r.link.id, read, r.link.company_id)
    await recordEvent(r.link.id, 'connected', { source: 'simplepay', company: read.company.name, employees: read.employees.length })
    return pjson({ read })
  } catch (e) {
    if (e instanceof SimplePayChooseCompany) return pjson({ error: e.message, companies: e.companies }, 409)
    const message = e instanceof HrConnectorError ? e.message : 'SimplePay could not be read'
    await recordEvent(r.link.id, 'error', { stage: 'simplepay', message }).catch(() => {})
    if (!(e instanceof HrConnectorError)) console.error('[hr/simplepay]', errorMessage(e))
    return pjson({ error: message }, e instanceof HrConnectorError && e.status === 401 ? 401 : 502)
  }
}
