/**
 * Reads every filed claim document for a settlement and writes it: onto the matching claim, or as
 * a new claim opened from the letter when TRS held no case. Idempotent.
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/claims-paid-backfill.mts dry
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/claims-paid-backfill.mts write
 */
import { sbTry } from '@/lib/crm/db'
import { applyMoneyRead, companyPolicies, type MoneyDoc, type PolicyLite } from '@/lib/documents/money-store'

const [mode] = process.argv.slice(2)
if (mode !== 'dry' && mode !== 'write') { console.error('usage: claims-paid-backfill.mts dry|write'); process.exit(2) }
const WRITE = mode === 'write'
type Row = Record<string, any>

const before = await sbTry<Row[]>('claims?select=id,amount_settled,opened_mode&limit=5000', [])
console.log(`claims before: ${before.length}, with amount ${before.filter(c => c.amount_settled != null).length}`)
const docs = await sbTry<Row[]>(`policy_documents?doc_type=eq.claim&status=neq.ignored&email_attachment_id=not.is.null&select=id,company_id,policy_id,doc_type,filename,received_at,email_attachment_id,thread_id,message_id,drive_url,policy_number,insurer_name,class_of_insurance,title&order=received_at.asc&limit=2000`, [])
const text = new Map<string, string | null>()
const ids = docs.map(d => d.email_attachment_id)
for (let i = 0; i < ids.length; i += 50) for (const a of await sbTry<Row[]>(`email_attachments?id=in.(${ids.slice(i, i + 50).join(',')})&select=id,parsed_text`, [])) text.set(a.id, a.parsed_text ?? null)
const policies = new Map<string, PolicyLite[]>()
const tally: Record<string, number> = {}; const t = (k: string) => (tally[k] = (tally[k] ?? 0) + 1)
const sample: string[] = []
console.log(`${docs.length} claim documents (${WRITE ? 'WRITE' : 'dry run'})`)
for (const d of docs) {
  const body = text.get(d.email_attachment_id)
  if (!body || body.length < 60) { t('no_text'); continue }
  if (!d.company_id) { t('no_company'); continue }
  if (!policies.has(d.company_id)) policies.set(d.company_id, await companyPolicies(d.company_id))
  try {
    const { read, result } = await applyMoneyRead(d as MoneyDoc, body, policies.get(d.company_id)!, WRITE)
    if (!read) { t('not_a_settlement'); continue }
    const r = read.read as Row
    t(`read:${r.decision ?? 'no_decision'}${r.amount ? ':amount' : ''}`)
    if (result.skipped) t(result.skipped); else for (const w of result.wrote) t(w)
    if (result.wrote.includes('claims:open') && sample.length < 12) sample.push(`${d.filename} · ${r.decision} · ${r.amount?.value ?? '—'} · ref ${r.claim_no ?? '—'} · policy ${result.policy_id ? 'matched' : 'none'}`)
  } catch (e) { t('error'); console.warn('  !', d.filename, e instanceof Error ? e.message : e) }
}
console.log(JSON.stringify(tally, null, 1))
if (sample.length) console.log('opened from letters (sample):\n  ' + sample.join('\n  '))
const after = await sbTry<Row[]>('claims?select=id,amount_settled,opened_mode&limit=5000', [])
console.log(`claims after: ${after.length}, with amount ${after.filter(c => c.amount_settled != null).length}, from_document ${after.filter(c => c.opened_mode === 'from_document').length}`)
