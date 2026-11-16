/**
 * GET  /api/work/:id/rounds → the case's rounds: every email as one move, each insurer's chain,
 *                             the next steps and the unsent email already made for a step.
 * POST /api/work/:id/rounds → { action: 'move', message_id, by, move } a person's call on one email
 *                             (by and move null hand it back to the rule),
 *                             { action: 'draft', step } the email for one next step, from its template,
 *                             { action: 'run' } the email for every next step that has one.
 * Words and file names from a colleague's private thread are withheld. No model is called.
 */
import { NextRequest, NextResponse } from 'next/server'
import { caseActor, caseFail } from '@/lib/cases/http'
import { isMove, isWriter } from '@/lib/cases/rounds'
import { draftStep, runSteps } from '@/lib/cases/rounds-draft'
import { loadRounds, setCall } from '@/lib/cases/rounds-store'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const who = await caseActor(req)
  if ('refused' in who) return who.refused
  const { id } = await params
  try {
    return NextResponse.json(await loadRounds(id, who.actor))
  } catch (e) {
    return caseFail(e)
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const who = await caseActor(req)
  if ('refused' in who) return who.refused
  const { id } = await params
  const body = await req.json().catch(() => null) as { action?: string; message_id?: unknown; by?: unknown; move?: unknown; step?: unknown } | null
  try {
    if (body?.action === 'draft') {
      if (typeof body.step !== 'string' || !body.step) return NextResponse.json({ error: 'Name the step to draft.' }, { status: 400 })
      const drafted = await draftStep(id, body.step, who.actor)
      return NextResponse.json({ ...(await loadRounds(id, who.actor)), made: drafted })
    }
    if (body?.action === 'run') {
      const ran = await runSteps(id, who.actor)
      return NextResponse.json({ ...(await loadRounds(id, who.actor)), ran })
    }
    if (body?.action === 'move') {
      if (typeof body.message_id !== 'string' || !body.message_id) return NextResponse.json({ error: 'Name the email.' }, { status: 400 })
      const cleared = body.by == null && body.move == null
      if (!cleared && (!isWriter(body.by) || !isMove(body.move))) return NextResponse.json({ error: 'Choose who wrote the email and what it is.' }, { status: 400 })
      await setCall(id, body.message_id, cleared ? null : { by: body.by as never, move: body.move as never }, who.actor)
      return NextResponse.json(await loadRounds(id, who.actor))
    }
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  } catch (e) {
    return caseFail(e)
  }
}
