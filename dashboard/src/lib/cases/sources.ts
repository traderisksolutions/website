/**
 * Case sources: which threads a case is built from, and what was said on them.
 *
 * A thread joins a case when a person picks it. Code only proposes: threads of the same client
 * from the last 90 days that carry the case's policy number, share its subject words or carry a
 * label of its kind. A thread a person took off the case is never proposed again. What was said
 * is the messages themselves, in two buckets: the client's side and the insurer's side. A message
 * from outside goes by its sender's domain; a TRS message goes by the side of the thread it is on.
 * Words belong to whoever wrote them: a quote found only in an email's history (a forward, a
 * quoted reply) is the earlier sender's, not the forwarder's.
 * No model reads anything here.
 *
 * Pure. Tested in __tests__/sources.test.ts. The reads and writes are in sources-store.ts.
 */
import { partyOf, ownText } from '@/lib/admin/k/shape'
import { isAutoReply, isInternalOnly } from '@/lib/threads/waiting'
import { bareEmail } from '@/lib/crm/db'
import { plainSubject, type Label } from './labels'
import { BACK_BURNER_DAYS, daysBetween } from './relevance'
import { bySimilarity } from './similarity'

export const SIDES = ['client', 'insurer', 'internal', 'other'] as const
export type Side = typeof SIDES[number]
export const isSide = (v: unknown): v is Side => typeof v === 'string' && (SIDES as readonly string[]).includes(v)

export type Bucket = 'client' | 'insurer'
export const BUCKET_NAME: Record<Bucket, string> = { client: 'Client side', insurer: 'Insurer side' }

export type SourceMessage = {
  id: string; thread_id: string; direction: string; from_address: string | null; subject: string | null
  body_text: string | null; sent_at: string | null; to?: string[]; cc?: string[]; files?: string[]
}

/** One message as the case shows it: when, who, their own words, and the email it opens. */
export type Said = { message_id: string; thread_id: string; at: string | null; from: string; by: 'them' | 'trs'; text: string; files: string[]; href: string }

const INSURER = new Set(['insurer', 'tpa'])
const sideBucket = (s: Side | undefined): Bucket | null => (s === 'client' || s === 'insurer' ? s : null)

/** The side a thread is on, from the company it is filed under. `named` = an insurer or partner thread that names this client. */
export function sideOfThread(t: { company_id: string | null; companyKind: string | null; named: boolean }, clientCompanyId: string | null): Side {
  if (t.companyKind && INSURER.has(t.companyKind)) return 'insurer'
  if (t.company_id && t.company_id === clientCompanyId) return 'client'
  if (t.companyKind === 'client') return 'client'
  return t.named ? 'insurer' : 'other'
}

export function bucketOf(m: SourceMessage, threadSide: Side | undefined, domainKind: Map<string, string>): Bucket | null {
  const sender = partyOf(m.from_address, domainKind, threadSide === 'client' ? 'client' : null)
  if (m.direction !== 'outbound' && sender !== 'internal') {
    if (sender === 'client') return 'client'
    if (INSURER.has(sender)) return 'insurer'
    return sideBucket(threadSide)
  }
  const side = sideBucket(threadSide)
  if (side) return side
  const to = [...(m.to ?? []), ...(m.cc ?? [])].map(a => partyOf(a, domainKind))
  return to.some(p => INSURER.has(p)) ? 'insurer' : to.includes('client') ? 'client' : null
}

/** Every message on the picked threads, in date order per bucket. Auto-replies and TRS-only messages are left out. */
export function buildBuckets(messages: readonly SourceMessage[], sides: Map<string, Side>, domainKind: Map<string, string>): Record<Bucket, Said[]> {
  const out: Record<Bucket, Said[]> = { client: [], insurer: [] }
  const sorted = [...messages].sort((a, b) => String(a.sent_at ?? '').localeCompare(String(b.sent_at ?? '')))
  for (const m of sorted) {
    if (isAutoReply(m) || isInternalOnly(m)) continue
    const bucket = bucketOf(m, sides.get(m.thread_id), domainKind)
    if (!bucket) continue
    const text = ownText(m.body_text, m.subject, 1200, false)
    if (!text && !(m.files ?? []).length) continue
    const trs = m.direction === 'outbound' || partyOf(m.from_address, domainKind) === 'internal'
    out[bucket].push({
      message_id: m.id, thread_id: m.thread_id, at: m.sent_at, from: bareEmail(m.from_address) || 'unknown', by: trs ? 'trs' : 'them',
      text: text ?? '', files: m.files ?? [], href: `/engagement?thread=${m.thread_id}`,
    })
  }
  return out
}

// ── proposals ─────────────────────────────────────────────────────────────────────────────────

/** The thread labels that belong to each kind of case. */
export const LABELS_FOR_CASE: Record<string, readonly Label[]> = {
  claim: ['claim'], renewal: ['renewal', 'quote_received', 'quotation_request'], new_quote: ['quotation_request', 'quote_received'],
  endorsement: ['endorsement', 'member_movement'], member_movement: ['member_movement', 'endorsement'],
  premium_billing: ['payment'], documents: ['document'],
}

export type CaseCore = { id: string; case_type: string; title: string | null; policy_number: string | null }
export type Candidate = {
  id: string; subject: string | null; last_message_at: string | null; label: Label | null; side: Side
  /** Another open case that holds the thread: picking it here moves it. */
  onCase: { id: string; title: string | null } | null
}
export type ProposalReason = 'policy_number' | 'subject' | 'label'
export type Proposal = Candidate & { reason: ProposalReason; basis: string }
export type Proposed = { proposed: Proposal[]; recent: Candidate[]; older: Candidate[] }

const STOP = new Set(['renewal', 'quotation', 'quote', 'request', 'claim', 'policy', 'insurance', 'group', 'limited', 'pte', 'ltd', 'from', 'with', 'your', 'for', 'the', 'and', 'new', 'enquiry', 'employee', 'benefits', 'update', 'reminder'])
/** The words of a title or subject that tell one matter from another: four letters or more, not a form word, plus any number of four digits or more. */
export function matterWords(s: string | null | undefined): Set<string> {
  return new Set((plainSubject(s).match(/[a-z]{4,}|\d{4,}/g) ?? []).filter(w => !STOP.has(w)))
}

const compact = (s: string | null | undefined) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * What to offer for a case out of the client's threads. `taken` are the picked and excluded thread
 * ids, which are never offered. Threads older than 90 days are listed apart and never proposed.
 * `similarity` (closeness to the threads already on the case) orders each group; without it, or
 * for a thread with no score, the order is newest first.
 */
export function proposeThreads(c: CaseCore, candidates: readonly Candidate[], taken: ReadonlySet<string>, today: string, similarity?: ReadonlyMap<string, number>): Proposed {
  const policy = compact(c.policy_number)
  const words = matterWords(c.title)
  const labels = LABELS_FOR_CASE[c.case_type] ?? []
  const out: Proposed = { proposed: [], recent: [], older: [] }
  const rank: Record<ProposalReason, number> = { policy_number: 0, subject: 1, label: 2 }
  for (const t of candidates) {
    if (taken.has(t.id)) continue
    if (!t.last_message_at || daysBetween(t.last_message_at, today) > BACK_BURNER_DAYS) { out.older.push(t); continue }
    const shared = [...matterWords(t.subject)].filter(w => words.has(w))
    if (policy.length >= 5 && compact(t.subject).includes(policy)) out.proposed.push({ ...t, reason: 'policy_number', basis: `Policy ${c.policy_number} in the subject` })
    else if (shared.length >= 2) out.proposed.push({ ...t, reason: 'subject', basis: `Subject shares: ${shared.slice(0, 4).join(', ')}` })
    else if (t.label && labels.includes(t.label)) out.proposed.push({ ...t, reason: 'label', basis: 'Label matches the case' })
    else out.recent.push(t)
  }
  const newest = bySimilarity()
  const closest = bySimilarity(similarity)
  out.proposed.sort((a, b) => rank[a.reason] - rank[b.reason] || closest(a, b))
  out.recent.sort(closest); out.older.sort(newest)
  return out
}
