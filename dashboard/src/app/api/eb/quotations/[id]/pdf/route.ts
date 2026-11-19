/**
 * GET /api/eb/quotations/:id/pdf[?download=1] → the proposal as a PDF, rendered from the kept
 * quotation. Inline for the preview, or as a download. No model is called.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { errorResponse, fail, gate, isUuid } from '@/lib/placement/api'
import { proposalFilename } from '@/lib/gb/eb-proposal'
import { loadQuotation, proposalPdf } from '@/lib/gb/eb-proposal-store'
import { lookupStaff } from '@/lib/auth/users'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!isUuid(id)) return fail('Not a quotation id')
  try {
    const q = await loadQuotation(id)
    if (!q) return fail('Quotation not found', 404)
    const staff = actor !== 'system' ? await lookupStaff(actor).catch(() => null) : null
    const pdf = await proposalPdf(q, staff?.name ?? null)
    const name = proposalFilename(q.company_name, q.version)
    const disposition = req.nextUrl.searchParams.get('download') ? 'attachment' : 'inline'
    return new NextResponse(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `${disposition}; filename="${name.replace(/"/g, '')}"`, 'Cache-Control': 'no-store' } })
  } catch (e) {
    return errorResponse(e)
  }
}
