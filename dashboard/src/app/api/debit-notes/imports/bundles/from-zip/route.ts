/**
 * POST /api/debit-notes/imports/bundles/from-zip  { storageUrl, originalFilename }
 * A renewal event's 2-3 files are often already zipped together — this unpacks the uploaded
 * zip (already staged via the same signed-URL flow individual PDFs use) into its member PDFs,
 * registers them as one bundle exactly like the manual multi-file picker does, and discards the
 * temp zip. Extraction is triggered separately by the caller, same as every other bundle-creation
 * path.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH, uploadPdf, downloadObject, deleteObject } from '@/lib/debit-note-storage'
import { randomUUID }                from 'node:crypto'
import AdmZip                        from 'adm-zip'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { storageUrl } = await req.json() as { storageUrl?: string; originalFilename?: string }
    if (!storageUrl) return NextResponse.json({ error: 'storageUrl required' }, { status: 400 })

    const zipBytes = await downloadObject(storageUrl)
    const zip = new AdmZip(zipBytes)
    const pdfEntries = zip.getEntries().filter(e => !e.isDirectory && e.entryName.toLowerCase().endsWith('.pdf'))
    if (!pdfEntries.length) return NextResponse.json({ error: 'No PDF files found inside that zip' }, { status: 400 })

    const bundleRes = await fetch(`${SB_URL}/rest/v1/debit_note_bundles`, {
      method: 'POST', headers: sbH(), body: JSON.stringify({ status: 'pending', source: 'manual_upload' }),
    })
    if (!bundleRes.ok) return NextResponse.json({ error: await bundleRes.text() }, { status: 502 })
    const bundle = (await bundleRes.json())[0]

    for (const entry of pdfEntries) {
      const filename = entry.entryName.split('/').pop() ?? entry.entryName
      const path = `imports/zip-${randomUUID()}/${filename}`
      await uploadPdf(path, entry.getData())
      await fetch(`${SB_URL}/rest/v1/pdf_import_items`, {
        method: 'POST', headers: sbH(),
        body: JSON.stringify({ bundle_id: bundle.id, storage_url: path, original_filename: filename, status: 'pending' }),
      })
    }

    await deleteObject(storageUrl)

    return NextResponse.json({ id: bundle.id, fileCount: pdfEntries.length })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
