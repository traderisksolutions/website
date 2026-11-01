/**
 * Reads the money out of every filed document and writes it where the ledger reads it:
 * insurer notes → policy_transactions, schedules → policy premium / sum insured + cover facts,
 * claim letters → claims. Idempotent; a second run writes nothing new.
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/policy-backfill.mts dry
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/policy-backfill.mts write [doc_type]
 *
 * Reads the attachment text parsed at ingest (email_attachments.parsed_text); a document with no
 * text is counted as unread. Prints counts per type and the reasons documents were skipped.
 */
import { sbTry } from '@/lib/crm/db'
import { applyMoneyRead, companyPolicies, NOTE_TYPES, TERMS_TYPES, CLAIM_TYPES, type MoneyDoc, type PolicyLite } from '@/lib/documents/money-store'

const [mode, onlyType] = process.argv.slice(2)
if (mode !== 'dry' && mode !== 'write') { console.error('usage: policy-backfill.mts dry|write [doc_type]'); process.exit(2) }
const WRITE = mode === 'write'
const TYPES = [...NOTE_TYPES, ...TERMS_TYPES, ...CLAIM_TYPES].filter(t => !onlyType || t === onlyType)

type Row = Record<string, any>
const docs: MoneyDoc[] = []
for (let off = 0; ; off += 1000) {
  const page = await sbTry<Row[]>(`policy_documents?doc_type=in.(${TYPES.join(',')})&status=neq.ignored&email_attachment_id=not.is.null&select=id,company_id,policy_id,doc_type,filename,received_at,email_attachment_id,thread_id,message_id,drive_url,policy_number,insurer_name&order=received_at.asc&offset=${off}&limit=1000`, [])
  docs.push(...(page as MoneyDoc[]))
  if (page.length < 1000) break
}
console.log(`${docs.length} documents of ${TYPES.length} types (${WRITE ? 'WRITE' : 'dry run'})`)

const text = new Map<string, string | null>()
const ids = docs.map(d => d.email_attachment_id!).filter(Boolean)
for (let i = 0; i < ids.length; i += 50) {
  for (const a of await sbTry<Row[]>(`email_attachments?id=in.(${ids.slice(i, i + 50).join(',')})&select=id,parsed_text`, [])) text.set(a.id, a.parsed_text ?? null)
}
const policies = new Map<string, PolicyLite[]>()
const policiesFor = async (companyId: string) => { if (!policies.has(companyId)) policies.set(companyId, await companyPolicies(companyId)); return policies.get(companyId)! }

type Tally = { docs: number; no_text: number; read: number; matched: number; wrote: number; skipped: Record<string, number>; fields: Record<string, number> }
const by: Record<string, Tally> = {}
const tally = (t: string) => (by[t] ??= { docs: 0, no_text: 0, read: 0, matched: 0, wrote: 0, skipped: {}, fields: {} })
const unmatched: string[] = []
let n = 0
for (const d of docs) {
  const t = tally(d.doc_type); t.docs++
  const body = d.email_attachment_id ? text.get(d.email_attachment_id) : null
  if (!body || body.length < 60) { t.no_text++; continue }
  if (!d.company_id) { t.skipped.no_company = (t.skipped.no_company ?? 0) + 1; continue }
  const pols = await policiesFor(d.company_id)
  try {
    const { read, result } = await applyMoneyRead(d, body, pols, WRITE)
    if (read) {
      t.read++
      const r = read.read as Row
      for (const k of ['gross', 'total', 'gst', 'policy_no', 'period_start', 'note_no', 'sum_insured', 'headcount', 'rate_per_head', 'amount', 'decision', 'claim_no']) if (r[k] != null) t.fields[k] = (t.fields[k] ?? 0) + 1
    }
    if (result.policy_id) t.matched++
    if (result.wrote.length) t.wrote++
    if (result.skipped) t.skipped[result.skipped] = (t.skipped[result.skipped] ?? 0) + 1
    if (result.skipped === 'no_policy_matched' && unmatched.length < 15) unmatched.push(`${d.doc_type} · ${d.filename} · read no ${(read?.read as Row)?.policy_no ?? '—'} · company policies ${pols.map(p => p.policy_number).filter(Boolean).join(', ').slice(0, 80)}`)
  } catch (e) {
    t.skipped.error = (t.skipped.error ?? 0) + 1
    if (n++ < 5) console.error('  error', d.filename, e instanceof Error ? e.message : e)
  }
}
for (const [type, t] of Object.entries(by)) {
  console.log(`\n${type}: ${t.docs} docs · ${t.no_text} without text · ${t.read} read · ${t.matched} matched to a policy · ${t.wrote} ${WRITE ? 'written' : 'would write'}`)
  console.log('  fields found:', JSON.stringify(t.fields))
  console.log('  skipped:', JSON.stringify(t.skipped))
}
if (unmatched.length) { console.log('\nunmatched samples:'); for (const u of unmatched) console.log(' -', u) }
