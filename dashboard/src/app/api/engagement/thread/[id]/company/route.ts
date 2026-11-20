/**
 * PATCH /api/engagement/thread/[id]/company   { companyId?: string; name?: string }
 *
 * Files a thread under a company, by a person. A thread with no company, or one filed under a
 * client, is re-filed under the pick. A thread filed under an insurer or a partner keeps that
 * filing: the pick becomes the client the thread is about (`thread_insurers`), and a `name` with
 * no company on file creates the client first (the OUE referral through Mednefits, 11 Nov 2026).
 * Answers { companyId } for a filing, { clientCompanyId, created } for a client.
 *
 * GET /api/engagement/thread/[id]/company → { domain, unfiled }
 *
 * The thread's outside domain (the most frequent address on it that is not TRS, a personal
 * mailbox or an automated sender) and how many other unfiled threads have someone from it. The
 * rail's Link company offers "File all from this domain" with that count; the filing itself is
 * POST /api/companies/domains, by a person, never automatic.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { SB_URL, sbH }               from '@/lib/debit-note-storage'
import { setClientForThread }        from '@/lib/crm/client-link'
import { enc, sbTry }                from '@/lib/crm/db'
import { createClient }              from '@/lib/supabase/server'
import { threadsOnDomain }           from '@/lib/crm/domains'
import { currentUserEmail }          from '@/lib/crm/auth'
import { threadVisibleTo, PRIVATE_THREAD } from '@/lib/mail/visibility-server'
import { forgetInboxIndex }          from '@/lib/mail/inbox-index'
import { outsideDomain }             from '@/lib/mail/inbox-list'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  try {
    if (!(await threadVisibleTo(id, await currentUserEmail()))) return NextResponse.json(PRIVATE_THREAD, { status: 403 })
    const parts = await sbTry<{ email: string | null }[]>(`email_participants?thread_id=eq.${enc(id)}&select=email&limit=500`, [])
    const domain = outsideDomain(parts.map(p => p.email ?? ''))
    if (!domain) return NextResponse.json({ domain: null, unfiled: 0 })
    const unfiled = (await threadsOnDomain(domain)).filter(t => t !== id).length
    return NextResponse.json({ domain, unfiled })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized

  const { id } = await params
  try {
    const { companyId, name } = await req.json() as { companyId?: string | null; name?: string | null }
    if (!companyId && !(name ?? '').trim()) return NextResponse.json({ error: 'companyId or name required' }, { status: 400 })

    const [thread] = await sbTry<{ company_id: string | null; companies: { kind: string | null } | null }[]>(`email_threads?id=eq.${enc(id)}&select=company_id,companies(kind)&limit=1`, [])
    if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    const counterparty = thread.companies?.kind === 'insurer' || thread.companies?.kind === 'partner'
    if (counterparty && companyId !== thread.company_id) {
      const by = await createClient().then(c => c.auth.getUser()).then(u => u.data.user?.email ?? null).catch(() => null)
      const r = await setClientForThread(id, { companyId, name }, by)
      if (!r) return NextResponse.json({ error: 'Could not set the client' }, { status: 500 })
      forgetInboxIndex()
      return NextResponse.json({ ok: true, clientCompanyId: r.clientId, created: r.created })
    }
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
    const res = await fetch(`${SB_URL}/rest/v1/email_threads?id=eq.${id}`, {
      method: 'PATCH', headers: sbH('return=minimal'),
      body: JSON.stringify({ company_id: companyId }),
    })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 })
    forgetInboxIndex()
    return NextResponse.json({ ok: true, companyId })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
