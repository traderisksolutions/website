/**
 * Labels every thread by rule (src/lib/cases/labels.ts): code only, no model call. Safe to re-run:
 * a thread a person labelled keeps that label, and a thread already on the rule's label is left.
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/label-backfill.mts            counts only
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/label-backfill.mts --write    label them
 */
import { sb } from '@/lib/crm/db'
import { labelThreadsByRule } from '@/lib/cases/sources-store'
import { LABELS, LABEL_NAME } from '@/lib/cases/labels'

type Row = { id: string; label: string | null; label_by: string | null }
const write = process.argv.includes('--write')
const PAGE = 1000

async function threads(): Promise<Row[]> {
  const out: Row[] = []
  for (let from = 0; ; from += PAGE) {
    const page = await sb<Row[]>(`email_threads?deleted_at=is.null&select=id,label,label_by&order=id.asc&limit=${PAGE}&offset=${from}`)
    out.push(...page)
    if (page.length < PAGE) return out
  }
}

function table(rows: Row[]): void {
  const total = rows.length
  for (const l of LABELS) {
    const n = rows.filter(r => r.label === l).length
    console.log(`${LABEL_NAME[l].padEnd(20)} ${String(n).padStart(6)}  ${total ? ((100 * n) / total).toFixed(1).padStart(5) : '  0.0'}%`)
  }
  console.log(`${'No label'.padEnd(20)} ${String(rows.filter(r => !r.label).length).padStart(6)}`)
  console.log(`${'Set by a person'.padEnd(20)} ${String(rows.filter(r => r.label_by && r.label_by !== 'rule').length).padStart(6)}`)
  console.log(`${'Threads'.padEnd(20)} ${String(total).padStart(6)}`)
}

async function main(): Promise<void> {
  console.log(`Database: ${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://unset').host}`)
  const before = await threads()
  if (!write) { table(before); console.log('\nCounts only. Pass --write to label.'); return }
  const sum = { labelled: 0, kept: 0, changed: 0 }
  for (let i = 0; i < before.length; i += 200) {
    const r = await labelThreadsByRule(before.slice(i, i + 200).map(t => t.id))
    sum.labelled += r.labelled; sum.kept += r.kept; sum.changed += r.changed
    console.log(`${Math.min(i + 200, before.length)} of ${before.length}`)
  }
  console.log(`\nLabelled ${sum.labelled}, a person's label kept ${sum.kept}, changed ${sum.changed}\n`)
  table(await threads())
}

main().catch(e => { console.error(e); process.exit(1) })
