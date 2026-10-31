/**
 * Run the case worker on one client, or on every client with mail in the last 90 days.
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/casework-run.mts dry <company_id>
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/casework-run.mts write <company_id|all>
 * dry calls the model and prints the cases; it stores nothing. Needs migration 20261031_work_items.sql to write.
 */
import { sbTry } from '@/lib/crm/db'
import { workCompany } from '@/lib/casework/run'

const [mode, target] = process.argv.slice(2)
if (!['dry', 'write'].includes(mode ?? '') || !target) { console.log('usage: dry|write <company_id|all>'); process.exit(1) }
const since = new Date(Date.now() - 90 * 86_400_000).toISOString()
const ids = target === 'all'
  ? Array.from(new Set((await sbTry<{ company_id: string }[]>(`email_threads?last_message_at=gte.${since}&company_id=not.is.null&companies.kind=eq.client&select=company_id,companies!inner(kind)&limit=5000`, [])).map(r => r.company_id)))
  : [target]
for (const id of ids) {
  const r = await workCompany(id, { write: mode === 'write' })
  console.log(`${id} cases ${r.cases.length} stored ${r.stored} dropped ${r.dropped}${r.note ? ` (${r.note})` : ''}`)
  if (mode === 'dry') for (const c of r.cases) console.log(`  ${c.status.padEnd(15)} ${c.case_type.padEnd(15)} ${c.title}${c.draft ? '  [draft]' : c.draft_withheld ? `  [draft withheld: ${c.draft_withheld}]` : ''}`)
}
