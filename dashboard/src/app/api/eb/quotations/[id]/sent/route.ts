/**
 * POST /api/eb/quotations/:id/sent → { ok }
 * Called by the email page after /api/email/send went through. Records the proposal as sent only
 * when its draft is marked sent, then moves the Employment Benefits line on Policies › Working on
 * to Quote sent and writes the company log. No model is called.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { enc, sbTry } from '@/lib/crm/db'
import { errorResponse, fail, gate, isUuid } from '@/lib/placement/api'
import { loadQuotation, markSent } from '@/lib/gb/eb-proposal-store'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  if (actor === 'system') return fail('Sign in first.', 401)
  const { id } = await params
  if (!isUuid(id)) return fail('Not a quotation id')
  try {
    const q = await loadQuotation(id)
    if (!q) return fail('Quotation not found', 404)
    if (q.sent_at) return NextResponse.json({ ok: true })
    if (!q.draft_id) return fail('No email on this proposal yet.', 409)
    const [d] = await sbTry<{ status: string; to_email: string | null }[]>(`ai_drafts?id=eq.${enc(q.draft_id)}&select=status,to_email&limit=1`, [])
    if (d?.status !== 'sent') return fail('The email has not been sent.', 409)
    await markSent(q, actor, d.to_email ?? '')
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
