/**
 * Renewal Season: every policy ending in the season window beside its renewal case (src/lib/cases/season.ts).
 *
 * GET  → { rows, today, window: { from, to }, months }. One row per policy, and one per open
 *        renewal case no policy in the window takes.
 * POST { policy_id } → { id, created }. Starts the policy's renewal case; the case it already has
 *        is returned with created false.
 *
 * No model is called.
 */
import { NextRequest, NextResponse } from 'next/server'
import { caseActor, caseFail } from '@/lib/cases/http'
import { isId } from '@/lib/cases/combine'
import { loadSeason, startRenewal } from '@/lib/cases/season-store'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const who = await caseActor(req)
  if ('refused' in who) return who.refused
  try {
    return NextResponse.json(await loadSeason())
  } catch (e) {
    return caseFail(e)
  }
}

export async function POST(req: NextRequest) {
  const who = await caseActor(req)
  if ('refused' in who) return who.refused
  const body = await req.json().catch(() => null)
  if (!isId(body?.policy_id)) return NextResponse.json({ error: 'Choose the policy.' }, { status: 400 })
  try {
    return NextResponse.json(await startRenewal(body.policy_id, who.actor))
  } catch (e) {
    return caseFail(e)
  }
}
