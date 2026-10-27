/**
 * POST /api/placements/lines/[id]/price
 *   { census?: Member[], covers?: CoverSpec[], submission_id?: uuid, basis?: 'new_business'|'renewal' }
 *   → { quotation_id, quotes: PlacementQuote[], partial, notes }
 * Prices the list at every insurer with a rate table and files one quote per insurer on the line.
 * With submission_id and no census, the list is read from that HR submission. No email is sent.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { sbTry } from '@/lib/crm/db'
import { DraftError } from '@/lib/gb/draft'
import type { CoverSpec } from '@/lib/gb/plan-rules'
import type { Member } from '@/lib/gb-quote'
import type { HrSubmission } from '@/lib/hr/types'
import { priceLine, toMembers } from '@/lib/placement/eb'
import { errorResponse, fail, gate, isUuid, readBody } from '@/lib/placement/api'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

type Body = { census?: unknown; covers?: unknown; submission_id?: unknown; basis?: unknown }

const isMember = (v: unknown): v is Member => !!v && typeof v === 'object' && typeof (v as Member).name === 'string' && (v as Member).name.trim().length > 0
  && typeof (v as Member).relationship === 'string' && typeof (v as Member).category === 'string'
const isCover = (v: unknown): v is CoverSpec => !!v && typeof v === 'object' && typeof (v as CoverSpec).code === 'string'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Line id is not valid')
  const b = await readBody<Body>(req)
  if (!b) return fail('Body must be a JSON object')
  if (b.census != null && !Array.isArray(b.census)) return fail('census must be a list')
  if (b.covers != null && !Array.isArray(b.covers)) return fail('covers must be a list')
  if (b.submission_id != null && b.submission_id !== '' && !isUuid(b.submission_id)) return fail('submission_id is not valid')
  if (b.basis != null && b.basis !== 'new_business' && b.basis !== 'renewal') return fail('basis must be new_business or renewal')

  let census: Member[] = Array.isArray(b.census) ? (b.census as unknown[]).filter(isMember) : []
  const submissionId = isUuid(b.submission_id) ? b.submission_id : null
  if (census.length === 0 && submissionId) {
    const [sub] = await sbTry<Pick<HrSubmission, 'employees' | 'dependants' | 'status'>[]>(`hr_submissions?id=eq.${submissionId}&select=employees,dependants,status&limit=1`, [])
    if (!sub) return fail('Submission not found', 404)
    census = toMembers(sub)
  }
  if (census.length === 0) return fail('The census is empty')
  if (census.length > 2000) return fail('Over 2,000 members; split the census')
  const covers = Array.isArray(b.covers) ? (b.covers as unknown[]).filter(isCover) : undefined

  try {
    const r = await priceLine(id, { census, covers: covers?.length ? covers : undefined, basis: b.basis as 'new_business' | 'renewal' | undefined, submissionId, actor })
    return NextResponse.json({ quotation_id: r.quotationId, quotes: r.quotes, partial: r.partial, notes: r.notes }, { status: 201 })
  } catch (e) {
    if (e instanceof DraftError) return fail(e.message, 422)
    return errorResponse(e)
  }
}
