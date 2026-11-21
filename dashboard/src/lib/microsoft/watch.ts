/**
 * The Microsoft folder watch (docs/eb-v2.md P7): each run reads the watched folder's changes since the
 * last run (Graph delta; the link is kept in app_settings `ms_graph_delta`), and every new file becomes
 * a data-room record (policy_documents, source 'onedrive', one per item) typed by its name, matched to
 * the client its folder names, and filed into the one Drive tree (documents/ingest.ts fileDocument).
 * Off unless microsoftWatchOn(). No model; nothing is sent.
 */
import { db, rows } from '@/lib/db/client'
import { classifyByName } from '@/lib/documents/taxonomy'
import { fileDocument } from '@/lib/documents/ingest'
import type { PolicyDocument } from '@/lib/documents/store'
import { graph, graphBytes, microsoftWatchOn } from './graph'
import { clientFolderOf, matchCompany, newFiles, type DeltaItem } from './watch-rules'

const DELTA_KEY = 'ms_graph_delta'
const MAX_FILES = 50
const MAX_BYTES = 25 * 1024 * 1024

export type WatchResult = { off: true } | { off: false; seen: number; added: number; filed: number; skipped: number; errors: string[] }

export async function watchMicrosoftFolder(): Promise<WatchResult> {
  if (!microsoftWatchOn()) return { off: true }
  const drive = process.env.MS_WATCH_DRIVE_ID!, folder = process.env.MS_WATCH_FOLDER ?? ''
  const [saved] = await rows('Microsoft delta link', db().from('app_settings').select('value').eq('key', DELTA_KEY).limit(1))
  let url = saved?.value || (folder ? `/drives/${encodeURIComponent(drive)}/root:/${folder.split('/').map(encodeURIComponent).join('/')}:/delta` : `/drives/${encodeURIComponent(drive)}/root/delta`)
  const items: DeltaItem[] = []
  let next: string | null = null
  for (let page = 0; page < 20; page++) {
    const r = await graph<{ value: DeltaItem[]; '@odata.nextLink'?: string; '@odata.deltaLink'?: string }>(url)
    items.push(...r.value)
    if (r['@odata.nextLink']) { url = r['@odata.nextLink']; continue }
    next = r['@odata.deltaLink'] ?? null
    break
  }
  const files = newFiles(items).slice(0, MAX_FILES)
  const companies = (await rows('Companies', db().from('companies').select('id,company_name').limit(5000))).map(c => ({ id: c.id, name: c.company_name ?? '' }))
  let added = 0, filed = 0, skipped = 0
  const errors: string[] = []
  for (const f of files) {
    try {
      if ((f.size ?? 0) > MAX_BYTES) { skipped++; continue }
      const bytes = await graphBytes(drive, f.id)
      const companyId = matchCompany(clientFolderOf(f.path, folder), companies)
      const row = { external_item_id: f.id, source: 'onedrive', filename: f.name, mime_type: f.mimeType, size_bytes: f.size, received_at: f.modified,
        company_id: companyId, doc_type: classifyByName(f.name) ?? 'other', classified_by: 'rule', needs_review: true, status: 'unfiled' }
      const [doc] = await rows('Microsoft file record', db().from('policy_documents').upsert(row, { onConflict: 'external_item_id', ignoreDuplicates: true }).select('*')) as unknown as PolicyDocument[]
      if (!doc) { skipped++; continue }
      added++
      if (doc.company_id) { const r = await fileDocument(doc, bytes); if (r.status === 'filed') filed++ }
    } catch (e) { errors.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200)) }
  }
  // The delta link moves on only once this page of changes is handled.
  if (next) await db().from('app_settings').upsert({ key: DELTA_KEY, value: next }, { onConflict: 'key' })
  return { off: false, seen: files.length, added, filed, skipped, errors }
}
