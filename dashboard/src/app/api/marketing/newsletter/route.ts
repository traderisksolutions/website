import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/marketing/auth'
import { createIssue, getNlSite, listNlSites, overview, sendPendingConfirmations, setSender } from '@/lib/newsletter/store'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** GET ?site= → subscribers, issues, articles, sender state for one site, plus the site list. */
export async function GET(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  try {
    const [sites, site] = await Promise.all([listNlSites(), getNlSite(req.nextUrl.searchParams.get('site') ?? 'corpcover')])
    if (!site) return json({ error: 'Site not found' }, 404)
    return json({ site, sites: sites.map(s => ({ key: s.key, name: s.name })), ...(await overview(site)) })
  } catch (e) {
    console.error('newsletter overview failed', e instanceof Error ? e.message : e)
    return json({ error: 'Could not load the newsletter' }, 500)
  }
}

/** POST { site, action: 'create' | 'sender' | 'confirmations', sender_email?, sender_name? } */
export async function POST(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'Body must be JSON' }, 400) }
  try {
    const site = await getNlSite(typeof body.site === 'string' ? body.site : 'corpcover')
    if (!site) return json({ error: 'Site not found' }, 404)
    if (body.action === 'create') return json({ issue: await createIssue(site, who.email) })
    if (body.action === 'sender') { const err = await setSender(site, body); return err ? json({ error: err }, 422) : json({ ok: true }) }
    if (body.action === 'confirmations') { const r = await sendPendingConfirmations(site); return 'error' in r ? json(r, 422) : json(r) }
    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    console.error('newsletter action failed', e instanceof Error ? e.message : e)
    return json({ error: 'Could not complete that' }, 500)
  }
}
