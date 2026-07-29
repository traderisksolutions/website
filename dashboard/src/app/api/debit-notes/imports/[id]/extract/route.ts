/**
 * POST /api/debit-notes/imports/[id]/extract
 * Runs the Gemini extraction on the uploaded PDF + suggests a company match, then parks the
 * item at `needs_review` (or `error`) for a human to confirm in the review queue. Idempotent —
 * re-running replaces the extracted candidate.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH, stH }          from '@/lib/debit-note-storage'
import { extractDebitNoteFromPdf, bestCompanyMatch } from '@/lib/debit-note-extract'

export const maxDuration = 120

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const itemRes = await fetch(`${SB_URL}/rest/v1/pdf_import_items?id=eq.${id}&select=storage_url&limit=1`, { headers: sbH(), cache: 'no-store' })
    const item = itemRes.ok ? (await itemRes.json())[0] : null
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await fetch(`${SB_URL}/rest/v1/pdf_import_items?id=eq.${id}`, { method: 'PATCH', headers: sbH(), body: JSON.stringify({ status: 'extracting' }) })

    const pdfRes = await fetch(`${SB_URL}/storage/v1/object/debit-notes/${item.storage_url}`, { headers: stH() })
    if (!pdfRes.ok) {
      await fetch(`${SB_URL}/rest/v1/pdf_import_items?id=eq.${id}`, { method: 'PATCH', headers: sbH(), body: JSON.stringify({ status: 'error', error_message: 'Could not read the uploaded PDF' }) })
      return NextResponse.json({ error: 'Could not read the uploaded PDF' }, { status: 502 })
    }
    const pdfBase64 = Buffer.from(await pdfRes.arrayBuffer()).toString('base64')

    const { data, error } = await extractDebitNoteFromPdf(pdfBase64)
    if (error) {
      await fetch(`${SB_URL}/rest/v1/pdf_import_items?id=eq.${id}`, { method: 'PATCH', headers: sbH(), body: JSON.stringify({ status: 'error', error_message: error }) })
      return NextResponse.json({ error }, { status: 502 })
    }

    let suggestedCompanyId: string | null = null
    let matchConfidence: number | null = null
    if (data.client_name) {
      const companiesRes = await fetch(`${SB_URL}/rest/v1/companies?select=id,name:company_name&limit=1000`, { headers: sbH(), cache: 'no-store' })
      const companies = companiesRes.ok ? await companiesRes.json() as { id: string; name: string }[] : []
      const match = bestCompanyMatch(data.client_name, companies)
      if (match) { suggestedCompanyId = match.id; matchConfidence = match.score }
    }

    await fetch(`${SB_URL}/rest/v1/pdf_import_items?id=eq.${id}`, {
      method: 'PATCH', headers: sbH(),
      body: JSON.stringify({
        status: 'needs_review', extracted: data,
        suggested_company_id: suggestedCompanyId, match_confidence: matchConfidence,
        error_message: null,
      }),
    })

    return NextResponse.json({ ok: true, extracted: data, suggestedCompanyId, matchConfidence })
  } catch (e) {
    await fetch(`${SB_URL}/rest/v1/pdf_import_items?id=eq.${id}`, { method: 'PATCH', headers: sbH(), body: JSON.stringify({ status: 'error', error_message: String(e) }) }).catch(() => {})
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
