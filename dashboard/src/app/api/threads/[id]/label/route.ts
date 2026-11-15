/**
 * POST /api/threads/:id/label → { label } a person sets the thread's label. It stands over the
 * rule's label from then on; the rule's own answer is kept beside it for comparison.
 */
import { NextRequest, NextResponse } from 'next/server'
import { caseActor, caseFail } from '@/lib/cases/http'
import { setLabel } from '@/lib/cases/sources-store'
import { isLabel, LABELS } from '@/lib/cases/labels'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const who = await caseActor(req)
  if ('refused' in who) return who.refused
  const { id } = await params
  const body = await req.json().catch(() => null) as { label?: unknown } | null
  if (!isLabel(body?.label)) return NextResponse.json({ error: `Label is one of: ${LABELS.join(', ')}.` }, { status: 400 })
  try {
    return NextResponse.json({ ok: true, ...await setLabel(id, body.label, who.actor) })
  } catch (e) {
    return caseFail(e)
  }
}
