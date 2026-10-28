/**
 * POST /api/placements/lines/[id]/tiers
 *   { add?: { label, spec?, target_premium? }[], drop?: uuid[], ask?: boolean, tier_ids?: uuid[] }
 *   → { added, dropped, asked: { drafts, tiers } | null }
 * The options a client wants priced side by side on a line (1M, 2M, "what does S$1,300/head buy").
 * add and drop change the list; ask drafts the follow-up to every insurer still on the line for
 * the proposed options (or tier_ids). Drafts wait for a person to send them.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { addTiers, askTiers, dropTiers } from '@/lib/placement/workflow'
import { errorResponse, fail, gate, isText, isUuid, readBody, specFrom } from '@/lib/placement/api'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

type Body = { add?: unknown; drop?: unknown; ask?: unknown; tier_ids?: unknown }
type TierIn = { label: string; spec?: unknown; target_premium?: unknown }
const isTierIn = (v: unknown): v is TierIn => !!v && typeof v === 'object' && isText((v as TierIn).label)

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Line id is not valid')
  const b = await readBody<Body>(req)
  if (!b) return fail('Body must be a JSON object')
  if (b.add != null && (!Array.isArray(b.add) || !b.add.every(isTierIn))) return fail('add must be a list of { label }')
  if (b.drop != null && (!Array.isArray(b.drop) || !b.drop.every(isUuid))) return fail('drop must be a list of tier ids')
  if (b.tier_ids != null && (!Array.isArray(b.tier_ids) || !b.tier_ids.every(isUuid))) return fail('tier_ids must be a list of tier ids')
  if (b.ask != null && typeof b.ask !== 'boolean') return fail('ask must be true or false')

  try {
    const added = Array.isArray(b.add) ? await addTiers(id, (b.add as TierIn[]).map(t => ({
      label: t.label, spec: specFrom(t.spec), target_premium: typeof t.target_premium === 'string' ? t.target_premium : null,
    })), actor) : []
    const dropped = Array.isArray(b.drop) ? await dropTiers(id, b.drop as string[], actor) : 0
    const asked = b.ask ? await askTiers(id, actor, Array.isArray(b.tier_ids) ? b.tier_ids as string[] : undefined) : null
    return NextResponse.json({ added, dropped, asked })
  } catch (e) {
    return errorResponse(e)
  }
}
