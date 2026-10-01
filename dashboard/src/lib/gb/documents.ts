/**
 * The insurer brochures and premium calculators.
 *
 * Every gb_rate_tables.source_pdf_url still points at the Supabase Storage bucket retired in
 * September, which now answers every object path with the seven-byte string "trs api". So the
 * source document behind all 612 premiums was unreachable — no re-extraction, no way to check a
 * disputed figure, and no annual re-scan. The five files were recovered from local copies on
 * 2 Oct 2026 and now live in gb_documents.
 *
 * Callers go through here rather than reading a URL, so moving the content to object storage
 * later changes this file and nothing else.
 */
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

function h() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}` }
}

export type DocumentKind = 'brochure' | 'calculator'

export type GbDocument = {
  filename: string
  mimeType: string
  byteSize: number
  sha256: string
  base64: string
}

/** Metadata only — safe to list without pulling several megabytes of base64 per row. */
export async function listDocuments(rateTableId: string): Promise<Omit<GbDocument, 'base64'>[]> {
  const res = await fetch(`${SB_URL}/rest/v1/gb_documents?rate_table_id=eq.${rateTableId}` +
    `&select=kind,filename,mime_type,byte_size,sha256,uploaded_at&order=kind`,
    { headers: h(), cache: 'no-store' })
  if (!res.ok) return []
  const rows = await res.json() as { filename: string; mime_type: string; byte_size: number; sha256: string }[]
  return rows.map(r => ({ filename: r.filename, mimeType: r.mime_type, byteSize: r.byte_size, sha256: r.sha256 }))
}

export async function loadDocument(rateTableId: string, kind: DocumentKind): Promise<GbDocument | null> {
  const res = await fetch(`${SB_URL}/rest/v1/gb_documents?rate_table_id=eq.${rateTableId}` +
    `&kind=eq.${kind}&select=filename,mime_type,byte_size,sha256,content_base64&limit=1`,
    { headers: h(), cache: 'no-store' })
  if (!res.ok) return null
  const row = (await res.json() as { filename: string; mime_type: string; byte_size: number; sha256: string; content_base64: string }[])[0]
  if (!row?.content_base64) return null
  return { filename: row.filename, mimeType: row.mime_type, byteSize: row.byte_size, sha256: row.sha256, base64: row.content_base64 }
}
