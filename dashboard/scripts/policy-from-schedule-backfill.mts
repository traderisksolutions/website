/**
 * Opens the policies that filed schedules and cover notes prove but the register lacks, then
 * reads their terms. A renewal notice or an endorsement never opens a policy. Idempotent.
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/policy-from-schedule-backfill.mts dry
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/policy-from-schedule-backfill.mts write
 */
import { sbTry } from '@/lib/crm/db'
import { applyMoneyRead, companyPolicies, companyNames, readMoney, policyToOpen, OPENS_POLICY_TYPES, type MoneyDoc, type PolicyLite } from '@/lib/documents/money-store'

const [mode] = process.argv.slice(2)
if (mode !== 'dry' && mode !== 'write') { console.error('usage: policy-from-schedule-backfill.mts dry|write'); process.exit(2) }
const WRITE = mode === 'write'
type Row = Record<string, any>

const policiesBefore = (await sbTry<Row[]>('policies?select=id&limit=5000', [])).length
const docs = await sbTry<Row[]>(`policy_documents?doc_type=in.(${Array.from(OPENS_POLICY_TYPES).join(',')})&status=neq.ignored&email_attachment_id=not.is.null&select=id,company_id,policy_id,doc_type,filename,received_at,email_attachment_id,thread_id,message_id,drive_url,policy_number,insurer_name,class_of_insurance,title&order=received_at.asc&limit=3000`, [])
const text = new Map<string, string | null>()
const ids = docs.map(d => d.email_attachment_id)
for (let i = 0; i < ids.length; i += 50) for (const a of await sbTry<Row[]>(`email_attachments?id=in.(${ids.slice(i, i + 50).join(',')})&select=id,parsed_text`, [])) text.set(a.id, a.parsed_text ?? null)
const policies = new Map<string, PolicyLite[]>()
const companies = new Map<string, Row | null>()
const tally: Record<string, number> = {}; const t = (k: string) => (tally[k] = (tally[k] ?? 0) + 1)
const opened: string[] = []
console.log(`${docs.length} schedules and cover notes, policies on file ${policiesBefore} (${WRITE ? 'WRITE' : 'dry run'})`)
for (const d of docs) {
  const body = text.get(d.email_attachment_id)
  if (!body || body.length < 60) { t('no_text'); continue }
  if (!d.company_id) { t('no_company'); continue }
  if (!policies.has(d.company_id)) policies.set(d.company_id, await companyPolicies(d.company_id))
  const pols = policies.get(d.company_id)!
  const read = readMoney(d.doc_type, body)
  if (!read || read.kind !== 'terms') { t(read ? `read:${read.kind}` : 'not_read'); continue }
  if (!companies.has(d.company_id)) companies.set(d.company_id, await companyNames(d.company_id))
  const decision = policyToOpen(d as MoneyDoc, read.read, pols, companies.get(d.company_id), body)
  if ('reason' in decision) { t(`skip:${decision.reason}`); continue }
  try {
    const { result } = await applyMoneyRead(d as MoneyDoc, body, pols, WRITE)
    if (result.wrote.includes('policies:open')) { t('opened'); if (opened.length < 25) opened.push(`${d.filename} → ${decision.insurer ?? '?'} · ${decision.cls ?? '?'} · ${decision.number} · ${decision.start} to ${decision.end ?? '?'}`) }
    else t(result.skipped ?? 'matched_existing')
  } catch (e) { t('error'); console.warn('  !', d.filename, e instanceof Error ? e.message : e) }
}
console.log(JSON.stringify(tally, null, 1))
if (opened.length) console.log('opened:\n  ' + opened.join('\n  '))
const policiesAfter = (await sbTry<Row[]>('policies?select=id&limit=5000', [])).length
console.log(`policies on file: ${policiesBefore} → ${policiesAfter}`)
