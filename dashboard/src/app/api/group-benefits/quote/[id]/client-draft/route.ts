/**
 * POST /api/group-benefits/quote/:id/client-draft { thread_id?: string }
 *   Writes the client email from the priced options (premium summary, derivation, suggestion, in
 *   TRS's voice) with the client report attached, as a pending draft on the client thread. The
 *   thread is the quotation's own when none is given. Nothing sends.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sb, sbTry, enc } from '@/lib/crm/db'
import { composeClientDraft } from '@/lib/gb/client-draft'
import { threadOfQuotation } from '@/lib/gb/scenario-run'
import { logActivity } from '@/lib/log-activity'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Quotation id is not valid.' }, { status: 400 })
  const b = await req.json().catch(() => ({})) as { thread_id?: string }
  let threadId = b.thread_id && UUID.test(b.thread_id) ? b.thread_id : null
  if (!threadId) {
    const [q] = await sbTry<{ notes: string | null }[]>(`gb_quotations?id=eq.${enc(id)}&select=notes&limit=1`, [])
    threadId = threadOfQuotation(q?.notes)
  }
  if (!threadId) return NextResponse.json({ error: 'Pick the client thread the email replies to.' }, { status: 400 })
  try {
    const d = await composeClientDraft(id, threadId, user.email?.toLowerCase() ?? null)
    const [thread] = await sbTry<{ id: string; contact_id: string | null; company_id: string | null }[]>(`email_threads?id=eq.${enc(threadId)}&select=id,contact_id,company_id&limit=1`, [])
    // The same door as a manual draft (contact upsert), then the subject, recipient and file on the row.
    const origin = new URL(req.url).origin
    const res = await fetch(`${origin}/api/engagement/draft`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') ?? '' },
      body: JSON.stringify({ leadId: thread?.id ?? threadId, contactName: d.toName ?? d.to, contactEmail: d.to, company: d.facts.company, threadId, manualContent: d.body }),
    })
    const made = await res.json().catch(() => ({})) as { draftId?: string; error?: string }
    if (!res.ok || !made.draftId) return NextResponse.json({ error: made.error ?? 'Could not create the draft.' }, { status: 502 })
    await sb(`ai_drafts?id=eq.${enc(made.draftId)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ subject: d.subject, to_email: d.to, cc: d.cc.length ? d.cc.join(', ') : null, attachments: d.attachments, email_type: 'gb_client_options', context_used: { agent: 'group_benefit', kind: 'client_options', quotation_id: id, thread_id: threadId, rewritten: d.rewritten } }) })
    void logActivity({ action: 'gb.client_draft_prepared', resource_type: 'gb_quotation', resource_id: id, new_value: { thread_id: threadId, draft_id: made.draftId, rewritten: d.rewritten } })
    return NextResponse.json({ ok: true, draftId: made.draftId, threadId, to: d.to, subject: d.subject, rewritten: d.rewritten })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
