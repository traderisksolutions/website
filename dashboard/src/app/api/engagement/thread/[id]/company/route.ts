/**
 * PATCH /api/engagement/thread/[id]/company   { companyId: string }
 * Manually links one email thread to a company — the Engagement "Unlinked" tab's fix-up action
 * for threads that couldn't auto-resolve a company (no contact_id yet, or a contact never linked
 * to a company). Parallel to the existing PATCH /api/companies/[id] notes route.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { SB_URL, sbH }               from '@/lib/debit-note-storage'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized

  const { id } = await params
  try {
    const { companyId } = await req.json() as { companyId?: string }
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

    const res = await fetch(`${SB_URL}/rest/v1/email_threads?id=eq.${id}`, {
      method: 'PATCH', headers: sbH('return=minimal'),
      body: JSON.stringify({ company_id: companyId }),
    })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
