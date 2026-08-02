/**
 * POST /api/debit-notes/imports/bundles/[id]/extract
 * Runs the Gemini extraction on every member file individually (classifying doc_type along the
 * way), merges the results via mergeBundleExtractions, suggests a company match on the merged
 * client name, and parks the bundle at `needs_review` (or `error` if every file failed) for a
 * human to confirm. Idempotent — re-running replaces the extracted candidate.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH, stH }          from '@/lib/debit-note-storage'
import { extractDebitNoteFromPdf, mergeBundleExtractions, bestCompanyMatch, type DocType, type ExtractedDebitNote } from '@/lib/debit-note-extract'

export const maxDuration = 180

type Item = { id: string; storage_url: string }

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const itemsRes = await fetch(`${SB_URL}/rest/v1/pdf_import_items?bundle_id=eq.${id}&select=id,storage_url`, { headers: sbH(), cache: 'no-store' })
    const items = itemsRes.ok ? await itemsRes.json() as Item[] : []
    if (!items.length) return NextResponse.json({ error: 'Bundle has no files' }, { status: 404 })

    await fetch(`${SB_URL}/rest/v1/debit_note_bundles?id=eq.${id}`, { method: 'PATCH', headers: sbH(), body: JSON.stringify({ status: 'extracting' }) })

    const extracted: { docType: DocType; data: ExtractedDebitNote }[] = []
    for (const item of items) {
      const pdfRes = await fetch(`${SB_URL}/storage/v1/object/debit-notes/${item.storage_url}`, { headers: stH() })
      if (!pdfRes.ok) {
        console.error(`[debit-note-extract] bundle ${id} item ${item.id} (${item.storage_url}): could not read PDF from storage (${pdfRes.status})`)
        await fetch(`${SB_URL}/rest/v1/pdf_import_items?id=eq.${item.id}`, { method: 'PATCH', headers: sbH(), body: JSON.stringify({ status: 'error', error_message: 'Could not read the uploaded PDF' }) })
        continue
      }
      const pdfBase64 = Buffer.from(await pdfRes.arrayBuffer()).toString('base64')
      const { data, error } = await extractDebitNoteFromPdf(pdfBase64)
      if (error) console.error(`[debit-note-extract] bundle ${id} item ${item.id} (${item.storage_url}): ${error}`)
      await fetch(`${SB_URL}/rest/v1/pdf_import_items?id=eq.${item.id}`, {
        method: 'PATCH', headers: sbH(),
        body: JSON.stringify({ status: error ? 'error' : 'needs_review', doc_type: data.doc_type, extracted: data, error_message: error ?? null }),
      })
      if (!error) extracted.push({ docType: data.doc_type, data })
    }

    if (!extracted.length) {
      console.error(`[debit-note-extract] bundle ${id}: every file failed to extract`)
      await fetch(`${SB_URL}/rest/v1/debit_note_bundles?id=eq.${id}`, { method: 'PATCH', headers: sbH(), body: JSON.stringify({ status: 'error' }) })
      return NextResponse.json({ error: 'Every file in this bundle failed to extract' }, { status: 502 })
    }

    const { merged, warning } = mergeBundleExtractions(extracted)

    let suggestedCompanyId: string | null = null
    let matchConfidence: number | null = null
    if (merged.client_name) {
      const companiesRes = await fetch(`${SB_URL}/rest/v1/companies?select=id,name:company_name&limit=1000`, { headers: sbH(), cache: 'no-store' })
      const companies = companiesRes.ok ? await companiesRes.json() as { id: string; name: string }[] : []
      const match = bestCompanyMatch(merged.client_name, companies)
      if (match) { suggestedCompanyId = match.id; matchConfidence = match.score }
    }

    await fetch(`${SB_URL}/rest/v1/debit_note_bundles?id=eq.${id}`, {
      method: 'PATCH', headers: sbH(),
      body: JSON.stringify({ status: 'needs_review', merged, consistency_warning: warning, suggested_company_id: suggestedCompanyId, match_confidence: matchConfidence }),
    })

    return NextResponse.json({ ok: true, merged, warning, suggestedCompanyId, matchConfidence })
  } catch (e) {
    await fetch(`${SB_URL}/rest/v1/debit_note_bundles?id=eq.${id}`, { method: 'PATCH', headers: sbH(), body: JSON.stringify({ status: 'error' }) }).catch(() => {})
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
