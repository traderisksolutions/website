/**
 * GET /api/eb/quotations/:id → { quotation, model, checks }
 * One kept quotation with what the proposal shows and the checks before sending. No model is called.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { errorResponse, fail, gate, isUuid } from '@/lib/placement/api'
import { proposalChecks, proposalModel } from '@/lib/gb/eb-proposal'
import { loadQuotation } from '@/lib/gb/eb-proposal-store'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Not a quotation id')
  try {
    const q = await loadQuotation(id)
    if (!q) return fail('Quotation not found', 404)
    const { snapshot, ...rest } = q
    return NextResponse.json({ quotation: rest, model: proposalModel(snapshot), checks: proposalChecks(snapshot) })
  } catch (e) {
    return errorResponse(e)
  }
}
