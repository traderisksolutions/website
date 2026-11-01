/**
 * Writes a member listing into policy_members, so a policy's headcount at inception and now, and
 * its rate per head, come from what the insurer or the client actually listed. Idempotent: a
 * document already applied (any member citing it) is skipped; a member already on the register
 * is matched by name and relationship and only gains what was blank.
 */
import { sb, sbTry, enc } from '@/lib/crm/db'
import { writeFacts } from '@/lib/admin/a/knowledge'
import type { FactInput } from '@/lib/admin/a/handoffs'
import { attachmentRefBytes, gmailRef } from '@/lib/storage/attachment-bytes'
import { isSpreadsheet, sheetRows } from '@/lib/admin/b/endorsements/read-xlsx'
import { normName } from '@/lib/policies/members'
import { policyTokens, samePolicyNumber } from './money'
import { readMemberListingRows, readMemberListingText, type ListingRead } from './members-read'
import type { MoneyDoc, ApplyResult } from './money-store'

type Row = Record<string, any>
export const MEMBERS_ACTOR = 'policy_reader'
export type EbPolicy = { id: string; company_id: string | null; policy_number: string | null; insurer: string | null; start_date: string | null; end_date: string | null; lifecycle: string | null; is_eb: boolean; class_of_insurance: string | null; product_line: string | null; label: string | null }

/** The company's and its group's employment-benefits policies, the company's own first. */
export async function companyEbPolicies(companyId: string): Promise<EbPolicy[]> {
  const [c] = await sbTry<Row[]>(`companies?id=eq.${enc(companyId)}&select=id,parent_id&limit=1`, [])
  const root = c?.parent_id ?? companyId
  const members = await sbTry<Row[]>(`companies?or=(id.eq.${enc(root)},parent_id.eq.${enc(root)})&select=id`, [])
  const ids = Array.from(new Set([companyId, ...members.map(m => m.id as string)]))
  const rows = await sbTry<EbPolicy[]>(`policies?company_id=in.(${ids.join(',')})&select=id,company_id,policy_number,insurer,start_date,end_date,lifecycle,is_eb,class_of_insurance,product_line,label&limit=400`, [])
  return rows.filter(p => p.is_eb || /group|employee|health|hospital|term life|gtl|ghs|gpa|personal accident|medical/i.test(`${p.class_of_insurance ?? ''} ${p.label ?? ''} ${p.product_line ?? ''}`))
    .sort((a, b) => Number(b.company_id === companyId) - Number(a.company_id === companyId))
}

const within = (a: string | null, b: string | null, days: number) => !!a && !!b && Math.abs(Date.parse(a) - Date.parse(b)) <= days * 86_400_000
const GENERIC = new Set(['insurance', 'assurance', 'singapore', 'pte', 'ltd', 'limited', 'company', 'general', 'group', 'asia', 'pacific', 'the', 'co', 'private', 'branch', 'life', 'ltd.'])
/** The words that name an insurer ("qbe", "singlife", "great eastern"), without the generic ones. */
export function insurerWords(s: string | null | undefined): string[] {
  const w = (s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(x => x.length >= 3 && !GENERIC.has(x))
  if (/singapore life|singlife/.test((s ?? '').toLowerCase())) w.push('singlife')
  return Array.from(new Set(w))
}
const namesInsurer = (hay: string, insurer: string | null | undefined) => insurerWords(insurer).some(w => hay.includes(w))

/**
 * The policies a listing belongs to. The one it was filed under, or the one whose number the text
 * names, decides alone. A client's own list (no number) belongs to every live EB policy it can
 * cover: the same employees sit on the hospital, accident and term-life policies. The insurer the
 * text or file name names, a period within a month, and line words ("GTL", "GHS") narrow the set.
 * An insurer's listing with a number not on file matches nothing.
 */
export function matchListingPolicies(doc: Pick<MoneyDoc, 'policy_id' | 'filename' | 'insurer_name' | 'policy_number'>, read: ListingRead, policies: EbPolicy[], subject = ''): EbPolicy[] {
  if (doc.policy_id) { const p = policies.find(x => x.id === doc.policy_id); if (p) return [p] }
  const no = read.policy_no ?? doc.policy_number
  if (no) {
    const hits = policies.filter(p => samePolicyNumber(p.policy_number, no))
    if (hits.length === 1) return hits
    if (hits.length > 1) return [hits.sort((a, b) => String(b.start_date ?? '').localeCompare(String(a.start_date ?? '')))[0]]
    if (read.layout === 'markdown') return []
  }
  let cands = policies.filter(p => !p.lifecycle || ['live', 'bound', 'renewal_due'].includes(p.lifecycle))
  if (!cands.length) cands = policies
  const hay = `${read.insurer ?? ''} ${doc.insurer_name ?? ''} ${doc.filename} ${subject}`.toLowerCase()
  const byInsurer = cands.filter(p => namesInsurer(hay, p.insurer))
  if (byInsurer.length) cands = byInsurer
  if (read.period_start) { const same = cands.filter(p => within(p.start_date, read.period_start, 31)); if (same.length) cands = same }
  // "GTL & GCI" in the file name names the term-life policy, not the hospital plan beside it.
  const lineHay = `${doc.filename} ${subject}`.toLowerCase()
  const lines = cands.filter(p => { const c = `${p.class_of_insurance ?? ''} ${p.label ?? ''}`.toLowerCase(); return (/\bgtl\b|term life/.test(lineHay) && /term|gtl/.test(c)) || (/\bghs\b|hospital|medical|m-care/.test(lineHay) && /hospital|health|ghs|medical/.test(c)) || (/\bgpa\b|personal accident/.test(lineHay) && /accident|gpa/.test(c)) || (/\bfwmi\b|foreign worker/.test(lineHay) && /foreign|fwmi/.test(c)) })
  if (lines.length) cands = lines
  if (cands.length === 1) return cands
  // Several policies remain: a client's list covers them all when they share the insurer or no insurer was named; four or more is a company-wide census, still theirs.
  const insurers = new Set(cands.map(p => insurerWords(p.insurer).join(' ')))
  return (insurers.size === 1 || !byInsurer.length) && cands.length <= 6 ? cands : []
}

export const matchListingPolicy = (doc: Pick<MoneyDoc, 'policy_id' | 'filename' | 'insurer_name' | 'policy_number'>, read: ListingRead, policies: EbPolicy[], subject = ''): EbPolicy | null => {
  const m = matchListingPolicies(doc, read, policies, subject)
  return m.length === 1 ? m[0] : null
}

/** The listing on a filed attachment: its extracted text first; a workbook with no text is read from its bytes. */
export async function readListingFromAttachment(attachmentId: string, filename: string, mime: string | null): Promise<ListingRead | null> {
  const [a] = await sbTry<Row[]>(`email_attachments?id=eq.${enc(attachmentId)}&select=parsed_text&limit=1`, [])
  const fromText = readMemberListingText(a?.parsed_text)
  if (fromText) return fromText
  if (!isSpreadsheet(filename, mime)) return null
  const bytes = await attachmentRefBytes(gmailRef(attachmentId)).catch(() => null)
  if (!bytes) return null
  return readMemberListingRows(sheetRows(bytes, filename), a?.parsed_text ?? '')
}

export type ListingResult = ApplyResult & { inserted: number; updated: number; left: number; inception: boolean }

/** Writes a listing onto a policy's register. `today` fixes "still active" for tests. */
export async function applyMemberListing(doc: MoneyDoc, read: ListingRead, policy: EbPolicy, write: boolean, today = new Date().toISOString().slice(0, 10)): Promise<ListingResult> {
  const none: ListingResult = { wrote: [], skipped: null, policy_id: policy.id, inserted: 0, updated: 0, left: 0, inception: false }
  if (!policy.company_id) return { ...none, skipped: 'no_company' }
  const existing = await sbTry<Row[]>(`policy_members?policy_id=eq.${enc(policy.id)}&select=id,member_name,relationship,dob,status,source,joined_on,left_on,plan_code,category,annual_premium,id_masked,employee_ref,gender,source_document_id,effective_from&limit=5000`, [])
  if (existing.some(m => m.source_document_id === doc.id)) return { ...none, skipped: 'already_recorded' }
  const listedOn = read.listing_date ?? doc.received_at?.slice(0, 10) ?? null
  const effective = read.members.map(m => m.effective_from).filter(Boolean).sort()[0] ?? read.period_start ?? null
  // An inception listing: dated or effective within 45 days of the policy start, or the first listing of a policy still in its first two months.
  const inception = within(effective, policy.start_date, 45) || (!existing.length && within(listedOn, policy.start_date, 60))
  const byKey = new Map<string, Row>()
  for (const m of existing) byKey.set(`${normName(m.member_name)}|${m.relationship}`, m)
  const byName = new Map<string, Row[]>()
  for (const m of existing) byName.set(normName(m.member_name), [...(byName.get(normName(m.member_name)) ?? []), m])
  const inserts: Row[] = [], patches: { id: string; patch: Row }[] = []
  let left = 0
  for (const m of read.members) {
    const key = `${normName(m.name)}|${m.relationship}`
    const sameName = byName.get(normName(m.name)) ?? []
    const hit = byKey.get(key) ?? (sameName.length === 1 ? sameName[0] : null)
    const gone = m.effective_to && m.effective_to <= today || /^D$/.test(m.movement ?? '')
    if (!hit) {
      inserts.push({
        policy_id: policy.id, company_id: policy.company_id, member_name: m.name, relationship: m.relationship, employee_ref: m.employee_ref,
        dob: m.dob, gender: m.gender, category: m.category, plan_code: m.plan_code, id_masked: m.id_masked,
        joined_on: m.effective_from ?? (inception ? policy.start_date : listedOn), left_on: gone ? (m.effective_to ?? listedOn) : null,
        status: gone ? 'left' : 'active', source: inception ? 'census' : 'listing',
        annual_premium: m.annual_premium, products: m.products, effective_from: m.effective_from, effective_to: m.effective_to,
        listing_date: listedOn, source_document_id: doc.id,
      })
      if (gone) left++
      continue
    }
    const patch: Row = {}
    for (const f of ['dob', 'gender', 'category', 'plan_code', 'id_masked', 'employee_ref', 'annual_premium', 'effective_from'] as const) if (hit[f] == null && m[f] != null) patch[f] = m[f]
    if (m.products.length) patch.products = m.products
    if (gone && hit.status === 'active') { patch.status = 'left'; patch.left_on = m.effective_to ?? listedOn; left++ }
    if (Object.keys(patch).length) patches.push({ id: hit.id, patch: { ...patch, updated_at: new Date().toISOString() } })
  }
  // The listing's own figures, for the renewal pack: lives listed and the employee rate, keyed like the schedule facts.
  const facts: FactInput[] = []
  const token = policyTokens(policy.policy_number)[0] ?? policy.id.slice(0, 8)
  const year = (read.period_start ?? policy.start_date ?? listedOn ?? '').slice(0, 4) || 'undated'
  const emp = read.members.filter(x => x.relationship === 'employee')
  const empPrem = emp.map(x => x.annual_premium).filter((x): x is number => x != null && x > 0)
  const fact = (k: string, value: string, quote: string): FactInput => ({ company_id: policy.company_id!, policy_id: policy.id, topic: 'cover', key: `${k}:${token}:${year}:listing`, value, source_kind: 'document', source_id: doc.id, source_date: listedOn, quote: quote.slice(0, 240), confidence: 'high' })
  if (emp.length) facts.push(fact('headcount', String(emp.length), `${emp.length} employees listed in ${doc.filename}`))
  if (empPrem.length >= Math.max(1, Math.floor(emp.length / 2))) facts.push(fact('rate.per_head', (Math.round(empPrem.reduce((s, x) => s + x, 0) / empPrem.length * 100) / 100).toFixed(2), `average of ${empPrem.length} employee premiums in ${doc.filename}`))
  const wrote: string[] = []
  if (inserts.length) wrote.push(`policy_members+${inserts.length}`)
  if (patches.length) wrote.push(`policy_members~${patches.length}`)
  if (facts.length) wrote.push(`company_facts×${facts.length}`)
  if (!wrote.length) return { ...none, skipped: 'already_recorded', inception }
  if (!write) return { ...none, wrote, inserted: inserts.length, updated: patches.length, left, inception }
  for (let i = 0; i < inserts.length; i += 200) await sb('policy_members', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(inserts.slice(i, i + 200)) })
  for (const p of patches) await sb(`policy_members?id=eq.${enc(p.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(p.patch) })
  if (facts.length) await writeFacts(facts, MEMBERS_ACTOR)
  return { ...none, wrote, inserted: inserts.length, updated: patches.length, left, inception }
}

/** Reads one filed member list and writes it onto every policy it belongs to: the document clerk's and the backfill's one call. */
export async function applyMemberListingDoc(doc: MoneyDoc & { mime_type?: string | null }, write: boolean, subject = ''): Promise<{ read: ListingRead | null; result: ListingResult | ApplyResult; policies: number }> {
  if (!doc.email_attachment_id || !doc.company_id) return { read: null, result: { wrote: [], skipped: 'no_company', policy_id: doc.policy_id }, policies: 0 }
  const read = await readListingFromAttachment(doc.email_attachment_id, doc.filename, doc.mime_type ?? null)
  if (!read) return { read: null, result: { wrote: [], skipped: 'not_read', policy_id: doc.policy_id }, policies: 0 }
  const policies = await companyEbPolicies(doc.company_id)
  const targets = matchListingPolicies(doc, read, policies, subject)
  if (!targets.length) return { read, result: { wrote: [], skipped: 'no_policy_matched', policy_id: null }, policies: 0 }
  let sum: ListingResult = { wrote: [], skipped: null, policy_id: targets[0].id, inserted: 0, updated: 0, left: 0, inception: false }
  let applied = 0
  for (const policy of targets) {
    const r = await applyMemberListing(doc, read, policy, write)
    if (r.skipped) continue
    applied++
    sum = { ...sum, wrote: [...sum.wrote, ...r.wrote.map(w => `${w}@${policy.policy_number ?? policy.id.slice(0, 8)}`)], inserted: sum.inserted + r.inserted, updated: sum.updated + r.updated, left: sum.left + r.left, inception: sum.inception || r.inception }
  }
  if (!applied) return { read, result: { ...sum, skipped: 'already_recorded' }, policies: targets.length }
  if (write && !doc.policy_id && targets.length === 1) await sbTry(`policy_documents?id=eq.${enc(doc.id)}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ policy_id: targets[0].id }) })
  return { read, result: sum, policies: targets.length }
}
