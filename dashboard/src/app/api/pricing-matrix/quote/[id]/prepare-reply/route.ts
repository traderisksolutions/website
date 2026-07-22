/**
 * POST /api/pricing-matrix/quote/[id]/prepare-reply   { lead_id, insurers?: string[] }
 * Generates one CSV per (priced) insurer, uploads them to the private email-attachments bucket,
 * and creates a pending reply draft (comparison summary + recommendation + those attachments) on
 * the chosen lead's thread. The engagement composer then opens with the draft + files ready.
 *
 * Reuses the same infra as the deprecated gb flow: /api/engagement/draft (contact upsert),
 * ai_drafts.attachments jsonb, the email-attachments bucket, and the send route that downloads
 * bare-path email-attachments into the MIME.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { logActivity }               from '@/lib/log-activity'
import { SB_URL, sbH, stH }          from '@/lib/pm-storage'
import { buildInsurerCsv }           from '@/lib/pm-export'
import type { QuoteRow }             from '@/lib/pm-export'
import { buildReplyBody }            from '@/lib/pm-reply'
import type { Recommendation }       from '@/lib/pm-recommend'

export const maxDuration = 120

type Ref = { filename: string; mime_type: string; storage_url: string }

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { lead_id, insurers } = await req.json() as { lead_id?: string; insurers?: string[] }
    if (!lead_id) return NextResponse.json({ error: 'lead_id required' }, { status: 400 })

    // Load the quote (inputs + results + recommendation).
    const quote = await fetch(`${SB_URL}/rest/v1/pm_quotations?id=eq.${id}&select=company_name,effective_date,census,selections,results,recommendation&limit=1`, { headers: sbH(), cache: 'no-store' })
      .then(r => (r.ok ? r.json() : [])).then(rows => rows[0] ?? null) as (QuoteRow & { recommendation: Recommendation | null }) | null
    if (!quote?.results) return NextResponse.json({ error: 'Quote has no results' }, { status: 400 })

    // Resolve the lead → thread + contact + email (draft target).
    const lead = await fetch(`${SB_URL}/rest/v1/leads?id=eq.${lead_id}&select=id,first_name,last_name,email,company,thread_id&limit=1`, { headers: sbH(), cache: 'no-store' })
      .then(r => (r.ok ? r.json() : [])).then(rows => rows[0] ?? null)
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    // Which insurers → default to every priced one.
    const priced = quote.results.insurers.filter(i => !i.error)
    const wanted = insurers && insurers.length ? priced.filter(i => insurers.includes(i.calculator_id)) : priced
    if (!wanted.length) return NextResponse.json({ error: 'No priced insurers to attach' }, { status: 400 })

    // Build + upload one CSV per insurer.
    const refs: Ref[] = []
    for (const ins of wanted) {
      const { filename, csv } = buildInsurerCsv(quote, ins.calculator_id)
      const path = `pm-quotes/${id}/${filename.replace(/\.csv$/, '')}-${Date.now().toString(36)}.csv`
      const up = await fetch(`${SB_URL}/storage/v1/object/email-attachments/${path}`, {
        method: 'POST', headers: { ...stH(), 'Content-Type': 'text/csv' }, body: new TextEncoder().encode(csv),
      })
      if (!up.ok) return NextResponse.json({ error: `Upload failed: ${(await up.text()).slice(0, 160)}` }, { status: 502 })
      refs.push({ filename, mime_type: 'text/csv', storage_url: path })
    }

    const body = buildReplyBody(quote)

    // Reuse the manual-draft flow (contact upsert) via the internal API with the caller's cookies,
    // then attach the generated files to the created draft.
    const origin = new URL(req.url).origin
    const draftRes = await fetch(`${origin}/api/engagement/draft`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') ?? '' },
      body: JSON.stringify({
        leadId: lead.id, contactName: [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email,
        contactEmail: lead.email, company: lead.company, threadId: lead.thread_id ?? null, manualContent: body,
      }),
    })
    const draft = await draftRes.json().catch(() => ({}))
    if (!draftRes.ok || !draft.draftId) return NextResponse.json({ error: draft.error ?? 'Could not create draft' }, { status: 502 })

    await fetch(`${SB_URL}/rest/v1/ai_drafts?id=eq.${draft.draftId}`, { method: 'PATCH', headers: sbH('return=minimal'), body: JSON.stringify({ attachments: refs }) })

    void logActivity({ action: 'pm.quote_reply_prepared', resource_type: 'pm_quotation', resource_id: id, new_value: { lead_id, files: refs.length } })
    return NextResponse.json({ ok: true, lead_id: lead.id, draft_id: draft.draftId, files: refs.length })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
