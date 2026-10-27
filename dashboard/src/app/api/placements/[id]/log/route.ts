/** POST /api/placements/[id]/log { kind?: 'note' | 'decision', text } → { entry } — a line in the company memory by the signed-in user. */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import * as store from '@/lib/placement/store'
import { sbTry } from '@/lib/crm/db'
import type { Placement } from '@/lib/placement/types'
import { errorResponse, fail, gate, isText, isUuid, readBody } from '@/lib/placement/api'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Placement id is not valid')
  const b = await readBody<{ kind?: unknown; text?: unknown }>(req)
  if (!b) return fail('Body must be a JSON object')
  if (!isText(b.text)) return fail('text is required')
  const kind = b.kind == null ? 'note' : b.kind
  if (kind !== 'note' && kind !== 'decision') return fail('kind must be note or decision')

  try {
    const [placement] = await sbTry<Placement[]>(`placements?id=eq.${id}&select=id,company_id&limit=1`, [])
    if (!placement) return fail('Placement not found', 404)
    const entry = await store.log({ company_id: placement.company_id, placement_id: id, kind, actor, text: b.text.trim() })
    if (!entry) return fail('Could not write the log entry', 500)
    return NextResponse.json({ entry }, { status: 201 })
  } catch (e) {
    return errorResponse(e)
  }
}
