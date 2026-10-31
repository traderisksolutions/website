/**
 * Load case-worker results read outside the dashboard (the Catherine Lim handover trial,
 * 31 Oct 2026) into the work queue. The file holds client mail, so it stays outside this repo.
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/casework-seed.mts dry   <cases_checked.json>
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/casework-seed.mts write <cases_checked.json>
 * Each case was already passed through cleanCase. Done cases are skipped. Needs 20261031_work_items.sql.
 */
import fs from 'node:fs'
import { sbTry, inChunks } from '@/lib/crm/db'
import { storeCase, type CaseInput } from '@/lib/casework/run'
import type { CleanCase } from '@/lib/casework/clean'

const [mode, path] = process.argv.slice(2)
if (!['dry', 'write'].includes(mode ?? '') || !path) { console.log('usage: dry|write <cases_checked.json>'); process.exit(1) }
const cases = (JSON.parse(fs.readFileSync(path, 'utf8')) as { clean: CleanCase | null }[]).map(r => r.clean).filter((c): c is CleanCase => !!c && c.status !== 'done')
const tids = Array.from(new Set(cases.flatMap(c => c.threads)))
const threads = await inChunks(tids, 40, ch => sbTry<any[]>(`email_threads?id=in.(${ch.join(',')})&select=id,company_id,companies(kind,company_name)`, []))
const files = await inChunks(tids, 40, ch => sbTry<any[]>(`email_attachments?thread_id=in.(${ch.join(',')})&storage_url=not.is.null&select=thread_id,filename,mime_type,storage_url`, []))
const clients = await sbTry<any[]>('companies?kind=eq.client&select=id,company_name', [])
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\b(pte|ltd|limited|private|singapore|sg)\b/g, '').trim()

let mapped = 0, unmapped: string[] = []
for (const c of cases) {
  const ts = threads.filter(t => c.threads.includes(t.id))
  let companyId = ts.find(t => t.companies?.kind === 'client')?.company_id ?? null
  if (!companyId && c.client) companyId = clients.find(k => norm(k.company_name) === norm(c.client!) || (norm(c.client!).length >= 5 && norm(k.company_name).startsWith(norm(c.client!))))?.id ?? null
  // Kept even without a record: the queue shows the client by name, and the item is linked
  // when the client's record is created or the name is added as an alias.
  if (companyId) mapped++; else unmapped.push(`${c.client} — ${c.title}`)
  if (mode !== 'write') continue
  const input: CaseInput = {
    companyId, prompt: '', ctx: { threadIds: c.threads, addresses: [], attachments: [], text: '', staff: [], today: new Date().toISOString().slice(0, 10) },
    files: new Map(files.filter(f => c.threads.includes(f.thread_id)).map(f => [f.filename, f])),
    threadSide: new Map(ts.map(t => [t.id, t.companies?.kind === 'client' ? 'client' : t.companies?.kind === 'insurer' ? 'insurer' : 'other'])),
  }
  await storeCase(input, c)
}
console.log(`open cases ${cases.length}, mapped to a client ${mapped}, kept by name only ${unmapped.length}`)
for (const u of unmapped) console.log('  by name only:', u)
