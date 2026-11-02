/**
 * Reads every file in a debit note bundle with the same extraction a manual upload uses, merges
 * the results and parks the bundle at needs_review for a person to confirm. Shared by the upload
 * route (under a broker's session) and the policy reader (from the queue, no session), so an
 * insurer's tax invoice on a bound policy reaches the review queue without anyone uploading it.
 */
import { SB_URL, sbH, downloadObject } from '@/lib/debit-note-storage'
import { extractDebitNoteFromPdf, mergeBundleExtractions, bestCompanyMatch, type DocType, type ExtractedDebitNote } from '@/lib/debit-note-extract'

type Item = { id: string; storage_url: string }
export type ExtractOutcome = { ok: true; merged: ExtractedDebitNote; warning: string | null; suggestedCompanyId: string | null; matchConfidence: number | null } | { ok: false; error: string; status: number }

export async function extractBundle(id: string): Promise<ExtractOutcome> {
  try {
    const itemsRes = await fetch(`${SB_URL}/rest/v1/pdf_import_items?bundle_id=eq.${id}&select=id,storage_url`, { headers: sbH(), cache: 'no-store' })
    const items = itemsRes.ok ? await itemsRes.json() as Item[] : []
    if (!items.length) return { ok: false, error: 'Bundle has no files', status: 404 }
    await fetch(`${SB_URL}/rest/v1/debit_note_bundles?id=eq.${id}`, { method: 'PATCH', headers: sbH(), body: JSON.stringify({ status: 'extracting' }) })
    const extracted: { docType: DocType; data: ExtractedDebitNote }[] = []
    for (const item of items) {
      let pdf: Buffer
      try { pdf = await downloadObject(item.storage_url) }
      catch (e) {
        const message = e instanceof Error ? e.message : 'Could not read the uploaded PDF'
        console.error(`[debit-note-extract] bundle ${id} item ${item.id} (${item.storage_url}): ${message}`)
        await fetch(`${SB_URL}/rest/v1/pdf_import_items?id=eq.${item.id}`, { method: 'PATCH', headers: sbH(), body: JSON.stringify({ status: 'error', error_message: message }) })
        continue
      }
      const { data, error } = await extractDebitNoteFromPdf(pdf.toString('base64'))
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
      return { ok: false, error: 'Every file in this bundle failed to extract', status: 502 }
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
    return { ok: true, merged, warning: warning ?? null, suggestedCompanyId, matchConfidence }
  } catch (e) {
    await fetch(`${SB_URL}/rest/v1/debit_note_bundles?id=eq.${id}`, { method: 'PATCH', headers: sbH(), body: JSON.stringify({ status: 'error' }) }).catch(() => {})
    return { ok: false, error: String(e), status: 500 }
  }
}
