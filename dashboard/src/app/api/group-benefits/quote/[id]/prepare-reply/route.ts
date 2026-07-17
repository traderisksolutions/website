/**
 * POST /api/group-benefits/quote/[id]/prepare-reply
 *   body: { lead_id, insurers: string[], format: 'xlsx'|'csv' }
 * Generates one file per selected insurer, uploads them to the private email-attachments
 * bucket, and creates a pending reply draft (comparison summary + those attachments) on the
 * chosen lead's thread. The engagement composer then opens with the draft + files ready.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { buildExportData, buildInsurerCsv, buildInsurerXlsx, safeFileStem } from '@/lib/gb-export'
import { logActivity }               from '@/lib/log-activity'

export const maxDuration = 120

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
function sbH(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}
const storeAuth = () => ({ apikey: process.env.SUPABASE_SERVICE_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY!}` })

type Ref = { filename: string; mime_type: string; storage_url: string }

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { lead_id, insurers, format } = await req.json() as { lead_id?: string; insurers?: string[]; format?: 'xlsx' | 'csv' }
    if (!lead_id || !Array.isArray(insurers) || !insurers.length) return NextResponse.json({ error: 'lead_id and insurers[] required' }, { status: 400 })
    const fmt = format === 'csv' ? 'csv' : 'xlsx'

    // Resolve the lead → thread + contact + email (draft target).
    const lead = await fetch(`${SB_URL}/rest/v1/leads?id=eq.${lead_id}&select=id,first_name,last_name,email,company,thread_id&limit=1`, { headers: sbH(), cache: 'no-store' })
      .then(r => (r.ok ? r.json() : [])).then(rows => rows[0] ?? null)
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    // Build + upload one file per insurer.
    const refs: Ref[] = []
    const summaries: string[] = []
    for (const insurer of insurers) {
      const data = await buildExportData(id, insurer)
      if (!data) continue
      const stem = safeFileStem(data)
      const bytes = fmt === 'csv' ? Buffer.from(buildInsurerCsv(data), 'utf-8') : await buildInsurerXlsx(data)
      const path = `gb-quotes/${id}/${stem}-${Date.now().toString(36)}.${fmt}`
      const up = await fetch(`${SB_URL}/storage/v1/object/email-attachments/${path}`, {
        method: 'POST', headers: { ...storeAuth(), 'Content-Type': fmt === 'csv' ? 'text/csv' : XLSX_MIME }, body: new Uint8Array(bytes),
      })
      if (!up.ok) return NextResponse.json({ error: `Upload failed: ${(await up.text()).slice(0, 160)}` }, { status: 502 })
      refs.push({ filename: `${stem}.${fmt}`, mime_type: fmt === 'csv' ? 'text/csv' : XLSX_MIME, storage_url: path })
      summaries.push(`• ${insurer}: total ${data.totals.total.toLocaleString('en-SG', { style: 'currency', currency: 'SGD' })} incl. GST (${data.lines.length} line(s))`)
    }
    if (!refs.length) return NextResponse.json({ error: 'No files generated for those insurers' }, { status: 404 })

    const body = [
      `Please find attached our group insurance premium comparison${lead.company ? ` for ${lead.company}` : ''}.`,
      '',
      ...summaries,
      '',
      'The attached file(s) show the per-member breakdown for each insurer. Happy to walk through the options.',
    ].join('\n')

    // Reuse the manual-draft flow (handles contact upsert) via the internal API with the
    // caller's cookies, then attach the generated files to the created draft.
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

    await fetch(`${SB_URL}/rest/v1/ai_drafts?id=eq.${draft.draftId}`, { method: 'PATCH', headers: sbH(), body: JSON.stringify({ attachments: refs }) })

    void logActivity({ action: 'gb.quote_reply_prepared', resource_type: 'gb_quotation', resource_id: id, new_value: { lead_id, files: refs.length, format: fmt } })
    return NextResponse.json({ ok: true, lead_id: lead.id, draft_id: draft.draftId, files: refs.length })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
