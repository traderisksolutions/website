/**
 * Files email threads that have no company: the resolver's steps (policy number, acts-for,
 * employer, UEN, signature, domain, group member, subject — src/lib/admin/a/resolver.ts), then a
 * party link for insurer and TPA threads that name no client.
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/threads-link-backfill.mts dry
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/threads-link-backfill.mts write
 *
 * dry prints what would be filed, by step, and lists what stays unresolved. write files it and
 * records each filing in the housekeeping log. Never creates a company.
 */
import { sbTry, enc, emailDomain } from '@/lib/crm/db'
import { recordHousekeeping } from '@/lib/agent-activity'
import { threadEvidence, resolveEvidence, linkInsurerParty } from '@/lib/admin/a/resolver'

const [mode] = process.argv.slice(2)
if (mode !== 'dry' && mode !== 'write') { console.error('usage: threads-link-backfill.mts dry|write'); process.exit(2) }
type Row = Record<string, any>

const threads: Row[] = []
for (let off = 0; ; off += 1000) {
  const page = await sbTry<Row[]>(`email_threads?company_id=is.null&deleted_at=is.null&select=id,subject,last_message_at&order=last_message_at.desc&offset=${off}&limit=1000`, [])
  threads.push(...page)
  if (page.length < 1000) break
}
console.log(`threads with no company: ${threads.length}`)

const byStep: Record<string, number> = {}
const tally = (k: string) => (byStep[k] = (byStep[k] ?? 0) + 1)
const unresolved: { subject: string | null; domain: string; parties: string[] }[] = []
const names = new Map<string, string>()
const nameOf = async (id: string) => { if (!names.has(id)) { const [c] = await sbTry<Row[]>(`companies?id=eq.${enc(id)}&select=company_name`, []); names.set(id, c?.company_name ?? id) } return names.get(id)! }

for (const t of threads) {
  const ev = await threadEvidence(t.id)
  if (!ev) { tally('thread missing'); continue }
  const r = await resolveEvidence(ev)
  if (r) {
    tally(`filed · ${r.step}`)
    if (mode === 'write') {
      await sbTry(`email_threads?id=eq.${enc(t.id)}&company_id=is.null`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ company_id: r.companyId }) })
      recordHousekeeping({ action: 'thread.filed', subject: r.companyId, resourceType: 'thread', resourceId: t.id, basis: `backfill: ${r.step} — ${r.evidence}`, metadata: { thread_subject: ev.subject, company_id: r.companyId, step: r.step } })
    } else if (byStep[`filed · ${r.step}`] <= 3) console.log(`  ${r.step}: "${(ev.subject ?? '').slice(0, 70)}" → ${await nameOf(r.companyId)} (${r.evidence})`)
    continue
  }
  const parties = mode === 'write' ? await linkInsurerParty(ev, t.last_message_at) : await partiesOn(ev.people)
  tally(parties.length ? 'party link only (insurer/TPA, client unknown)' : 'unresolved')
  if (unresolved.length < 60) unresolved.push({ subject: ev.subject, domain: emailDomain(ev.people[0] ?? ''), parties })
}
console.log(JSON.stringify(byStep, null, 1))
console.log(`\nUNRESOLVED (first ${unresolved.length}):`)
for (const u of unresolved) console.log(`- ${u.domain || '(no outside address)'} | ${(u.subject ?? '').slice(0, 80)}${u.parties.length ? ` | party: ${u.parties.join(', ')}` : ''}`)

async function partiesOn(people: string[]): Promise<string[]> {
  const domains = Array.from(new Set(people.map(emailDomain).filter(Boolean)))
  if (!domains.length) return []
  const rows = await sbTry<Row[]>(`companies?kind=in.(insurer,tpa)&domains=ov.{${domains.map(d => `"${d}"`).join(',')}}&select=company_name`, [])
  return rows.map(r => r.company_name)
}
