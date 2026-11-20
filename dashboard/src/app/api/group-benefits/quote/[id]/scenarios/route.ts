/**
 * GET  /api/group-benefits/quote/:id/scenarios                 → the saved scenarios A, B, C, or null
 * POST /api/group-benefits/quote/:id/scenarios { thread_id? | lead_id? }
 *      → reads the client thread (the quotation's own thread when none is given), builds three
 *        requirements from it and prices each at every insurer. Nothing is sent.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sbTry, enc } from '@/lib/crm/db'
import { loadScenarios, runScenarios, threadOfQuotation } from '@/lib/gb/scenario-run'
import { withStaff } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const GET = withStaff(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Quotation id is not valid.' }, { status: 400 })
  const [q] = await sbTry<{ notes: string | null }[]>(`gb_quotations?id=eq.${enc(id)}&select=notes&limit=1`, [])
  return NextResponse.json({ pack: await loadScenarios(id), threadId: threadOfQuotation(q?.notes) })
}, { error: 'Not authenticated' })

export const POST = withStaff(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }, { user }) => {
  const by = user.email.toLowerCase()
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Quotation id is not valid.' }, { status: 400 })
  const b = await req.json().catch(() => ({})) as { thread_id?: string; lead_id?: string }
  let threadId = b.thread_id && UUID.test(b.thread_id) ? b.thread_id : null
  if (!threadId && b.lead_id && UUID.test(b.lead_id)) {
    const [lead] = await sbTry<{ thread_id: string | null }[]>(`leads?id=eq.${enc(b.lead_id)}&select=thread_id&limit=1`, [])
    threadId = lead?.thread_id ?? null
  }
  if (!threadId) {
    const [q] = await sbTry<{ notes: string | null }[]>(`gb_quotations?id=eq.${enc(id)}&select=notes&limit=1`, [])
    threadId = threadOfQuotation(q?.notes)
  }
  if (!threadId) return NextResponse.json({ error: 'Pick the client thread to read.' }, { status: 400 })
  try {
    const r = await runScenarios(threadId, by, id)
    return r.ok ? NextResponse.json({ pack: r.pack, how: r.how, threadId }) : NextResponse.json({ error: r.error }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}, { error: 'Not authenticated' })
