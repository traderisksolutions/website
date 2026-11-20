/**
 * The client email for a proposal (src/lib/gb/eb-proposal-store.ts).
 *
 * POST  { to? } → { draftId, to, cc, subject, html, attachment, threadId }
 *       the pending draft, made once: the PDF rendered and kept in the Shared Drive, the email
 *       written by code from the quotation, on the client thread when there is one.
 * PATCH { to, cc, subject, html } → { ok }   keeps what the person typed
 *
 * Nothing sends here: the page sends through /api/email/send. No model is called.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { errorResponse, fail, gate, isUuid, readBody } from '@/lib/placement/api'
import { draftSent, ensureDraft, loadQuotation, saveDraft } from '@/lib/gb/eb-proposal-store'
import { lookupStaff } from '@/lib/auth/users'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  if (actor === 'system') return fail('Sign in first.', 401)
  const { id } = await params
  if (!isUuid(id)) return fail('Not a quotation id')
  const b = await readBody<Record<string, unknown>>(req)
  const to = typeof b?.to === 'string' && EMAIL.test(b.to.trim()) ? b.to.trim() : null
  try {
    const q = await loadQuotation(id)
    if (!q) return fail('Quotation not found', 404)
    if (q.sent_at) return fail('This proposal has been sent. Prepare a new one from the quotation.', 409)
    if (await draftSent(q)) return NextResponse.json({ error: 'Sent, but not marked sent.', sent: true }, { status: 409 })
    const staff = await lookupStaff(actor).catch(() => null)
    const d = await ensureDraft(q, { email: actor, name: staff?.name ?? null }, to)
    if ('error' in d) return fail(d.error, d.status)
    return NextResponse.json(d)
  } catch (e) {
    return errorResponse(e)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  if (actor === 'system') return fail('Sign in first.', 401)
  const { id } = await params
  if (!isUuid(id)) return fail('Not a quotation id')
  const b = await readBody<Record<string, unknown>>(req)
  const to = typeof b?.to === 'string' ? b.to.trim() : ''
  const cc = Array.isArray(b?.cc) ? (b.cc as unknown[]).map(String).map(s => s.trim()).filter(s => EMAIL.test(s)).slice(0, 20) : []
  const subject = typeof b?.subject === 'string' ? b.subject.slice(0, 300) : ''
  const html = typeof b?.html === 'string' ? b.html.slice(0, 200_000) : ''
  if (!EMAIL.test(to)) return fail('To must be one email address')
  try {
    const q = await loadQuotation(id)
    if (!q) return fail('Quotation not found', 404)
    await saveDraft(q, { to, cc, subject, html })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
