/**
 * POST /api/onedrive/pull  { path, mode: 'folder' | 'subfolders' }
 * Pulls PDF files from OneDrive into new bundles, staged in the same `debit-notes` Supabase
 * bucket + pdf_import_items rows the manual-upload channel uses — from here on it's the exact
 * same review pipeline. Doesn't trigger extraction itself; the caller loops the returned bundle
 * ids through /api/debit-notes/imports/bundles/[id]/extract, same as the manual-upload flow.
 *
 * mode 'folder': every PDF directly under `path` becomes ONE bundle (one renewal event).
 * mode 'subfolders': every immediate sub-folder of `path` becomes its own bundle from its own
 * PDF children — for a full historical sweep where each of TRS's existing OneDrive sub-folders
 * already is one event.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH, uploadPdf }    from '@/lib/debit-note-storage'
import { getGraphToken, listChildren, downloadItem, type OneDriveItem } from '@/lib/onedrive'
import { randomUUID } from 'node:crypto'

// OneDrive filenames routinely carry brackets/spaces/parens that Supabase Storage's
// S3-compatible backend rejects as an invalid key. Same sanitiser used everywhere else a raw
// filename becomes part of a storage path — original_filename keeps the real name for display.
const sanitise = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 150)

async function pullFolderAsBundle(folderPath: string, token: string): Promise<{ id: string } | { error: string; path: string }> {
  const children = await listChildren(folderPath, token)
  const files = children.filter(c => !c.folder && c.file?.mimeType === 'application/pdf')
  if (!files.length) return { error: 'No PDF files found', path: folderPath }

  const bundleRes = await fetch(`${SB_URL}/rest/v1/debit_note_bundles`, {
    method: 'POST', headers: sbH(), body: JSON.stringify({ status: 'pending', source: 'onedrive', source_ref: folderPath }),
  })
  if (!bundleRes.ok) return { error: await bundleRes.text(), path: folderPath }
  const bundle = (await bundleRes.json())[0]

  for (const f of files) {
    const bytes = await downloadItem(f.id, token)
    const storagePath = `imports/onedrive-${randomUUID()}/${sanitise(f.name)}`
    await uploadPdf(storagePath, bytes)
    await fetch(`${SB_URL}/rest/v1/pdf_import_items`, {
      method: 'POST', headers: sbH(),
      body: JSON.stringify({ bundle_id: bundle.id, storage_url: storagePath, original_filename: f.name, status: 'pending' }),
    })
  }
  return { id: bundle.id as string }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { path, mode } = await req.json() as { path?: string; mode?: 'folder' | 'subfolders' }
    if (!path) return NextResponse.json({ error: 'path required' }, { status: 400 })

    const token = await getGraphToken()

    if (mode === 'subfolders') {
      const children = await listChildren(path, token)
      const subfolders = children.filter((c: OneDriveItem) => c.folder)
      if (!subfolders.length) return NextResponse.json({ error: 'No sub-folders found under this path' }, { status: 404 })
      const results = await Promise.all(subfolders.map(f => pullFolderAsBundle(`${path.replace(/\/+$/, '')}/${f.name}`, token)))
      return NextResponse.json({ results })
    }

    const result = await pullFolderAsBundle(path, token)
    return NextResponse.json({ results: [result] })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
