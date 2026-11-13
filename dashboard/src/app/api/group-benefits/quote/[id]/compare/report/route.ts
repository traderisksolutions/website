/**
 * POST /api/group-benefits/quote/:id/compare/report { action: 'whatsapp' | 'email', picks? }
 *
 * The client report from Compare cover, sent the two ways besides a download. Either way the PDF is
 * rendered from the choices as they are now and kept in the Shared Drive
 * (group-benefits/client-reports), so what the client received stays on file.
 *   whatsapp → { waUrl, link, phone }: a signed link to the kept copy (30 days,
 *              src/lib/gb/report-link.ts) in a WhatsApp message to the client's number when the
 *              contact has one. The broker presses send in WhatsApp.
 *   email    → { href }: a pending draft on the quotation's client thread with the PDF attached,
 *              approved and sent from the Inbox like any draft. Nothing sends from here.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enc, sb, sbTry } from '@/lib/crm/db'
import { loadCompare, savePicks, type Picks } from '@/lib/gb/compare-cover'
import { buildCompareReport, reportEmail } from '@/lib/gb/compare-report'
import { renderCompareReportPdf, reportFilename } from '@/lib/gb/compare-report-pdf'
import { reportToken, REPORT_LINK_DAYS } from '@/lib/gb/report-link'
import { clientOnThread } from '@/lib/gb/client-draft'
import { threadOfQuotation } from '@/lib/gb/scenario-run'
import { storeUpload } from '@/lib/storage/drive-upload'
import { driveIdOf } from '@/lib/storage/attachment-bytes'
import { logActivity } from '@/lib/log-activity'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { id } = await params
  const b = await req.json().catch(() => ({})) as { action?: string; picks?: Record<string, Picks> }
  if (b.action !== 'whatsapp' && b.action !== 'email') return NextResponse.json({ error: 'action must be whatsapp or email' }, { status: 400 })
  try {
    if (b.picks && typeof b.picks === 'object') await savePicks(id, b.picks)
    const d = await loadCompare(id)
    if ('error' in d) return NextResponse.json({ error: d.error }, { status: d.status })
    const [q] = await sbTry<{ notes: string | null }[]>(`gb_quotations?id=eq.${enc(id)}&select=notes&limit=1`, [])
    const threadId = threadOfQuotation(q?.notes)
    const client = threadId ? await clientOnThread(threadId) : null
    if (b.action === 'email' && (!threadId || !client)) return NextResponse.json({ error: 'No client thread on this quotation. Download the PDF and attach it to an email.' }, { status: 409 })

    const m = buildCompareReport(d)
    const filename = reportFilename(m.company)
    const ref = await storeUpload('group-benefits/client-reports', filename, 'application/pdf', await renderCompareReportPdf(m))
    const first = client?.name ? client.name.split(/\s+/)[0] : null

    if (b.action === 'whatsapp') {
      const link = `${new URL(req.url).origin}/api/public/gb-report/${reportToken(driveIdOf(ref))}`
      const [c] = client ? await sbTry<{ phone: string | null }[]>(`contacts?email=ilike.${enc(client.email)}&phone=not.is.null&select=phone&limit=1`, []) : []
      const digits = (c?.phone ?? '').replace(/\D/g, '')
      const phone = digits.length === 8 ? `65${digits}` : digits.length >= 10 ? digits : null
      const text = `Dear ${first ?? 'Sir or Madam'}, please find our group benefits comparison for ${m.company}: ${link} (the link opens for ${REPORT_LINK_DAYS} days).`
      void logActivity({ action: 'gb.client_report_whatsapp', resource_type: 'gb_quotation', resource_id: id, new_value: { file: ref, phone: phone ? `…${phone.slice(-4)}` : null }, metadata: { by: user.email ?? null } })
      return NextResponse.json({ waUrl: `https://wa.me/${phone ?? ''}?text=${encodeURIComponent(text)}`, link, phone })
    }

    const e = reportEmail(m, first)
    const res = await fetch(`${new URL(req.url).origin}/api/engagement/draft`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') ?? '' },
      body: JSON.stringify({ leadId: threadId, contactName: client!.name ?? client!.email, contactEmail: client!.email, company: m.company, threadId, manualContent: e.body }),
    })
    const made = await res.json().catch(() => ({})) as { draftId?: string; error?: string }
    if (!res.ok || !made.draftId) return NextResponse.json({ error: made.error ?? 'The draft could not be put on the thread.' }, { status: 502 })
    await sb(`ai_drafts?id=eq.${enc(made.draftId)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ subject: e.subject, to_email: client!.email, cc: client!.cc.length ? client!.cc.join(', ') : null, attachments: [{ filename, mime_type: 'application/pdf', storage_url: ref }], email_type: 'gb_client_report', context_used: { agent: 'group_benefit', kind: 'client_report', quotation_id: id, thread_id: threadId } }) })
    void logActivity({ action: 'gb.client_report_email_prepared', resource_type: 'gb_quotation', resource_id: id, new_value: { thread_id: threadId, draft_id: made.draftId, file: ref }, metadata: { by: user.email ?? null } })
    return NextResponse.json({ href: `/engagement?lead=${threadId}`, to: client!.email })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
