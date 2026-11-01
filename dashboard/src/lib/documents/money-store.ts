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
import { readInsurerNote, readScheduleTerms, readClaimSettlement, samePolicyNumber, nearlySamePolicyNumber, policyTokens, type InsurerNoteRead, type ScheduleRead, type ClaimSettlementRead } from './money'

type Row = Record<string, any>
export const MONEY_ACTOR = 'policy_reader'

export type MoneyDoc = {
  id: string; company_id: string | null; policy_id: string | null; doc_type: string; filename: string
  received_at: string | null; email_attachment_id: string | null; thread_id: string | null; message_id: string | null
  drive_url: string | null; policy_number: string | null; insurer_name: string | null
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
  const claims = await sbTry<Row[]>(`claims?company_id=eq.${enc(doc.company_id)}&select=id,insurer_ref,claimant,policy_id,amount_settled,documents,stage&limit=200`, [])
  const refKey = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  let claim = r.claim_no ? claims.find(c => c.insurer_ref && refKey(c.insurer_ref) === refKey(r.claim_no)) ?? null : null
  if (!claim && r.claimant) { const n = r.claimant.toLowerCase(); claim = claims.find(c => c.claimant && (c.claimant.toLowerCase().includes(n) || n.includes(c.claimant.toLowerCase()))) ?? null }
  if (!claim && policy) { const same = claims.filter(c => c.policy_id === policy.id); if (same.length === 1) claim = same[0] }
  if (!claim) return { wrote: [], skipped: 'no_claim_matched', policy_id: policy?.id ?? null }
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
    const policy = matchPolicy(doc, read.read.policy_no, { start: null, end: null }, null, policies)
    return { read, result: await applyClaimSettlement(doc, read.read, policy, write) }
  }
  const policy = matchPolicy(doc, read.read.policy_no, { start: read.read.period_start, end: read.read.period_end }, read.read.insurer, policies)
  if (!policy) return { read, result: { wrote: [], skipped: 'no_policy_matched', policy_id: null } }
  return { read, result: read.kind === 'note' ? await applyInsurerNote(doc, read.read, policy, write) : await applyScheduleTerms(doc, read.read, policy, write) }
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
