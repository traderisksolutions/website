/**
 * Writes what the money readers found: an insurer's note into policy_transactions, a schedule's
 * terms onto the policy and into the knowledge bank, a claim letter's settlement onto the claim.
 * Every write is idempotent (a note number, a document id, a fact's source) so the backfill and
 * the document clerk can both run it. Reads only the attachment text already parsed at ingest.
 */
import { sb, sbTry, enc } from '@/lib/crm/db'
import { recordTransaction } from '@/lib/policies/transactions'
import type { TransactionEvidence } from '@/lib/policies/types'
import { writeFacts } from '@/lib/admin/a/knowledge'
import type { FactInput } from '@/lib/admin/a/handoffs'
import { readInsurerNote, readScheduleTerms, readClaimSettlement, samePolicyNumber, nearlySamePolicyNumber, policyTokens, findPolicyNoInText, findInsurerName, type InsurerNoteRead, type ScheduleRead, type ClaimSettlementRead } from './money'
import { policyFromDocument, createPolicy, policyExists } from './policy'
import { claimClass } from '@/lib/admin/b/claim-read'
import { depositEvent } from '@/lib/admin/k/deposit'

type Row = Record<string, any>
export const MONEY_ACTOR = 'policy_reader'

export type MoneyDoc = {
  id: string; company_id: string | null; policy_id: string | null; doc_type: string; filename: string
  received_at: string | null; email_attachment_id: string | null; thread_id: string | null; message_id: string | null
  drive_url: string | null; policy_number: string | null; insurer_name: string | null
  class_of_insurance?: string | null; title?: string | null; mime_type?: string | null
}
export type PolicyLite = { id: string; company_id: string | null; policy_number: string | null; insurer: string | null; start_date: string | null; end_date: string | null; premium: number | null; sum_insured: number | null; currency: string | null; product_line: string | null; class_of_insurance: string | null }

export const NOTE_TYPES = new Set(['insurer_debit_note', 'credit_note', 'payment_advice'])
export const TERMS_TYPES = new Set(['policy_schedule', 'renewal_notice', 'cover_note', 'endorsement'])
export const CLAIM_TYPES = new Set(['claim'])

export type MoneyRead =
  | { kind: 'note'; read: InsurerNoteRead }
  | { kind: 'terms'; read: ScheduleRead }
  | { kind: 'claim'; read: ClaimSettlementRead }

/** Which reader a document type gets, and what it found. Null when the text says nothing. */
export function readMoney(docType: string, text: string | null | undefined): MoneyRead | null {
  if (!text || text.length < 60) return null
  if (NOTE_TYPES.has(docType)) { const r = readInsurerNote(text); return r ? { kind: 'note', read: r } : null }
  if (TERMS_TYPES.has(docType)) {
    const r = readScheduleTerms(text)
    if (r) return { kind: 'terms', read: r }
    const n = readInsurerNote(text); return n ? { kind: 'note', read: n } : null
  }
  if (CLAIM_TYPES.has(docType)) { const r = readClaimSettlement(text); return r ? { kind: 'claim', read: r } : null }
  return null
}

/**
 * The policy a document belongs to: the one it was filed under, else the company's policy whose
 * number shares an identity token with the number in the text, else (one live policy of that
 * insurer and period) that policy. Null when nothing decides it.
 */
export function matchPolicy(doc: MoneyDoc, readPolicyNo: string | null, period: { start: string | null; end: string | null }, insurer: string | null, policies: PolicyLite[]): PolicyLite | null {
  if (doc.policy_id) { const p = policies.find(x => x.id === doc.policy_id); if (p) return p }
  const no = readPolicyNo ?? doc.policy_number
  if (no) {
    let hits = policies.filter(p => samePolicyNumber(p.policy_number, no))
    // A record typed with a slip still matches on its digits, when that leaves exactly one policy.
    if (!hits.length) { const near = policies.filter(p => nearlySamePolicyNumber(p.policy_number, no)); if (near.length === 1) hits = near }
    if (hits.length === 1) return hits[0]
    if (hits.length > 1 && period.start) { const same = hits.filter(p => p.start_date === period.start); if (same.length === 1) return same[0] }
    if (hits.length > 1) return hits.sort((a, b) => String(b.start_date ?? '').localeCompare(String(a.start_date ?? '')))[0]
  }
  if (insurer && period.start) {
    const core = insurer.toLowerCase().split(/\s+/)[0]
    const same = policies.filter(p => p.insurer?.toLowerCase().includes(core) && p.start_date === period.start)
    if (same.length === 1) return same[0]
  }
  return null
}

/** The policies a document filed under this company may belong to: the company's, and its group's (parent and siblings). */
export async function companyPolicies(companyId: string): Promise<PolicyLite[]> {
  const [c] = await sbTry<Row[]>(`companies?id=eq.${enc(companyId)}&select=id,parent_id&limit=1`, [])
  const root = c?.parent_id ?? companyId
  const members = await sbTry<Row[]>(`companies?or=(id.eq.${enc(root)},parent_id.eq.${enc(root)})&select=id`, [])
  const ids = Array.from(new Set([companyId, ...members.map(m => m.id as string)]))
  const own = await sbTry<PolicyLite[]>(`policies?company_id=in.(${ids.join(',')})&select=id,company_id,policy_number,insurer,start_date,end_date,premium,sum_insured,currency,product_line,class_of_insurance&limit=400`, [])
  // The company's own policies first, so a number shared across the group resolves to this entity.
  return own.sort((a, b) => Number(b.company_id === companyId) - Number(a.company_id === companyId))
}

export type ApplyResult = { wrote: string[]; skipped: string | null; policy_id: string | null }

const docLinks = (doc: MoneyDoc) => ({ document_id: doc.id, drive_url: doc.drive_url, thread_id: doc.thread_id, filename: doc.filename })

/** An insurer's note → policy_transactions. TRS's own notes and commission statements are skipped. */
export async function applyInsurerNote(doc: MoneyDoc, r: InsurerNoteRead, policy: PolicyLite, write: boolean): Promise<ApplyResult> {
  if (r.issuer === 'trs') return { wrote: [], skipped: 'trs_own_note', policy_id: policy.id }
  if (r.copy === 'intermediary' && !r.gross) return { wrote: [], skipped: 'commission_statement', policy_id: policy.id }
  const amount = r.gross?.value ?? (r.total && r.gst ? r.total.value - r.gst.value : r.total?.value)
  if (amount == null || !policy.company_id) return { wrote: [], skipped: 'no_amount', policy_id: policy.id }
  // Recorded already: from this document, or from another copy of the same note (client copy, intermediary copy, the one in a zip).
  const noteKey = (s: string | null | undefined) => String(s ?? '').toUpperCase().replace(/\s+/g, '')
  const have = await sbTry<Row[]>(`policy_transactions?policy_id=eq.${enc(policy.id)}&select=id,note_no,evidence&limit=500`, [])
  if (have.some(t => t.evidence?.document_id === doc.id || (r.note_no && t.note_no && noteKey(t.note_no) === noteKey(r.note_no)))) return { wrote: [], skipped: 'already_recorded', policy_id: policy.id }
  if (!write) return { wrote: ['policy_transactions'], skipped: null, policy_id: policy.id }
  const { duplicate } = await recordTransaction(policy.id, policy.company_id, {
    kind: r.kind, note_no: r.note_no, issued_on: r.issued_on ?? doc.received_at?.slice(0, 10) ?? null, pax: r.headcount,
    amount: Math.abs(amount), currency: r.currency, description: `${r.endorsement ? 'Endorsement' : r.kind === 'credit' ? 'Credit' : 'Premium'}${r.items.length ? ` · ${r.items.map(i => i.label).join(', ')}` : ''} · ${doc.filename}`,
    period_start: r.period_start, period_end: r.period_end, insurer: r.insurer ?? policy.insurer,
    source_thread_id: doc.thread_id, source_message_id: doc.message_id, source_attachment_id: doc.email_attachment_id,
    // The ledger reads document_id, drive_url, filename and the figures with their lines; the shape is this reader's, not the inbound agent's.
    evidence: { ...docLinks(doc), copy: r.copy, gross: r.gross, gst: r.gst, total: r.total, commission: r.commission, items: r.items, confidence: r.confidence, read_by: MONEY_ACTOR } as unknown as TransactionEvidence,
    needs_review: r.confidence !== 'high' || r.copy === 'intermediary',
  })
  return { wrote: duplicate ? [] : ['policy_transactions'], skipped: duplicate ? 'duplicate_note_no' : null, policy_id: policy.id }
}

/** A schedule or renewal notice → the policy's premium and sum insured (when empty) and dated facts. */
export async function applyScheduleTerms(doc: MoneyDoc, r: ScheduleRead, policy: PolicyLite, write: boolean): Promise<ApplyResult> {
  if (!policy.company_id) return { wrote: [], skipped: 'no_company', policy_id: policy.id }
  const wrote: string[] = []
  // Keyed by policy and period year, so the 2025 and 2026 schedules of one record both stand; an
  // endorsement's figures and a renewal invitation's stand apart from the in-force schedule's.
  const key = `${policyTokens(policy.policy_number)[0] ?? policy.id.slice(0, 8)}:${(r.period_start ?? policy.start_date ?? '').slice(0, 4) || 'undated'}${doc.doc_type === 'endorsement' ? ':endorsement' : ''}${r.renewal_terms ? ':renewal' : ''}`
  const date = r.period_start ?? doc.received_at?.slice(0, 10) ?? null
  const fact = (k: string, value: string, quote: string | null): FactInput => ({
    company_id: policy.company_id!, policy_id: policy.id, topic: 'cover', key: `${k}:${key}`, value,
    source_kind: 'document', source_id: doc.id, source_date: date, quote: quote?.slice(0, 240) ?? null, confidence: r.confidence,
  })
  const facts: FactInput[] = []
  if (r.gross) facts.push(fact('premium.gross', r.gross.value.toFixed(2), r.gross.line))
  if (r.total) facts.push(fact('premium.total', r.total.value.toFixed(2), r.total.line))
  if (r.sum_insured) facts.push(fact('sum_insured', r.sum_insured.value.toFixed(2), r.sum_insured.line))
  if (r.excess) facts.push(fact('excess', r.excess.value.toFixed(2), r.excess.line))
  if (r.headcount) facts.push(fact('headcount', String(r.headcount), `Headcount ${r.headcount}`))
  if (r.rate_per_head) facts.push(fact('rate.per_head', r.rate_per_head.toFixed(2), `${r.gross?.line ?? ''} / ${r.headcount} heads`))
  if (r.wages) facts.push(fact('wages.rated', r.wages.value.toFixed(2), r.wages.line))
  if (r.period_start && r.period_end) facts.push(fact('period', `${r.period_start} to ${r.period_end}`, null))
  if (!facts.length) return { wrote: [], skipped: 'nothing_read', policy_id: policy.id }
  // The policy row carries the in-force figures, not a renewal invitation's; only blanks are filled.
  const samePeriod = !r.period_start || !policy.start_date || Math.abs(Date.parse(r.period_start) - Date.parse(policy.start_date)) <= 31 * 86_400_000
  const patch: Row = {}
  if (!r.renewal_terms && samePeriod) {
    if (policy.premium == null && r.gross) patch.premium = r.gross.value
    if (policy.sum_insured == null && r.sum_insured) patch.sum_insured = r.sum_insured.value
    if (!policy.currency && r.currency) patch.currency = r.currency
  }
  // Already on file: the same key and value current on this policy (from any copy of the document),
  // or any fact this document wrote before, even one a later document has since superseded.
  const [current, ever] = await Promise.all([
    sbTry<Row[]>(`company_facts?policy_id=eq.${enc(policy.id)}&superseded_by=is.null&select=key,value&limit=200`, []),
    sbTry<Row[]>(`company_facts?source_id=eq.${enc(doc.id)}&select=key&limit=100`, []),
  ])
  const fresh = facts.filter(f => !current.some(k => k.key === f.key && String(k.value) === f.value) && !ever.some(k => k.key === f.key))
  if (!fresh.length && !Object.keys(patch).length) return { wrote: [], skipped: 'already_recorded', policy_id: policy.id }
  if (!write) return { wrote: [...(fresh.length ? [`company_facts×${fresh.length}`] : []), ...(Object.keys(patch).length ? ['policies'] : [])], skipped: null, policy_id: policy.id }
  const w = await writeFacts(facts, MONEY_ACTOR)
  if (w.inserted) wrote.push(`company_facts×${w.inserted}`)
  if (Object.keys(patch).length) { await sb(`policies?id=eq.${enc(policy.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) }); wrote.push('policies') }
  return { wrote, skipped: wrote.length ? null : 'already_recorded', policy_id: policy.id }
}

/** A claim letter → the claim's settled amount, decision and document list. The claim is found by reference, else by policy and claimant. */
export async function applyClaimSettlement(doc: MoneyDoc, r: ClaimSettlementRead, policy: PolicyLite | null, write: boolean): Promise<ApplyResult> {
  if (!doc.company_id) return { wrote: [], skipped: 'no_company', policy_id: policy?.id ?? null }
  const claims = await sbTry<Row[]>(`claims?company_id=eq.${enc(doc.company_id)}&select=id,insurer_ref,claimant,policy_id,amount_settled,documents,stage,source_document_id,insurer_name&limit=200`, [])
  const refKey = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  let claim = r.claim_no ? claims.find(c => c.insurer_ref && refKey(c.insurer_ref) === refKey(r.claim_no)) ?? null : null
  if (!claim && r.claimant) { const n = r.claimant.toLowerCase(); claim = claims.find(c => c.claimant && (c.claimant.toLowerCase().includes(n) || n.includes(c.claimant.toLowerCase()))) ?? null }
  if (!claim && policy) { const same = claims.filter(c => c.policy_id === policy.id); if (same.length === 1) claim = same[0] }
  if (!claim) return openClaimFromLetter(doc, r, policy, claims, write)
  const docs: Row[] = Array.isArray(claim.documents) ? claim.documents : []
  if (docs.some(d => d.document_id === doc.id)) return { wrote: [], skipped: 'already_recorded', policy_id: policy?.id ?? null }
  const patch: Row = { documents: [...docs, { name: doc.filename, received_at: doc.received_at, source: 'document', document_id: doc.id, drive_url: doc.drive_url, decision: r.decision, amount: r.amount?.value ?? null }], updated_at: new Date().toISOString() }
  if (r.amount && (r.decision === 'paid' || r.decision === 'approved') && claim.amount_settled == null) patch.amount_settled = Math.abs(r.amount.value)
  if (!r.claim_no || !claim.insurer_ref) { /* the claims agent owns references; only amounts and documents here */ }
  if (!write) return { wrote: ['claims'], skipped: null, policy_id: policy?.id ?? null }
  await sb(`claims?id=eq.${enc(claim.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) })
  return { wrote: ['claims'], skipped: null, policy_id: policy?.id ?? null }
}

/** Reads one filed document's money and writes it where it belongs. For the backfill and the document clerk. */
export async function applyMoneyRead(doc: MoneyDoc, text: string | null | undefined, policies: PolicyLite[], write: boolean): Promise<{ read: MoneyRead | null; result: ApplyResult }> {
  const read = readMoney(doc.doc_type, text)
  if (!read) return { read: null, result: { wrote: [], skipped: 'not_read', policy_id: doc.policy_id } }
  if (read.kind === 'claim') {
    // The policy a settlement belongs to is often only in the file name ("… (Policy No GMB-N0019768-T00001) Claim for …").
    let policy = matchPolicy(doc, read.read.policy_no ?? findPolicyNoInText(doc.filename), { start: null, end: null }, null, policies)
    // No number anywhere: the insurer that wrote the letter, when the company holds one live policy with it.
    if (!policy) {
      const insurer = findInsurerName(text ?? '') ?? doc.insurer_name
      const core = (insurer ?? '').toLowerCase().split(/\s+/).find(w => w.length >= 3 && !/^(the|insurance|assurance|singapore|pte|ltd|limited|company|general)$/.test(w))
      const same = core ? policies.filter(p => p.insurer?.toLowerCase().includes(core) && (!p.end_date || p.end_date >= (doc.received_at ?? '').slice(0, 10))) : []
      if (same.length === 1) policy = same[0]
    }
    return { read, result: await applyClaimSettlement(doc, read.read, policy, write) }
  }
  let policy = matchPolicy(doc, read.read.policy_no, { start: read.read.period_start, end: read.read.period_end }, read.read.insurer, policies)
  // A schedule or cover note for cover TRS has no record of opens the policy row, then fills it.
  if (!policy && read.kind === 'terms') {
    const opened = await openPolicyFromSchedule(doc, read.read, policies, write, text)
    if (opened.skipped || !write) return { read, result: opened }
    policy = policies.find(p => p.id === opened.policy_id) ?? null
    if (!policy) return { read, result: opened }
    const terms = await applyScheduleTerms(doc, read.read, policy, write)
    return { read, result: { wrote: [...opened.wrote, ...terms.wrote], skipped: null, policy_id: policy.id } }
  }
  if (!policy) return { read, result: { wrote: [], skipped: 'no_policy_matched', policy_id: null } }
  return { read, result: read.kind === 'note' ? await applyInsurerNote(doc, read.read, policy, write) : await applyScheduleTerms(doc, read.read, policy, write) }
}

/** Document types that prove cover on their own; a renewal notice invites, an endorsement amends a policy that must already exist. */
export const OPENS_POLICY_TYPES = new Set(['policy_schedule', 'cover_note'])

/**
 * Whether a schedule describes a policy the group has no row for: a number present, a period, and no
 * policy sharing the number (even typed with a slip) or the same insurer, class and start. Pure.
 */
export function policyToOpen(doc: MoneyDoc, r: ScheduleRead, policies: PolicyLite[], company?: { kind: string | null; company_name: string | null; aliases?: string[] } | null, text?: string | null): { number: string; start: string; end: string | null; insurer: string | null; cls: string | null } | { reason: string } {
  if (!OPENS_POLICY_TYPES.has(doc.doc_type)) return { reason: 'not_a_schedule' }
  if (r.renewal_terms) return { reason: 'renewal_invitation' }
  // Only a client holds a policy: a schedule filed under the insurer's, a TPA's or a partner's record opens nothing.
  if (company && company.kind && company.kind !== 'client') return { reason: 'not_a_client' }
  // The schedule must name the company it is filed under (a misfiled schedule opens nothing on the wrong client).
  if (company?.company_name && text && !namesCompany(text, company.company_name, company.aliases ?? [])) return { reason: 'insured_not_named' }
  const number = r.policy_no ?? doc.policy_number
  if (!number) return { reason: 'no_policy_number' }
  const start = r.period_start ?? null
  if (!start) return { reason: 'no_period' }
  if (policies.some(p => samePolicyNumber(p.policy_number, number) || nearlySamePolicyNumber(p.policy_number, number))) return { reason: 'number_on_file' }
  const insurer = r.insurer ?? doc.insurer_name ?? null
  const cls = doc.class_of_insurance ?? doc.title ?? null
  const core = (insurer ?? '').toLowerCase().split(/\s+/)[0]
  if (core && cls && policies.some(p => p.insurer?.toLowerCase().includes(core) && p.start_date === start && (p.class_of_insurance ?? '').toLowerCase() === cls.toLowerCase())) return { reason: 'same_cover_on_file' }
  return { number, start, end: r.period_end ?? null, insurer, cls }
}

/**
 * Whether a document's text names a company, by any of its names: the three most telling words of
 * a name (not "pte", "ltd", "the"…) all appear, compared without spaces or punctuation so that
 * "Soil-Build" matches "SOILBUILD". Pure.
 */
export function namesCompany(text: string, companyName: string, aliases: string[] = []): boolean {
  const generic = new Set(['pte', 'ltd', 'limited', 'the', 'and', 'co', 'company', 'inc', 'llp', 'llc', 'sdn', 'bhd', 'private', 'holdings', 'group', 'singapore', 'international', 'services', 'trading', 'enterprise', 'enterprises', 'branch'])
  const t = text.toLowerCase().replace(/[^a-z0-9]/g, '')
  return [companyName, ...aliases].some(name => {
    const words = name.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length >= 3 && !generic.has(w)).slice(0, 3)
    return words.length > 0 && words.every(w => t.includes(w))
  })
}

/** A company's kind and every name it goes by, for the insured-named check. */
export async function companyNames(companyId: string): Promise<{ kind: string | null; company_name: string | null; aliases: string[] } | null> {
  const [c] = await sbTry<{ kind: string | null; company_name: string | null }[]>(`companies?id=eq.${enc(companyId)}&select=kind,company_name&limit=1`, [])
  if (!c) return null
  const aliases = await sbTry<{ alias: string }[]>(`company_aliases?company_id=eq.${enc(companyId)}&select=alias&limit=50`, [])
  return { ...c, aliases: aliases.map(a => a.alias).filter(Boolean) }
}

/** Opens the policy a schedule proves, links the document, logs it. The new policy joins `policies` so later documents match it. */
export async function openPolicyFromSchedule(doc: MoneyDoc, r: ScheduleRead, policies: PolicyLite[], write: boolean, text?: string | null): Promise<ApplyResult> {
  if (!doc.company_id) return { wrote: [], skipped: 'no_company', policy_id: null }
  const company = await companyNames(doc.company_id)
  const d = policyToOpen(doc, r, policies, company, text)
  if ('reason' in d) return { wrote: [], skipped: d.reason === 'number_on_file' || d.reason === 'same_cover_on_file' ? 'no_policy_matched' : d.reason, policy_id: null }
  if (!write) return { wrote: ['policies:open'], skipped: null, policy_id: null }
  if (await policyExists(doc.company_id, d.number)) return { wrote: [], skipped: 'no_policy_matched', policy_id: null }
  const row = policyFromDocument({ company_id: doc.company_id, doc_type: doc.doc_type, insurer_name: d.insurer, policy_number: d.number, period_from: d.start, period_to: d.end, premium_text: r.gross ? `${r.currency} ${r.gross.value.toFixed(2)}` : null, title: doc.title ?? null }, d.cls)
  const { id } = await createPolicy({ ...row, premium: r.gross?.value ?? row.premium, currency: r.currency || row.currency }, MONEY_ACTOR)
  if (r.sum_insured) await sb(`policies?id=eq.${enc(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ sum_insured: r.sum_insured.value }) }).catch(() => 0)
  await sbTry(`policy_documents?id=eq.${enc(doc.id)}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ policy_id: id }) })
  await depositEvent('policies', id).catch(() => 0)
  policies.push({ id, company_id: doc.company_id, policy_number: d.number, insurer: d.insurer, start_date: d.start, end_date: d.end, premium: r.gross?.value ?? null, sum_insured: r.sum_insured?.value ?? null, currency: r.currency, product_line: row.product_line, class_of_insurance: row.class_of_insurance })
  return { wrote: ['policies:open'], skipped: null, policy_id: id }
}

/**
 * A settlement letter with no claim on the register: when it states a payment or approval with a
 * figure, and names a policy on file or a claim reference, the claim is opened as settled so the
 * policy's loss ratio counts it. A letter that states only a decision, or a declinature, opens nothing.
 */
export async function openClaimFromLetter(doc: MoneyDoc, r: ClaimSettlementRead, policy: PolicyLite | null, claims: Row[], write: boolean): Promise<ApplyResult> {
  const paid = r.amount && (r.decision === 'paid' || r.decision === 'approved') ? Math.abs(r.amount.value) : null
  if (!paid || (!policy && !r.claim_no)) return { wrote: [], skipped: 'no_claim_matched', policy_id: policy?.id ?? null }
  // The same settlement already opened from another copy of the letter (a zip, a PDF and an .eml of
  // one payment), or recorded by the claims agent: the same figure, and the same reference or
  // claimant where both sides state one.
  const refKey = (x: string | null | undefined) => (x ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const twin = claims.find(c => c.source_document_id === doc.id || (c.amount_settled != null && Math.abs(Number(c.amount_settled) - paid) < 0.01
    && (!r.claim_no || !c.insurer_ref || refKey(c.insurer_ref) === refKey(r.claim_no))
    && (!r.claimant || !c.claimant || c.claimant.toLowerCase().includes(r.claimant.toLowerCase()) || r.claimant.toLowerCase().includes(c.claimant.toLowerCase()))))
  if (twin) {
    // A later copy may name the policy the first did not.
    if (write && policy && !twin.policy_id) { await sb(`claims?id=eq.${enc(twin.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ policy_id: policy.id, policy_number: policy.policy_number, insurer_name: twin.insurer_name ?? policy.insurer }) }); twin.policy_id = policy.id; return { wrote: ['claims'], skipped: null, policy_id: policy.id } }
    return { wrote: [], skipped: 'already_recorded', policy_id: policy?.id ?? null }
  }
  if (!write) return { wrote: ['claims:open'], skipped: null, policy_id: policy?.id ?? null }
  const settled = r.decision === 'paid'
  const when = r.letter_date ?? doc.received_at?.slice(0, 10) ?? null
  const [made] = await sb<Row[]>('claims', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
    company_id: doc.company_id, policy_id: policy?.id ?? null, insurer_name: policy?.insurer ?? doc.insurer_name ?? null,
    class: claimClass(policy?.class_of_insurance ?? policy?.product_line ?? null, doc.filename), policy_number: policy?.policy_number ?? r.policy_no ?? null,
    insurer_ref: r.claim_no, claimant: r.claimant, loss_date: r.event_date, notified_at: null, amount_settled: paid, paid_at: settled ? when : null,
    stage: settled ? 'settled' : 'offer', waiting_on: settled ? null : 'client', opened_mode: 'from_document', source_document_id: doc.id,
    documents: [{ name: doc.filename, received_at: doc.received_at, source: 'document', document_id: doc.id, drive_url: doc.drive_url, decision: r.decision, amount: paid }],
    last_mail_at: doc.received_at, closed_at: settled ? (when ? `${when}T00:00:00Z` : new Date().toISOString()) : null,
  }) })
  if (made?.id) { claims.push(made); await depositEvent('claims', made.id).catch(() => 0) }
  return { wrote: ['claims:open'], skipped: null, policy_id: policy?.id ?? null }
}

/** The settled amount in a claim's attachments, for the claims agent: the first paid or approved letter with a figure. */
export async function settledFromAttachments(messageIds: string[]): Promise<{ value: number; line: string } | null> {
  if (!messageIds.length) return null
  const atts = await sbTry<Row[]>(`email_attachments?message_id=in.(${messageIds.slice(0, 60).join(',')})&select=parsed_text&limit=100`, [])
  for (const a of atts) {
    const r = a.parsed_text ? readClaimSettlement(a.parsed_text) : null
    if (r?.amount && (r.decision === 'paid' || r.decision === 'approved')) return { value: Math.abs(r.amount.value), line: r.amount.line }
  }
  return null
}
