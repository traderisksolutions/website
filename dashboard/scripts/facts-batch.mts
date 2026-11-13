/**
 * The fact re-read without a model API: reads are exported in batches for Claude to answer, and
 * the answers come back through the same checker as a live read (finishRead: the catalogue, the
 * addresses on the email, the quote word for word). Used when Jarod asked for no Gemini spend
 * (13 Nov 2026).
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/facts-batch.mts export <dir> [per-batch]
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/facts-batch.mts import <dir>
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/facts-batch.mts retire <archive.json>
 *
 * export writes <dir>/systems.json (the two reader prompts; the insurer one names the client as
 *   {CLIENT}) and <dir>/batch-NNN.jsonl, one read per line: { key, reader, client, prompt }.
 *   Emails already read (FACTS_PROGRESS) and emails not worth a read are left out.
 * import reads <dir>/answer-NNN.jsonl, one per line: { key, facts: [{ key, value, quote }] }, in
 *   batch order (oldest emails first, so a newer value replaces an older one), checks every fact
 *   and writes it. Progress is kept, so an import can be rerun.
 * retire copies every current email fact whose key is not in the catalogue to <archive.json>, then
 *   deletes those rows, and renames the record keys that moved (company.* → business.*,
 *   policy.X.insured.Y → policy.X.insured). Run it after the import.
 *
 * No step calls a model: the model's part is Claude answering the batch files.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { sb, sbTry } from '@/lib/crm/db'
import { CLIENT_SYSTEM, INSURER_SYSTEM, finishRead, prepareRead, writeFacts } from '@/lib/admin/a/knowledge'
import { factReader } from '@/lib/admin/k/shape'
import { directory } from '@/lib/admin/k/deposit'
import { catalogueFor, entryOf, LINE_SLUGS } from '@/lib/admin/k/catalogue'

type Row = Record<string, any>
const [mode, dirArg, sizeArg] = process.argv.slice(2)
if (!dirArg || !['export', 'import', 'retire'].includes(mode)) throw new Error('usage: export|import <dir> [per-batch] | retire <archive.json>')
const PROGRESS = process.env.FACTS_PROGRESS ?? `${dirArg}/progress.json`
const done = new Set<string>(existsSync(PROGRESS) ? JSON.parse(readFileSync(PROGRESS, 'utf8')) : [])
const all = async (path: string): Promise<Row[]> => { const out: Row[] = []; for (let o = 0; ; o += 1000) { const p = await sb<Row[]>(`${path}&order=id&offset=${o}&limit=1000`); out.push(...p); if (p.length < 1000) break } return out }

if (mode === 'retire') {
  const facts = await all('company_facts?superseded_by=is.null&source_kind=eq.email&select=*')
  const old = facts.filter(f => !entryOf(f.key))
  writeFileSync(dirArg, JSON.stringify(old, null, 1))
  console.log(`archived ${old.length} of ${facts.length} email facts to ${dirArg}`)
  for (let i = 0; i < old.length; i += 100) await sb(`company_facts?id=in.(${old.slice(i, i + 100).map(f => f.id).join(',')})`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  const renames: [string, (k: string) => string | null][] = [
    ['company.name', () => 'business.name'], ['company.uen', () => 'business.uen'], ['company.parent', () => 'business.parent'], ['company.relation', () => 'business.relation'],
  ]
  let renamed = 0
  for (const [from, to] of renames) { const r = await sbTry<Row[]>(`company_facts?key=eq.${from}`, [], { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ key: to(from), topic: 'business' }) }); renamed += r.length }
  const insured = await all('company_facts?key=like.policy.*.insured.*&select=id,key')
  for (const f of insured) { await sbTry(`company_facts?id=eq.${f.id}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ key: f.key.replace(/\.insured\..+$/, '.insured'), topic: 'cover' }) }); renamed++ }
  console.log(`deleted ${old.length}; renamed ${renamed} record keys`)
  process.exit(0)
}

if (mode === 'export') {
  mkdirSync(dirArg, { recursive: true })
  const dir = await directory(true)
  const led = await all('company_ledger?source_table=eq.email_messages&kind=eq.email_in&select=id,company_id,source_id,party,actor,summary,title,kind,occurred_at')
  const work = led.map(e => ({ e, reader: factReader(e, dir.byId.get(e.company_id)?.kind) })).filter((x): x is { e: Row; reader: 'client' | 'insurer' } => !!x.reader)
    .filter(w => !done.has(`${w.e.source_id}|${w.e.company_id}`))
    .sort((a, b) => String(a.e.occurred_at).localeCompare(String(b.e.occurred_at)))
  const render = (t: string, r: 'client' | 'insurer') => t.replace('%KEYS%', catalogueFor(r)).replace('%LINES%', LINE_SLUGS.join(', ')).replace(/%CLIENT%/g, '{CLIENT}')
  writeFileSync(`${dirArg}/systems.json`, JSON.stringify({ client: render(CLIENT_SYSTEM, 'client'), insurer: render(INSURER_SYSTEM, 'insurer') }, null, 1))
  const size = Number(sizeArg ?? 40)
  let batch: string[] = [], n = 0, items = 0, chars = 0, skipped = 0
  const flush = () => { if (!batch.length) return; writeFileSync(`${dirArg}/batch-${String(++n).padStart(3, '0')}.jsonl`, batch.join('\n') + '\n'); batch = [] }
  for (const w of work) {
    const p = await prepareRead(w.e.source_id, w.e.company_id, w.reader)
    if (!p) { skipped++; done.add(`${w.e.source_id}|${w.e.company_id}`); continue }
    batch.push(JSON.stringify({ key: `${p.messageId}|${p.companyId}`, reader: p.reader, client: String(dir.byId.get(p.companyId)?.company_name ?? ''), prompt: p.prompt }))
    items++; chars += p.prompt.length
    if (batch.length >= size) flush()
  }
  flush()
  writeFileSync(PROGRESS, JSON.stringify([...done]))
  console.log(JSON.stringify({ readable: work.length, exported: items, skipped_not_worth_a_read: skipped, batches: n, prompt_chars: chars }))
} else {
  const files = readdirSync(dirArg).filter(f => /^answer-\d+\.jsonl$/.test(f)).sort()
  const tally = { answers: 0, facts: 0, inserted: 0, superseded: 0, bad: 0 }
  for (const f of files) {
    for (const line of readFileSync(`${dirArg}/${f}`, 'utf8').split('\n').filter(l => l.trim())) {
      let a: { key?: string; facts?: unknown }
      try { a = JSON.parse(line) } catch { tally.bad++; continue }
      if (!a.key || done.has(a.key)) continue
      const [messageId, companyId] = a.key.split('|')
      const dir = await directory()
      const [e] = await sb<Row[]>(`company_ledger?source_table=eq.email_messages&source_id=eq.${messageId}&company_id=eq.${companyId}&select=kind,party,actor,summary,title&limit=1`)
      const reader = e ? factReader(e, dir.byId.get(companyId)?.kind) : null
      const p = reader ? await prepareRead(messageId, companyId, reader) : null
      if (!p) { done.add(a.key); continue }
      const facts = finishRead(p, { facts: Array.isArray(a.facts) ? a.facts : [] })
      const r = await writeFacts(facts, 'knowledge_keeper')
      tally.answers++; tally.facts += facts.length; tally.inserted += r.inserted; tally.superseded += r.superseded
      done.add(a.key)
    }
    writeFileSync(PROGRESS, JSON.stringify([...done]))
    console.log(f, JSON.stringify(tally))
  }
}
