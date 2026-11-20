/**
 * Fills the email search index (thread_search) for threads ingest has not refreshed since the
 * migration (supabase/migrations/20261120_thread_search.sql). By hand only; nothing runs it.
 *
 *   set -a; source .env.local; set +a
 *   npx tsx --tsconfig tsconfig.json scripts/backfill-thread-search.ts                 # dry run: counts, writes nothing
 *   npx tsx --tsconfig tsconfig.json scripts/backfill-thread-search.ts --apply         # writes, 100 threads a batch
 *   … --apply --limit 300 --pause 3000 --missing                                        # first 300, 3 s between batches, only threads with no row
 *
 * The database is a db-f1-micro. Each batch is six bounded reads and one upsert (docs/search.md):
 * newest threads first, keyset paging on last_message_at, a pause between batches (default 2 s).
 * No model is called.
 */
import { sb } from '@/lib/crm/db'
import { buildRows, indexReady, writeRows } from '@/lib/search/thread-search-server'

const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined }
const apply = process.argv.includes('--apply')
const missing = process.argv.includes('--missing')
const limit = Number(arg('--limit') ?? Infinity)
const pause = Math.max(500, Number(arg('--pause') ?? 2000))
const BATCH = 100
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

type T = { id: string; last_message_at: string | null }

async function main() {
  if (!(await indexReady())) { console.log('thread_search does not exist: apply supabase/migrations/20261120_thread_search.sql first.'); return }
  let cursor: string | null = null
  let seen = 0, written = 0, removed = 0, bytes = 0, batches = 0
  while (seen < limit) {
    const page: T[] = await sb<T[]>(`email_threads?deleted_at=is.null&last_message_at=not.is.null${cursor ? `&last_message_at=lt.${encodeURIComponent(cursor)}` : ''}&select=id,last_message_at&order=last_message_at.desc&limit=${Math.min(BATCH, limit - seen)}`)
    if (!page.length) break
    cursor = page[page.length - 1].last_message_at
    seen += page.length
    let ids = page.map(t => t.id)
    if (missing) {
      const have = await sb<{ thread_id: string }[]>(`thread_search?thread_id=in.(${ids.join(',')})&select=thread_id`)
      const done = new Set(have.map(h => h.thread_id))
      ids = ids.filter(id => !done.has(id))
    }
    batches++
    if (!ids.length) { console.log(`batch ${batches}: ${page.length} threads, all indexed`); continue }
    if (!apply) {
      if (batches === 1) {
        const { rows } = await buildRows(ids)
        bytes = rows.reduce((n, r) => n + r.body.length + r.people.length + r.attachments.length + r.subject.length, 0)
        console.log(`dry run, batch 1: ${rows.length} rows built, ${Math.round(bytes / 1024)} KB of text; nothing written`)
      } else console.log(`dry run, batch ${batches}: ${ids.length} threads would be built`)
      continue
    }
    const { rows, gone } = await buildRows(ids)
    await writeRows(rows, gone)
    written += rows.length; removed += gone.length
    console.log(`batch ${batches}: ${rows.length} written, ${gone.length} removed (to ${cursor})`)
    await sleep(pause)
  }
  console.log(`${apply ? 'Done' : 'Dry run done'}: ${seen} threads seen in ${batches} batches${apply ? `, ${written} rows written, ${removed} removed` : '. Run with --apply to write.'}`)
}

main().catch(e => { console.error(e); process.exit(1) })
