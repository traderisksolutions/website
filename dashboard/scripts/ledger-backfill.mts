/**
 * Builds the company ledger from everything already on file: emails, rebuilt history, filed
 * documents, policies, debit notes, claims and case events. Idempotent (rows already logged are
 * left alone) and safe to stop and re-run.
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/ledger-backfill.mts dry   [days]
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/ledger-backfill.mts write [days]
 *
 * [days] limits emails and rebuilt messages to that many days back; the other sources are always
 * loaded whole. dry counts what would be written and writes nothing.
 */
import { sbTry } from '@/lib/crm/db'
import { directory, messageTargets, eventTargets, writeTargets, type Target, type DepositTable } from '@/lib/admin/k/deposit'

type Row = Record<string, any>
const [mode = 'dry', daysArg] = process.argv.slice(2)
if (mode !== 'dry' && mode !== 'write') throw new Error('mode: dry | write')
const WRITE = mode === 'write'
const since = daysArg ? new Date(Date.now() - Number(daysArg) * 86_400_000).toISOString() : null
const dir = await directory(true)

const byKind: Record<string, number> = {}
const companies = new Set<string>()
let unfiled = 0
let written = 0
const seen = new Set<string>()
async function take(all: Target[]) {
  // Rebuilt history arrives twice (under its message and on its own pass): count and send it once.
  const targets = all.filter(t => { const k = `${t.draft.source_table}:${t.draft.source_id}:${t.company_id}`; if (seen.has(k)) return false; seen.add(k); return true })
  for (const t of targets) { byKind[t.draft.kind] = (byKind[t.draft.kind] ?? 0) + 1; companies.add(t.company_id) }
  if (WRITE && targets.length) written += await writeTargets(targets, dir)
}

/** Keyset paging by id, so a page never shifts under concurrent inserts. */
async function pages(path: string, select: string, size: number, fn: (rows: Row[]) => Promise<void>) {
  let after = '00000000-0000-0000-0000-000000000000'
  let n = 0
  for (;;) {
    const rows = await sbTry<Row[]>(`${path}${path.includes('?') ? '&' : '?'}id=gt.${after}&select=${select}&order=id.asc&limit=${size}`, [])
    if (!rows.length) break
    await fn(rows)
    n += rows.length
    after = rows[rows.length - 1].id
    if (n % 5000 < size) console.log(`  ${path.split('?')[0]} ${n}`)
    if (rows.length < size) break
  }
  return n
}

const MSG = 'id,thread_id,gmail_message_id,direction,from_address,subject,body_text,sent_at,created_at'
const counts: Record<string, number> = {}
counts.email_messages = await pages(`email_messages?deleted_at=is.null${since ? `&sent_at=gte.${since}` : ''}`, MSG, 300, async rows => {
  const r = await messageTargets(rows, dir)
  unfiled += r.unfiled.length
  // messageTargets also logs rebuilt history found under these messages
  await take(r.targets)
})
for (const [table, path, select, size] of [
  ['rebuilt_messages', `rebuilt_messages${since ? `?created_at=gte.${since}` : ''}`, '*', 500],
  ['policy_documents', 'policy_documents?status=neq.ignored&drive_url=not.is.null', '*', 500],
  ['policies', 'policies', 'id,company_id,policy_number,insurer,class_of_insurance,product_line,label,start_date,end_date,lifecycle,drive_folder_url', 500],
  ['debit_notes', 'debit_notes', '*', 500],
  ['claims', 'claims', '*', 500],
  ['work_item_events', 'work_item_events', '*', 500],
] as [Exclude<DepositTable, 'email_messages'>, string, string, number][]) {
  counts[table] = await pages(path, select, size, async rows => take(await eventTargets(table, rows, dir)))
}

console.log(JSON.stringify({ mode, since, sources: counts, entries_by_kind: byKind, entries: Object.values(byKind).reduce((a, b) => a + b, 0), companies: companies.size, messages_on_unfiled_threads: unfiled, rows_sent: written }, null, 1))
