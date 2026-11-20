/**
 * Renewals › To fix (docs/renewals.md).
 *
 * GET  → { tables, endDates, lines, noNote }: policies without an end date (with a suggested date),
 *        spellings not yet confirmed as a line (with a suggested line), policies with no placing debit note.
 * POST { action: 'end_dates', items: [{ policy_id, end_date }] } → { written }. Writes only where the policy has no end date.
 * POST { action: 'lines', items: [{ spelling, line_code }] } → { tables, spellings, policies }. Saves the spelling's
 *        line and writes it on every policy with that spelling and no line; { tables: false } before the migration.
 *
 * Nothing is written without a person's confirmation. No model is called.
 */
import { NextRequest, NextResponse } from 'next/server'
import { renewalActor, renewalFail } from '@/lib/renewals/http'
import { confirmEndDates, confirmLines, loadFix } from '@/lib/renewals/store'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const who = await renewalActor(req)
  if ('refused' in who) return who.refused
  try {
    return NextResponse.json(await loadFix())
  } catch (e) {
    return renewalFail(e)
  }
}

export async function POST(req: NextRequest) {
  const who = await renewalActor(req)
  if ('refused' in who) return who.refused
  const body = await req.json().catch(() => null) as { action?: unknown; items?: unknown } | null
  try {
    if (body?.action === 'end_dates') return NextResponse.json(await confirmEndDates(body.items))
    if (body?.action === 'lines') return NextResponse.json(await confirmLines(body.items, who.actor))
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  } catch (e) {
    return renewalFail(e)
  }
}
