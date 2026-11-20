/**
 * GET /api/eb/quotations/:id → { quotation, model, checks }
 * One kept quotation with what the proposal shows and the checks before sending. `quotation.draft_sent`
 * is true when its email has gone, whether or not the row was marked sent. ?edit=1 adds `edit`, what
 * /eb needs to reopen it, and `picks`. No model is called.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { errorResponse, fail, gate, isUuid } from '@/lib/placement/api'
import { proposalChecks, proposalModel } from '@/lib/gb/eb-proposal'
import { draftSent, loadQuotation } from '@/lib/gb/eb-proposal-store'

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
    const sent = await draftSent(q)
    const edit = req.nextUrl.searchParams.get('edit') === '1'
      ? { edit: snapshot.edit ?? null, products: snapshot.products, effectiveDate: snapshot.effectiveDate, basis: snapshot.basis,
          picks: Object.fromEntries(snapshot.categories.map(c => [c.name, Object.fromEntries(snapshot.products.map(p => [p, Object.fromEntries(Object.entries(c.covers).map(([k, cells]) => [k, cells[p]?.plan ?? '']))]))])) }
      : {}
    return NextResponse.json({ quotation: { ...rest, draft_sent: sent }, model: proposalModel(snapshot), checks: proposalChecks(snapshot), ...edit })
  } catch (e) {
    return errorResponse(e)
  }
}
