/**
 * POST /api/debit-notes/imports/bundles/from-zip  { storage_url, original_filename }
 * A renewal event's 2-3 files are often already zipped together — this unpacks the uploaded
 * zip (already in Drive, uploaded the same way individual PDFs are) into its member PDFs,
 * registers them as one bundle exactly like the manual multi-file picker does, and discards the
 * temp zip. Extraction is triggered separately by the caller, same as every other bundle-creation
 * path.
 */
import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbH, storeImportFile, downloadObject, deleteObject } from '@/lib/debit-note-storage'
import AdmZip                        from 'adm-zip'
import { withStaff } from '@/lib/auth/guard'

export const maxDuration = 60

export const POST = withStaff(async (req: NextRequest) => {
  try {
    const { storage_url: storageUrl } = await req.json() as { storage_url?: string; original_filename?: string }
    if (!storageUrl) return NextResponse.json({ error: 'storage_url required' }, { status: 400 })

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
      const ref = await storeImportFile(filename, entry.getData())
      const itemRes = await fetch(`${SB_URL}/rest/v1/pdf_import_items`, {
        method: 'POST', headers: sbH(),
        body: JSON.stringify({ bundle_id: bundle.id, storage_url: ref, original_filename: filename, status: 'pending' }),
      })
      if (!itemRes.ok) return NextResponse.json({ error: `Could not record ${filename}: ${(await itemRes.text()).slice(0, 200)}` }, { status: 502 })
    }

    await deleteObject(storageUrl)

    return NextResponse.json({ id: bundle.id, fileCount: pdfEntries.length })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}, { error: 'Not authenticated' })
