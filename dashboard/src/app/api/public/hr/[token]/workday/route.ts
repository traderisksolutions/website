/**
 * POST /api/public/hr/[token]/workday  { tenantHost, tenant, username, password } → fetchWorkday → draft → { read }
 * The password is used for this one fetch. It is not stored, not logged, not echoed back.
 */
import { NextRequest } from 'next/server'
import { fetchWorkday } from '@/lib/hr/workday'
import { HrConnectorError } from '@/lib/hr/connectors'
import { recordEvent, saveDraft } from '@/lib/hr/links'
import { errorMessage, openLink, pjson } from '@/lib/hr/public'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const HOST_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i
const TENANT_RE = /^[a-z0-9_-]{2,64}$/i

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const r = await openLink(params.token)
  if ('response' in r) return r.response
  const b = await req.json().catch(() => null) as Record<string, unknown> | null
  const str = (k: string) => (typeof b?.[k] === 'string' ? (b[k] as string).trim() : '')
  const tenantHost = str('tenantHost').replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase()
  const tenant = str('tenant')
  const username = str('username')
  const password = str('password')
  if (!HOST_RE.test(tenantHost)) return pjson({ error: 'Tenant host must look like wd3.myworkday.com' }, 400)
  if (!TENANT_RE.test(tenant)) return pjson({ error: 'Tenant id is missing' }, 400)
  if (!username) return pjson({ error: 'Integration user is missing' }, 400)
  if (!password) return pjson({ error: 'Password is missing' }, 400)
  try {
    const read = await fetchWorkday({ tenantHost, tenant, username, password })
    await saveDraft(r.link.id, read, r.link.company_id)
    await recordEvent(r.link.id, 'connected', { source: 'workday', tenantHost, employees: read.employees.length, dependants: read.dependants.length })
    return pjson({ read })
  } catch (e) {
    const message = e instanceof HrConnectorError ? e.message : 'Workday could not be read'
    await recordEvent(r.link.id, 'error', { stage: 'workday', tenantHost, message }).catch(() => {})
    if (!(e instanceof HrConnectorError)) console.error('[hr/workday]', errorMessage(e).replace(password, '[password]'))
    return pjson({ error: message }, e instanceof HrConnectorError && (e.status === 401 || e.status === 403) ? 401 : 502)
  }
}
