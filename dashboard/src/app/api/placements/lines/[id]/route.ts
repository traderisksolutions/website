/**
 * PATCH /api/placements/lines/[id]
 *   { client_stage?, insurer_stage?, request_type?, existing?, renewal_date?, previous_premium?, status?: 'dropped' }
 *   → { line }
 * What a person sets on a policy being worked on. status 'dropped' takes it off Policies › Working on
 * (the email thread and the log stay). Every change is written to the company log.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import * as store from '@/lib/placement/store'
import type { Placement, PlacementLine } from '@/lib/placement/types'
import { linePatchFrom } from '@/lib/placement/working'
import { errorResponse, fail, gate, isUuid, readBody } from '@/lib/placement/api'
import { sbTry } from '@/lib/crm/db'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Not a line id')
  const b = await readBody<Record<string, unknown>>(req)
  if (!b) return fail('Body must be a JSON object')
  const r = linePatchFrom(b)
  if ('error' in r) return fail(r.error)
  try {
    const [line] = await sbTry<PlacementLine[]>(`placement_lines?id=eq.${id}&select=*`, [])
    if (!line) return fail('Line not found', 404)
    const [placement] = await sbTry<Placement[]>(`placements?id=eq.${line.placement_id}&select=id,company_id`, [])
    const [updated] = await store.patch<PlacementLine>('placement_lines', `id=eq.${id}`, r.patch)
    const words = r.patch.status === 'dropped'
      ? `${line.label ?? line.product_line} taken off Policies › Working on`
      : `${line.label ?? line.product_line}: ${Object.entries(r.patch).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v === null ? 'cleared' : String(v)}`).join(', ')}`
    if (placement) await store.log({ company_id: placement.company_id, placement_id: placement.id, line_id: id, kind: 'note', actor, text: words, detail: { patch: r.patch } })
    return NextResponse.json({ line: updated ?? null })
  } catch (e) {
    return errorResponse(e)
  }
}
