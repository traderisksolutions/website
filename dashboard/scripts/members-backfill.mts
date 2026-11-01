/**
 * Reads every filed member list (census or insurer listing) onto its policy's register, so headcount
 * at inception and now, and the employee rate, come from the lists themselves. Idempotent.
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/members-backfill.mts dry
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/members-backfill.mts write
 */
import { sbTry } from '@/lib/crm/db'
import { applyMemberListingDoc } from '@/lib/documents/members-store'
import type { MoneyDoc } from '@/lib/documents/money-store'

const [mode] = process.argv.slice(2)
if (mode !== 'dry' && mode !== 'write') { console.error('usage: members-backfill.mts dry|write'); process.exit(2) }
const WRITE = mode === 'write'
type Row = Record<string, any>

const docs = await sbTry<Row[]>(`policy_documents?doc_type=eq.member_list&status=neq.ignored&email_attachment_id=not.is.null&select=id,company_id,policy_id,doc_type,filename,mime_type,received_at,email_attachment_id,thread_id,message_id,drive_url,policy_number,insurer_name,class_of_insurance,title&order=received_at.asc&limit=2000`, [])
console.log(`${docs.length} member lists (${WRITE ? 'WRITE' : 'dry run'})`)
const subjects = new Map<string, string>()
const tids = Array.from(new Set(docs.map(d => d.thread_id).filter(Boolean)))
for (let i = 0; i < tids.length; i += 50) for (const t of await sbTry<Row[]>(`email_threads?id=in.(${tids.slice(i, i + 50).join(',')})&select=id,subject`, [])) subjects.set(t.id, t.subject ?? '')

const tally: Record<string, number> = {}; const t = (k: string) => (tally[k] = (tally[k] ?? 0) + 1)
let members = 0, inserted = 0, updated = 0, left = 0
const unmatched: string[] = []
for (const d of docs) {
  try {
    const { read, result } = await applyMemberListingDoc(d as MoneyDoc & { mime_type?: string | null }, WRITE, subjects.get(d.thread_id) ?? '')
    if (!read) { t(result.skipped ?? 'not_read'); continue }
    t(`read:${read.layout}`); members += read.members.length
    if (result.skipped) { t(result.skipped); if (result.skipped === 'no_policy_matched' && unmatched.length < 20) unmatched.push(`${d.filename} · ${read.employees} employees · insurer ${read.insurer ?? '—'} · no ${read.policy_no ?? '—'}`); continue }
    const r = result as Row
    inserted += r.inserted ?? 0; updated += r.updated ?? 0; left += r.left ?? 0
    t(r.inception ? 'applied:inception' : 'applied:listing')
  } catch (e) { t('error'); console.warn('  !', d.filename, e instanceof Error ? e.message : e) }
}
console.log(JSON.stringify({ tally, members_read: members, inserted, updated, left }, null, 1))
if (unmatched.length) console.log('unmatched (first 20):\n  ' + unmatched.join('\n  '))

// Policies with a headcount now derivable, for the report.
const pm = await sbTry<Row[]>('policy_members?select=policy_id,status,source,joined_on&limit=20000', [])
const byPolicy = new Map<string, Row[]>()
for (const m of pm) byPolicy.set(m.policy_id, [...(byPolicy.get(m.policy_id) ?? []), m])
let withInception = 0, withNow = 0
for (const rows of byPolicy.values()) { if (rows.some(m => m.source === 'census')) withInception++; if (rows.some(m => m.status === 'active')) withNow++ }
console.log(`policy_members rows ${pm.length} · policies with members ${byPolicy.size} · with inception headcount ${withInception} · with current headcount ${withNow}`)
