/**
 * Who a thread is from, labelled by a person in the Inbox rail (`src/lib/crm/thread-party.ts`).
 *
 * PATCH { party: 'client' | 'insurer' | 'referral', client?: { companyId?, name? } }
 *   Sets the kind of the company the thread is filed under; every thread from it reads the same.
 *   A company with policies on file stays a client: an insurer or a referral holds no policy.
 *   With `client` on an insurer or referral, that company becomes the client the thread is about.
 *   Answers { party, companyId, clientCompanyId?, created? }.
 *
 * POST
 *   Read thread: on an insurer or referral thread the model reads the thread and names the client
 *   it is about (`linkClientForThread`, forced). Answers { clientCompanyId, named }.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { linkClientForThread, setClientForThread } from '@/lib/crm/client-link'
import { enc, sb, sbTry }            from '@/lib/crm/db'
import { isParty, kindOfParty }      from '@/lib/crm/thread-party'
import { logActivity }               from '@/lib/log-activity'
import { createClient }              from '@/lib/supabase/server'

export const maxDuration = 60

type Thread = { id: string; company_id: string | null; companies: { kind: string | null; company_name: string | null } | null }

async function loadThread(id: string): Promise<Thread | null> {
  const [t] = await sbTry<Thread[]>(`email_threads?id=eq.${enc(id)}&select=id,company_id,companies(kind,company_name)&limit=1`, [])
  return t ?? null
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  try {
    const body = await req.json().catch(() => ({})) as { party?: unknown; client?: { companyId?: string | null; name?: string | null } | null }
    if (!isParty(body.party)) return NextResponse.json({ error: 'party must be client, insurer or referral' }, { status: 400 })
    const party = body.party
    const thread = await loadThread(id)
    if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    if (!thread.company_id) return NextResponse.json({ error: 'Link the thread to a company first' }, { status: 409 })

    const kind = kindOfParty(party)
    const before = thread.companies?.kind ?? null
    if (kind !== before) {
      if (kind !== 'client') {
        const policies = await sbTry<{ id: string }[]>(`policies?company_id=eq.${enc(thread.company_id)}&select=id&limit=50`, [])
        if (policies.length > 0) return NextResponse.json({ error: `${thread.companies?.company_name ?? 'This company'} holds ${policies.length} ${policies.length === 1 ? 'policy' : 'policies'} as a client` }, { status: 409 })
      }
      await sb(`companies?id=eq.${enc(thread.company_id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ kind }) })
    }

    const by = await createClient().then(c => c.auth.getUser()).then(u => u.data.user?.email ?? null).catch(() => null)
    let clientCompanyId: string | undefined, created: boolean | undefined
    if (party !== 'client' && body.client && (body.client.companyId || (body.client.name ?? '').trim())) {
      const r = await setClientForThread(id, { companyId: body.client.companyId ?? null, name: body.client.name ?? null }, by)
      if (!r) return NextResponse.json({ error: 'Could not set the client' }, { status: 500 })
      clientCompanyId = r.clientId; created = r.created
    }
    void logActivity({ action: 'thread.party_labelled', resource_type: 'email_thread', resource_id: id, old_value: { kind: before }, new_value: { party, kind, company_id: thread.company_id, client_company_id: clientCompanyId ?? null }, metadata: { by } })
    return NextResponse.json({ party, companyId: thread.company_id, clientCompanyId, created })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  try {
    const thread = await loadThread(id)
    if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    const kind = thread.companies?.kind
    if (kind !== 'insurer' && kind !== 'partner') return NextResponse.json({ clientCompanyId: thread.company_id, named: null })
    const r = await linkClientForThread(id, { model: true, force: true })
    return NextResponse.json({ clientCompanyId: r.clientId, named: r.named })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
