/** POST /api/group-benefits/hr-links/[id]/resend → new token and expiry, email sent again → { link } or { link, mailError } */
import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/marketing/auth'
import { isMigrationPending, MIGRATION_PENDING_LINE, recordEvent, resend } from '@/lib/hr/links'
import { linkUrl, sendLinkEmail } from '@/lib/hr/email'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const who = await actor(req)
  if (who instanceof Response) return who
  try {
    const r = await resend(params.id, who)
    if (!r) return json({ error: 'Link not found' }, 404)
    try {
      await sendLinkEmail(r.link, r.token, who)
      return json({ link: r.link, url: linkUrl(r.token) })
    } catch (e) {
      const mailError = e instanceof Error ? e.message : 'Mail send failed'
      await recordEvent(r.link.id, 'error', { stage: 'resend', message: mailError }).catch(() => {})
      return json({ link: r.link, mailError, url: linkUrl(r.token) })
    }
  } catch (e) {
    if (isMigrationPending(e)) return json({ error: MIGRATION_PENDING_LINE, migrationPending: true }, 503)
    return json({ error: e instanceof Error ? e.message : 'failed' }, 400)
  }
}
