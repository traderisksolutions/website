/**
 * Backfill the data room from every email attachment already on file (29 Oct 2026: 8,536 rows,
 * about 2,270 real documents once signature images are dropped).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/data-room-backfill.mts --batch 100 --max 3000
 *
 * Runs against the database and Drive named in .env.local; needs GMAIL_* for the bytes. Each
 * attachment is handled once (unique email_attachment_id), so it is safe to stop and re-run.
 */
import { catchUp } from '@/lib/documents/ingest'

const arg = (name: string, d: number) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? Number(process.argv[i + 1]) : d }
const batch = arg('batch', 100), max = arg('max', 3000)
let total = 0
while (total < max) {
  const r = await catchUp({ attachments: batch, retries: 20 })
  total += r.ingested
  console.log(new Date().toISOString(), r)
  if (r.ingested === 0) break
}
console.log(`done: ${total} attachments`)
