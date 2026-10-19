import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/marketing/auth'
import { body, isResponse, siteFromReq } from '@/lib/marketing/request'
import { cadence, cleanCadencePatch, defaultCadence, monthFigures, nights, tonight, updateCadence } from '@/lib/marketing/schedule'
import { isMigrationPending } from '@/lib/marketing/competitors'
import { summarise } from '@/lib/marketing/sites'

export const dynamic = 'force-dynamic'

/** The cadence, tonight's plan, the past nights and this month's figures for one site. */
export async function GET(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const site = await siteFromReq(req)
  if (isResponse(site)) return site
  try {
    const cad = await cadence(site)
    const [plan, groups, month] = await Promise.all([tonight(site, cad.count), nights(site.id), monthFigures(site.id)])
    return json({ site: summarise(site), cadence: cad, tonight: plan, nights: groups, spendMonthUsd: month.spendUsd, postedMonth: month.posted })
  } catch (e) {
    if (isMigrationPending(e)) return json({ site: summarise(site), cadence: defaultCadence(site), tonight: { analysis: null, knowledge: null, prompts: [] }, nights: [], spendMonthUsd: 0, postedMonth: 0, migrationPending: true })
    return json({ error: e instanceof Error ? e.message : 'Could not load the schedule' }, 500)
  }
}

/** Change the cadence: { count, length, post }, any subset. */
export async function PATCH(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const site = await siteFromReq(req)
  if (isResponse(site)) return site
  const cleaned = cleanCadencePatch(await body(req))
  if ('error' in cleaned) return json({ error: cleaned.error }, 400)
  try { return json({ cadence: await updateCadence(site, cleaned.patch) }) }
  catch (e) {
    if (isMigrationPending(e)) return json({ error: 'Migration 20261019_marketing_v2 is not applied yet.' }, 503)
    return json({ error: e instanceof Error ? e.message : 'Could not save the cadence' }, 500)
  }
}
