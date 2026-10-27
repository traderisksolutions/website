/**
 * POST /api/placements
 *   { company_id, title?, client_thread_id?, inception_date?, lines: [{ product_line, label?, spec?, contact_ids? }], dispatch?: boolean }
 *   → { placement, lines, dispatched }
 * Opens the placement and, unless dispatch is false, round 1 on every line with a draft per insurer
 * contact — every contact on file for the line, or only the line's contact_ids when given.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isValidProductLine } from '@/lib/product-lines'
import { createPlacement, type NewLine } from '@/lib/placement/workflow'
import { contactIdsFrom, errorResponse, fail, gate, isDate, isSpec, isText, isUuid, readBody, specFrom } from '@/lib/placement/api'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

type Body = {
  company_id?: unknown; title?: unknown; client_thread_id?: unknown; inception_date?: unknown
  lines?: unknown; dispatch?: unknown
}

export async function POST(req: NextRequest) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized

  const b = await readBody<Body>(req)
  if (!b) return fail('Body must be a JSON object')
  if (!isUuid(b.company_id)) return fail('company_id is required')
  if (b.client_thread_id != null && b.client_thread_id !== '' && !isUuid(b.client_thread_id)) return fail('client_thread_id is not valid')
  if (b.inception_date != null && b.inception_date !== '' && !isDate(b.inception_date)) return fail('inception_date must be YYYY-MM-DD')
  if (b.title != null && typeof b.title !== 'string') return fail('title must be text')
  if (b.dispatch != null && typeof b.dispatch !== 'boolean') return fail('dispatch must be true or false')
  if (!Array.isArray(b.lines) || b.lines.length === 0) return fail('At least one line is required')

  const lines: NewLine[] = []
  for (const raw of b.lines as unknown[]) {
    const l = raw && typeof raw === 'object' ? raw as Record<string, unknown> : null
    if (!l || !isText(l.product_line)) return fail('Every line needs a product_line')
    const product_line = l.product_line.trim()
    if (!isValidProductLine(product_line)) return fail(`Unknown product line: ${product_line}`)
    if (l.label != null && typeof l.label !== 'string') return fail('label must be text')
    if (l.spec != null && !isSpec(l.spec)) return fail('spec must be an object')
    const contact_ids = contactIdsFrom(l.contact_ids)
    if (contact_ids === false) return fail('contact_ids must be a list of contact ids')
    lines.push({ product_line, label: typeof l.label === 'string' ? l.label : null, spec: specFrom(l.spec), contact_ids: contact_ids ?? null })
  }

  try {
    const r = await createPlacement({
      company_id: b.company_id,
      title: typeof b.title === 'string' ? b.title : null,
      client_thread_id: isUuid(b.client_thread_id) ? b.client_thread_id : null,
      inception_date: isDate(b.inception_date) ? b.inception_date : null,
      lines, actor, dispatch: b.dispatch !== false,
    })
    return NextResponse.json({ placement: r.placement, lines: r.lines, dispatched: r.dispatched }, { status: 201 })
  } catch (e) {
    return errorResponse(e)
  }
}
