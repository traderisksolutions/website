/**
 * POST /api/debit-notes/imports/onedrive   { folderPath: string }
 *
 * Pulls every file under a OneDrive folder (recursively) into the `debit-notes` storage bucket
 * and groups them into bundles by their immediate parent subfolder — one subfolder = one
 * renewal/new-business event = one bundle, the natural OneDrive equivalent of "one .zip per
 * event" in the existing manual-upload flow (mirrors the bundle+item creation in
 * imports/bundles/route.ts, just tagged source='onedrive' with source_ref = the subfolder path).
 * Every downstream step — AI extraction, review, approve — is 100% reused, unchanged.
 *
 * Runs in the background (`waitUntil`) since 100+ files can easily exceed a single request's
 * time budget — same fix as the earlier Pricing Matrix extraction 504s. The historical page's
 * existing bundle-list polling picks up new bundles as they're created; there's no separate
 * "import progress" UI in this first version.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { waitUntil }                 from '@vercel/functions'
import { randomUUID }                from 'node:crypto'
import { SB_URL, sbH, uploadPdf }    from '@/lib/debit-note-storage'
import { getOnedriveAccessToken, listOnedriveFolderRecursive, downloadOnedriveFile } from '@/lib/onedrive'
import type { OnedriveFile }         from '@/lib/onedrive'

export const maxDuration = 300

const sanitise = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 150)

async function createBundle(files: { storage_url: string; original_filename: string }[], sourceRef: string): Promise<void> {
  const bundleRes = await fetch(`${SB_URL}/rest/v1/debit_note_bundles`, {
    method: 'POST', headers: sbH(), body: JSON.stringify({ status: 'pending', source: 'onedrive', source_ref: sourceRef }),
  })
  if (!bundleRes.ok) throw new Error(await bundleRes.text())
  const bundle = (await bundleRes.json())[0]
  const itemsRes = await fetch(`${SB_URL}/rest/v1/pdf_import_items`, {
    method: 'POST', headers: sbH(),
    body: JSON.stringify(files.map(f => ({ bundle_id: bundle.id, storage_url: f.storage_url, original_filename: f.original_filename, status: 'pending' }))),
  })
  if (!itemsRes.ok) throw new Error(await itemsRes.text())
}

async function runImport(userId: string, folderPath: string): Promise<void> {
  try {
    const accessToken = await getOnedriveAccessToken(userId)
    const files = await listOnedriveFolderRecursive(accessToken, folderPath)

    const byFolder = new Map<string, OnedriveFile[]>()
    for (const f of files) {
      if (!byFolder.has(f.folder)) byFolder.set(f.folder, [])
      byFolder.get(f.folder)!.push(f)
    }

    for (const [folder, group] of Array.from(byFolder)) {
      const uploaded: { storage_url: string; original_filename: string }[] = []
      for (const f of group) {
        try {
          const bytes = await downloadOnedriveFile(f.downloadUrl)
          const path = `imports/${randomUUID()}/${sanitise(f.name)}`
          await uploadPdf(path, bytes)
          uploaded.push({ storage_url: path, original_filename: f.name })
        } catch (e) {
          console.error(`[onedrive import] file failed "${folder}/${f.name}":`, e)
        }
      }
      if (uploaded.length) await createBundle(uploaded, folder).catch(e => console.error(`[onedrive import] bundle failed "${folder}":`, e))
    }
  } catch (e) {
    console.error('[onedrive import] failed:', e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { folderPath } = await req.json().catch(() => ({})) as { folderPath?: string }
    if (!folderPath?.trim()) return NextResponse.json({ error: 'folderPath required' }, { status: 400 })

    // Fail fast with a clear message if OneDrive isn't connected/has expired, rather than
    // discovering that only in the background job's server logs.
    await getOnedriveAccessToken(user.id)

    waitUntil(runImport(user.id, folderPath.trim()))
    return NextResponse.json({ ok: true, started: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
}
