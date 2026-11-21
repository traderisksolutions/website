/**
 * GET  /api/work/:id/brief → the brief in five parts (communicated, client wish list, known risks
 *                            and success factors, open questions, next step), the case's line of
 *                            insurance and its document checklist.
 * POST /api/work/:id/brief → { action: 'confirm' | 'not_needed' | 'reject' | 'clear', item_id } a person's call on one document,
 *                            { action: 'line', line } the case's line of insurance (null clears the choice).
 * Words and file names from a colleague's private thread are withheld. No model is called.
 */
import { NextRequest, NextResponse } from 'next/server'
import { caseActor, caseFail } from '@/lib/cases/http'
import { loadBrief, setCaseLine, setCheck, type CaseBriefView, type CheckAction } from '@/lib/cases/brief-store'
import { currentStaff } from '@/lib/casework/queue'

type Ctx = { params: Promise<{ id: string }> }
export type CaseBriefAnswer = CaseBriefView & { staff: { email: string; name: string }[] }
const CHECKS: readonly string[] = ['confirm', 'not_needed', 'reject', 'clear'] satisfies CheckAction[]

async function view(id: string, viewer: string): Promise<CaseBriefAnswer> {
  const [brief, staff] = await Promise.all([loadBrief(id, viewer), currentStaff()])
  return { ...brief, staff }
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const who = await caseActor(req)
  if ('refused' in who) return who.refused
  const { id } = await params
  try {
    return NextResponse.json(await view(id, who.actor))
  } catch (e) {
    return caseFail(e)
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const who = await caseActor(req)
  if ('refused' in who) return who.refused
  const { id } = await params
  const body = await req.json().catch(() => null) as { action?: string; item_id?: unknown; line?: unknown } | null
  try {
    if (body?.action === 'line') {
      if (body.line !== null && typeof body.line !== 'string') return NextResponse.json({ error: 'Choose a line of insurance.' }, { status: 400 })
      await setCaseLine(id, body.line || null, who.actor)
      return NextResponse.json({ ok: true, brief: await view(id, who.actor) })
    }
    if (body?.action && CHECKS.includes(body.action)) {
      if (typeof body.item_id !== 'string' || !body.item_id) return NextResponse.json({ error: 'Name the document.' }, { status: 400 })
      await setCheck(id, body.item_id, who.actor, body.action as CheckAction)
      return NextResponse.json({ ok: true, brief: await view(id, who.actor) })
    }
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  } catch (e) {
    return caseFail(e)
  }
}
