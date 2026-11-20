/**
 * One-time job (20 Nov 2026): moves inline images out of email_messages.body_html into Drive
 * (email-images/stored/<YYYY-MM>/) and writes a signed /api/public/email-image link in their place.
 * See docs/database.md for the run order.
 *
 *   set -a; source .env.local; set +a
 *   npx tsx --tsconfig tsconfig.json scripts/move-inline-images.ts                 dry run (the default): reads, prints, writes nothing
 *   npx tsx --tsconfig tsconfig.json scripts/move-inline-images.ts --apply         uploads, rewrites body_html
 *   options: --max-batches N (stop after N batches), --from <id> (start after this id),
 *            --log <file> (default ~/trs-move-inline-images.jsonl), --undo <file> (default ~/trs-move-inline-images-undo.jsonl.gz)
 *
 * Reads one batch at a time: 25 rows by id order after a cursor, only rows whose body_html holds
 * "data:image", then a 2 s pause. Never a whole-table aggregate.
 * --apply, per row: the original body_html is appended to the undo file (gzip, one JSON line per
 * row) before anything changes; each image is uploaded (or found by its hash) and logged as
 * { message_id, hash, drive_id }; then body_html is patched. A rerun reads the log and uploads
 * nothing already logged; rows already moved no longer match. Gmail keeps every original too.
 * Before the first row changes, the first link is fetched from the live site; anything but 200 stops the job.
 * No model is called. Nothing secret is printed.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { gzipSync } from 'node:zlib'
import { sb, enc } from '@/lib/crm/db'
import { batchPath, planBatch, planInline, replaceDataUris, emailImageUrl, type BatchRow } from '@/lib/mail/inline-images'
import { storeInlineImage } from '@/lib/mail/inline-image-store'

const argv = process.argv.slice(2)
const arg = (name: string) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined }
const APPLY = argv.includes('--apply')
const BATCH = 25, PAUSE_MS = 2_000
const MAX_BATCHES = Number(arg('--max-batches') ?? Infinity)
const LOG = arg('--log') ?? `${homedir()}/trs-move-inline-images.jsonl`
const UNDO = arg('--undo') ?? `${homedir()}/trs-move-inline-images-undo.jsonl.gz`
const mb = (chars: number) => (chars / 1_048_576).toFixed(1)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

type LogLine = { message_id: string; hash: string; drive_id: string } | { message_id: string; done: true; moved_chars: number }

async function readBatch(cursor: string | null): Promise<BatchRow[]> {
  for (let attempt = 1; ; attempt++) {
    try { return await sb<BatchRow[]>(batchPath(cursor, BATCH)) }
    catch (e) {
      if (attempt >= 3) throw e
      console.log(`  read failed (${e instanceof Error ? e.message.slice(0, 120) : 'error'}); retrying in ${attempt * 10} s`)
      await sleep(attempt * 10_000)
    }
  }
}

async function main() {
  console.log(APPLY ? `APPLY: uploading images and rewriting body_html. Log ${LOG}, undo ${UNDO}` : 'DRY RUN: nothing is written (pass --apply to move)')
  const stored = new Map<string, string>(), done = new Set<string>()
  if (existsSync(LOG)) for (const line of readFileSync(LOG, 'utf8').split('\n').filter(Boolean)) {
    const l = JSON.parse(line) as LogLine
    if ('done' in l) done.add(l.message_id); else stored.set(l.hash, l.drive_id)
  }
  if (stored.size || done.size) console.log(`Log: ${stored.size} images already in Drive, ${done.size} rows already moved.`)

  const total = { batches: 0, rows: 0, rowsToChange: 0, images: 0, movedChars: 0, keptImages: 0, keptChars: 0, uploaded: 0, reused: 0, failed: 0 }
  let cursor: string | null = arg('--from') ?? null
  let checked = false
  while (total.batches < MAX_BATCHES) {
    const rows = await readBatch(cursor)
    if (!rows.length) break
    const plan = planBatch(rows)
    total.batches++; total.rows += plan.rows; total.rowsToChange += plan.rowsToChange; total.images += plan.images
    total.movedChars += plan.movedChars; total.keptImages += plan.keptImages; total.keptChars += plan.keptChars
    console.log(`batch ${total.batches}: ${plan.rows} rows, ${plan.rowsToChange} to change, ${plan.images} images (${plan.uniqueImages} distinct), ${mb(plan.movedChars)} MB to move, ${plan.keptImages} kept inline; to ${plan.nextCursor}`)

    if (APPLY) for (const row of rows) {
      const p = planInline(row.body_html ?? '')
      if (!p.move.length) continue
      appendFileSync(UNDO, gzipSync(JSON.stringify({ id: row.id, body_html: row.body_html }) + '\n'))
      const links = new Map<string, string>()
      for (const img of p.move) {
        try {
          let driveId = stored.get(img.hash)
          if (driveId) total.reused++
          else {
            driveId = await storeInlineImage(img.bytes, img.ext, img.mime, img.hash)
            stored.set(img.hash, driveId); total.uploaded++
            appendFileSync(LOG, JSON.stringify({ message_id: row.id, hash: img.hash, drive_id: driveId }) + '\n')
          }
          const link = emailImageUrl(driveId)
          if (!checked) {
            // The live site must serve the first link before any row changes: a different
            // AUTH_SECRET here, or the route not yet deployed, would leave every link a 404.
            const r = await fetch(link)
            if (!r.ok) throw new Error(`FATAL: ${new URL(link).origin} answered ${r.status} for the first stored image. Deploy first and run with production's AUTH_SECRET. No row was changed.`)
            checked = true
          }
          links.set(img.raw, link)
        } catch (e) { if (e instanceof Error && e.message.startsWith('FATAL')) throw e; total.failed++; console.log(`  ${row.id}: image ${img.hash} not stored (${e instanceof Error ? e.message.slice(0, 120) : 'error'}); left inline`) }
      }
      if (!links.size) continue
      await sb(`email_messages?id=eq.${enc(row.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ body_html: replaceDataUris(row.body_html ?? '', links) }) })
      appendFileSync(LOG, JSON.stringify({ message_id: row.id, done: true, moved_chars: p.movedChars }) + '\n')
    }
    cursor = plan.nextCursor
    await sleep(PAUSE_MS)
  }

  console.log(`\n${APPLY ? 'Moved' : 'Would move'}: ${total.images} images from ${total.rowsToChange} of ${total.rows} rows read in ${total.batches} batches, ${mb(total.movedChars)} MB of body_html. Kept inline: ${total.keptImages} (${mb(total.keptChars)} MB).`)
  if (APPLY) console.log(`Uploaded ${total.uploaded}, reused ${total.reused}, failed ${total.failed}. Space returns to the disk only after VACUUM FULL (supabase/migrations/20261120_reclaim_email_space.sql).`)
  if (cursor) console.log(`Last id read: ${cursor} (resume with --from ${cursor}).`)
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
