/**
 * GET  /api/group-benefits/quote/[id]/ask-insurers → { insurers }: Tier B and C insurers with contacts
 * POST /api/group-benefits/quote/[id]/ask-insurers { contact_ids } → drafts one request per chosen
 *      underwriter on the client's Employment Benefits placement line (opened if needed), with the
 *      requirement grid and the employee list. Nothing is sent; drafts wait in Drafts to approve.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { contactIdsFrom, errorResponse, fail, gate, isUuid, readBody } from '@/lib/placement/api'
import { askInsurers, outreachInsurers } from '@/lib/gb/outreach'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const { unauthorized } = await gate(req)
  if (unauthorized) return unauthorized
  try {
    return NextResponse.json({ insurers: await outreachInsurers() })
  } catch (e) {
    return errorResponse(e)
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Quotation id is not valid')
  const b = await readBody<{ contact_ids?: unknown }>(req)
  const contactIds = contactIdsFrom(b?.contact_ids)
  if (!contactIds || contactIds.length === 0) return fail('Choose at least one underwriter')
  try {
    return NextResponse.json(await askInsurers(id, contactIds, actor), { status: 201 })
  } catch (e) {
    if (e instanceof Error && /No client company|employee list|Choose at least/.test(e.message)) return fail(e.message)
    return errorResponse(e)
  }
}
