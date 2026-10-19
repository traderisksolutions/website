import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/marketing/auth'
import { body, isResponse, siteFromReq } from '@/lib/marketing/request'
import { MIGRATION_PENDING_LINE, getCurrentVersion, getVersion, isMigrationPending, listVersions, saveVersion } from '@/lib/marketing/knowledge-file'
import { summarise } from '@/lib/marketing/sites'

export const dynamic = 'force-dynamic'

/** The file: current version, the version list, and the version asked for (`?version=n`, else current). */
export async function GET(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const site = await siteFromReq(req)
  if (isResponse(site)) return site
  const raw = req.nextUrl.searchParams.get('version')
  const wanted = raw ? Math.floor(Number(raw)) : null
  try {
    const [current, versions] = await Promise.all([getCurrentVersion(site.id), listVersions(site.id)])
    let viewing = current
    if (wanted !== null && wanted !== current?.version) {
      viewing = Number.isInteger(wanted) && wanted > 0 ? await getVersion(site.id, wanted) : null
      if (!viewing) return json({ error: `Version ${raw} not found` }, 404)
    }
    return json({ site: summarise(site), current, versions, viewing })
  } catch (e) {
    if (isMigrationPending(e)) return json({ site: summarise(site), current: null, versions: [], viewing: null, migrationPending: true })
    return json({ error: e instanceof Error ? e.message : 'Could not load the knowledge file' }, 500)
  }
}

/** `{text}` saves a new version; `{restore: n}` saves version n's text as a new version. */
export async function POST(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const site = await siteFromReq(req)
  if (isResponse(site)) return site
  const b = await body<{ text?: unknown; restore?: unknown }>(req)
  try {
    let text: string
    if (b.restore !== undefined) {
      const n = Math.floor(Number(b.restore))
      const row = Number.isInteger(n) && n > 0 ? await getVersion(site.id, n) : null
      if (!row) return json({ error: `Version ${String(b.restore)} not found` }, 404)
      text = row.text
    } else if (typeof b.text === 'string') {
      text = b.text
    } else {
      return json({ error: 'text or restore required' }, 400)
    }
    const r = await saveVersion(site.id, text, who.email)
    return 'error' in r ? json({ error: r.error }, 400) : json({ version: r.version })
  } catch (e) {
    if (isMigrationPending(e)) return json({ error: MIGRATION_PENDING_LINE, migrationPending: true }, 409)
    return json({ error: e instanceof Error ? e.message : 'Could not save' }, 500)
  }
}
