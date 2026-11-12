/**
 * POST /api/group-benefits/quote/:id/compare/draft { product, picks? }
 * Writes the client email for one product against today (src/lib/gb/compare-draft.ts). On the
 * quotation's client thread it becomes a pending draft there (the same door as a manual draft);
 * without a thread the text comes back to copy. Nothing sends.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sb, sbTry, enc } from '@/lib/crm/db'
import { composeCompareDraft } from '@/lib/gb/compare-draft'
import { clientOnThread } from '@/lib/gb/client-draft'
import { threadOfQuotation } from '@/lib/gb/scenario-run'
import { logActivity } from '@/lib/log-activity'
import type { Picks } from '@/lib/gb/compare-cover'

export const maxDuration = 120

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { id } = await params
  const b = await req.json().catch(() => ({})) as { product?: string; picks?: Record<string, Picks> }
  if (!b.product) return NextResponse.json({ error: 'product required' }, { status: 400 })
  try {
    const d = await composeCompareDraft(id, b.product, b.picks?.[b.product] ?? null, user.email?.toLowerCase() ?? null)
    const [q] = await sbTry<{ notes: string | null }[]>(`gb_quotations?id=eq.${enc(id)}&select=notes&limit=1`, [])
    const threadId = threadOfQuotation(q?.notes)
    const client = threadId ? await clientOnThread(threadId) : null
    if (!threadId || !client) return NextResponse.json({ subject: d.subject, body: d.body, rewritten: d.rewritten, href: null })
    const first = client.name ? client.name.split(/\s+/)[0] : null
    const body = first ? d.body.replace(/^Dear Sir or Madam,/, `Dear ${first},`) : d.body
    const res = await fetch(`${new URL(req.url).origin}/api/engagement/draft`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') ?? '' },
      body: JSON.stringify({ leadId: threadId, contactName: client.name ?? client.email, contactEmail: client.email, company: d.facts.company, threadId, manualContent: body }),
    })
    const made = await res.json().catch(() => ({})) as { draftId?: string; error?: string }
    if (!res.ok || !made.draftId) return NextResponse.json({ subject: d.subject, body, rewritten: d.rewritten, href: null, note: made.error ?? 'The draft could not be put on the thread; copy it instead.' })
    await sb(`ai_drafts?id=eq.${enc(made.draftId)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ subject: d.subject, to_email: client.email, cc: client.cc.length ? client.cc.join(', ') : null, email_type: 'gb_compare_option', context_used: { agent: 'group_benefit', kind: 'compare_option', quotation_id: id, product: b.product, rewritten: d.rewritten } }) })
    void logActivity({ action: 'gb.compare_draft_prepared', resource_type: 'gb_quotation', resource_id: id, new_value: { product: b.product, thread_id: threadId, draft_id: made.draftId } })
    return NextResponse.json({ subject: d.subject, body, rewritten: d.rewritten, href: `/engagement?lead=${threadId}` })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
