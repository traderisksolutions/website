/**
 * POST /api/work/:id/read → the case reader on this one case: the threads on the case that the
 *                           person may see, and nothing else of the client. Answers what it kept:
 *                           { ok, notes, read }. The screen then reloads /api/work/:id/memory.
 * A person's button starts it; the model call is refused without a signed-in session (ai-gate).
 * A case with no thread, a closed case and a case with no client answer 400. The read never
 * closes the case: a matter it finds complete becomes a decision for the person.
 */
import { NextRequest, NextResponse } from 'next/server'
import { caseActor, caseFail } from '@/lib/cases/http'
import { workCase } from '@/lib/casework/run'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const who = await caseActor(req)
  if ('refused' in who) return who.refused
  const { id } = await params
  try {
    return NextResponse.json({ ok: true, ...await workCase(id, who.actor) })
  } catch (e) {
    return caseFail(e)
  }
}
