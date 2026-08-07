/**
 * GET  /api/engagement/drafts        → list saved "new compose" drafts (status='draft'), newest first
 * POST /api/engagement/drafts  { id?, toEmail, toName?, cc?, subject, body, attachment?, companyId? }
 *      Upserts one ai_drafts row — `id` present updates it in place (repeated saves from the same
 *      compose session don't pile up duplicates), absent creates one. thread_id stays null (no
 *      thread exists yet for a threadless "new email" draft); contact_id is resolved the same way
 *      /api/nexus/draft-create already does (upsert-by-email into `contacts`), since it's a
 *      required column on ai_drafts — reused here rather than re-derived.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
function sbH(prefer = 'return=representation') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

async function resolveContactId(email: string): Promise<string | null> {
  const clean = email.toLowerCase().trim()
  if (!clean.includes('@')) return null
  const res = await fetch(`${SB_URL}/rest/v1/contacts?on_conflict=email`, {
    method: 'POST', headers: sbH('return=representation,resolution=merge-duplicates'),
    body: JSON.stringify({ email: clean, source: 'engagement_draft' }),
  })
  const rows = res.ok ? await res.json() : []
  if (Array.isArray(rows) && rows[0]?.id) return rows[0].id
  const fallback = await fetch(`${SB_URL}/rest/v1/contacts?email=eq.${encodeURIComponent(clean)}&select=id&limit=1`, { headers: sbH() })
  const fRows = fallback.ok ? await fallback.json() : []
  return Array.isArray(fRows) ? (fRows[0]?.id ?? null) : null
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const res = await fetch(`${SB_URL}/rest/v1/ai_drafts?status=eq.draft&select=id,to_email,cc,subject,body,attachments,created_at&order=created_at.desc&limit=100`, { headers: sbH(), cache: 'no-store' })
  return NextResponse.json(res.ok ? await res.json() : [])
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const b = await req.json() as {
      id?: string; toEmail: string; toName?: string; cc?: string
      subject: string; body: string
      attachment?: { filename: string; mime_type?: string; storage_url: string }
      companyId?: string
    }
    if (!b.toEmail?.trim()) return NextResponse.json({ error: 'toEmail required' }, { status: 400 })

    const contactId = await resolveContactId(b.toEmail)
    if (!contactId) return NextResponse.json({ error: 'Could not resolve a contact for this recipient' }, { status: 400 })

    const row = {
      contact_id: contactId, thread_id: null, status: 'draft', channel: 'email', email_type: 'ENGAGEMENT_DRAFT',
      to_email: b.toEmail.trim(), cc: b.cc ?? null, subject: b.subject ?? '', body: b.body ?? '',
      attachments: b.attachment ? [b.attachment] : [],
    }

    if (b.id) {
      const res = await fetch(`${SB_URL}/rest/v1/ai_drafts?id=eq.${b.id}`, { method: 'PATCH', headers: sbH('return=representation'), body: JSON.stringify(row) })
      if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 502 })
      const updated = (await res.json())[0]
      return NextResponse.json({ id: updated?.id ?? b.id })
    }

    const res = await fetch(`${SB_URL}/rest/v1/ai_drafts`, { method: 'POST', headers: sbH('return=representation'), body: JSON.stringify(row) })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 502 })
    const created = (await res.json())[0]
    return NextResponse.json({ id: created?.id })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
