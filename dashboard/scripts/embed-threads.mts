/**
 * Embeds every thread on this machine's CPU (bge-small-en-v1.5, 384 numbers a thread) into
 * `thread_vectors`, which orders what a case is offered (src/lib/cases/similarity.ts). No model API
 * is called and nothing is paid: the model file (33 MB) is downloaded once and runs locally.
 * Safe to re-run: a thread whose text has not changed is left.
 *
 *   (cd tools/thread-embed && npm ci --ignore-scripts)                                            once
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/embed-threads.mts            counts only
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/embed-threads.mts --write    embed them
 */
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { sb } from '@/lib/crm/db'
import { EMBED_DIMS, EMBED_MODEL, threadText } from '@/lib/cases/similarity'

type Row = Record<string, any>
const write = process.argv.includes('--write')
const TOOL = resolve('tools/thread-embed')
const BATCH = 16

async function pages(query: string, size: number, each: (rows: Row[]) => void): Promise<void> {
  for (let from = 0; ; from += size) {
    const page = await sb<Row[]>(`${query}&limit=${size}&offset=${from}`)
    each(page)
    if (page.length < size) return
  }
}

async function embedder(): Promise<(texts: string[]) => Promise<number[][]>> {
  let entry: string
  try { entry = createRequire(`${TOOL}/package.json`).resolve('@huggingface/transformers') }
  catch { throw new Error('The runtime is not installed. Run: (cd tools/thread-embed && npm ci --ignore-scripts)') }
  const { pipeline, env } = await import(pathToFileURL(entry).href)
  env.cacheDir = `${TOOL}/model-cache`
  const model = await pipeline('feature-extraction', EMBED_MODEL, { dtype: 'q8' })
  return async texts => {
    const v = await model(texts, { pooling: 'cls', normalize: true })
    if (v.dims[1] !== EMBED_DIMS) throw new Error(`The model answered ${v.dims[1]} numbers a text, not ${EMBED_DIMS}.`)
    return texts.map((_, k) => Array.from(v.data.slice(k * EMBED_DIMS, (k + 1) * EMBED_DIMS) as Float32Array).map(x => Math.round(x * 1e6) / 1e6))
  }
}

async function main(): Promise<void> {
  console.log(`Database: ${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://unset').host}`)
  const threads: Row[] = []
  await pages('email_threads?deleted_at=is.null&select=id,subject,display_subject&order=id.asc', 1000, p => threads.push(...p))
  const first = new Map<string, Row[]>()
  await pages('email_messages?deleted_at=is.null&select=thread_id,subject,body_text&order=sent_at.asc,id.asc', 500, p => {
    for (const m of p) { const a = first.get(m.thread_id) ?? []; if (a.length < 6) a.push(m); first.set(m.thread_id, a) }
  })
  const have = new Map<string, string>()
  await pages('thread_vectors?select=thread_id,text_hash&order=thread_id.asc', 1000, p => { for (const v of p) have.set(v.thread_id, v.text_hash) })

  const rows = threads.map(t => {
    const text = threadText(t.display_subject ?? t.subject, first.get(t.id) ?? [])
    return { id: t.id as string, text, hash: createHash('sha256').update(`${EMBED_MODEL}\n${text}`).digest('hex') }
  })
  const blank = rows.filter(r => r.text.length < 3)
  const todo = rows.filter(r => r.text.length >= 3 && have.get(r.id) !== r.hash)
  console.log(`Threads ${rows.length}, embedded ${rows.length - blank.length - todo.length}, to embed ${todo.length}, no text ${blank.length}`)
  if (!write) { console.log('\nCounts only. Pass --write to embed.'); return }
  if (!todo.length) return

  const embed = await embedder()
  const t0 = Date.now()
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH)
    const vectors = await embed(batch.map(r => r.text))
    await sb('thread_vectors?on_conflict=thread_id', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(batch.map((r, k) => ({ thread_id: r.id, model: EMBED_MODEL, text_hash: r.hash, embedding: `[${vectors[k].join(',')}]`, embedded_at: new Date().toISOString() }))),
    })
    if ((i / BATCH) % 20 === 0) console.log(`${Math.min(i + BATCH, todo.length)} of ${todo.length}`)
  }
  console.log(`\nEmbedded ${todo.length} in ${Math.round((Date.now() - t0) / 1000)} s`)
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
