/**
 * GET /api/work/:id/compare → the case's comparison: the current policy beside each option, one
 *                             row per policy term, the client's wish list and the case's files.
 *                             A case with none saved opens with the terms of its kind of line.
 * PUT /api/work/:id/compare → { comparison } saves what a person typed. Bounded before it is
 *                             stored (src/lib/cases/compare.ts). No model is called.
 */
import { NextRequest, NextResponse } from 'next/server'
import { caseActor, caseFail } from '@/lib/cases/http'
import { loadComparison, saveComparison, type CompareView } from '@/lib/cases/compare-store'
import { currentStaff } from '@/lib/casework/queue'

type Ctx = { params: Promise<{ id: string }> }
export type CompareAnswer = CompareView & { staff: { email: string; name: string }[] }

const view = async (id: string, viewer: string): Promise<CompareAnswer> => {
  const [v, staff] = await Promise.all([loadComparison(id, viewer), currentStaff()])
  return { ...v, staff }
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

export async function PUT(req: NextRequest, { params }: Ctx) {
  const who = await caseActor(req)
  if ('refused' in who) return who.refused
  const { id } = await params
  const body = await req.json().catch(() => null) as { comparison?: unknown } | null
  if (!body?.comparison || typeof body.comparison !== 'object') return NextResponse.json({ error: 'Send the comparison.' }, { status: 400 })
  try {
    await saveComparison(id, who.actor, body.comparison)
    return NextResponse.json({ ok: true, ...(await view(id, who.actor)) })
  } catch (e) {
    return caseFail(e)
  }
}
