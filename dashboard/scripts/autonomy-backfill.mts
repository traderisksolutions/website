/**
 * Computes outbound_origin for the last [days] (default 90) of outgoing mail, a week at a time.
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/autonomy-backfill.mts dry   [days]
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/autonomy-backfill.mts write [days]
 *
 * dry classifies and matches everything and prints what the metric would show; it writes nothing.
 */
import { computeWindow } from '@/lib/analytics/autonomy/compute'
import { metrics, type OriginRow } from '@/lib/analytics/autonomy/metrics'

const [mode = 'dry', daysArg = '90'] = process.argv.slice(2)
if (mode !== 'dry' && mode !== 'write') throw new Error('mode: dry | write')
const days = Number(daysArg)
const end = Date.now()
const rows: OriginRow[] = []
let messages = 0
for (let d = days; d > 0; d -= 7) {
  const from = new Date(end - d * 86_400_000).toISOString()
  const to = new Date(end - Math.max(0, d - 7) * 86_400_000).toISOString()
  const r = await computeWindow(from, to, { write: mode === 'write' })
  rows.push(...r.rows); messages += r.messages
  console.log(from.slice(0, 10), '→', to.slice(0, 10), r.messages, JSON.stringify(r.byOrigin))
}
const m = metrics(rows)
const pct = (n: number) => `${(n * 100).toFixed(1)}%`
console.log(`\n${mode}: ${messages} outgoing messages, ${m.excluded} excluded (internal mail, agent mailboxes)`)
console.log(`share ${pct(m.total.share)} · effort share ${pct(m.total.effortShare)} · agent ${m.total.agent} (auto ${m.total.auto}) · hand ${m.total.hand} · unedited ${m.total.uneditedRate == null ? '—' : pct(m.total.uneditedRate)}`)
console.log('\nby week'); for (const b of m.byWeek) console.log(`  ${b.key}  ${pct(b.share).padStart(6)}  ${String(b.messages).padStart(4)} msgs  agent ${b.agent}`)
console.log('\nby class'); for (const b of m.byClass) console.log(`  ${b.key.padEnd(28)} ${pct(b.share).padStart(6)}  ${String(b.messages).padStart(4)} msgs${b.personOnly ? '  person only' : ''}`)
console.log('\nby sender'); for (const b of m.bySender) console.log(`  ${b.key.padEnd(40)} ${pct(b.share).padStart(6)}  ${String(b.messages).padStart(4)} msgs`)
