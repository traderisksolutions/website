/** GET /api/public/hr/[token] → { link, submission } for the HR page. 404 unknown, 410 expired or closed. */
import { NextRequest } from 'next/server'
import { latestSubmission } from '@/lib/hr/links'
import { errorMessage, openLink, pjson, publicLink, publicSubmission } from '@/lib/hr/public'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const r = await openLink(params.token)
  if ('response' in r) return r.response
  try {
    const s = await latestSubmission(r.link.id)
    return pjson({ link: publicLink(r.link), submission: publicSubmission(s && s.status === 'draft' ? s : null) })
  } catch (e) {
    return pjson({ error: errorMessage(e) }, 500)
  }
}
