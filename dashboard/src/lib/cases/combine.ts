/**
 * Combine: a person ticks threads on Today › Mail and makes one case of them, each thread marked
 * as the client's or as a named insurer's. What the form opens with is worked out here from the
 * threads themselves: the side each is on, the client most of them belong to, the kind of case
 * their labels point to, and a title from the oldest subject. The person's own choice stands over
 * every one of them. No model reads anything here.
 *
 * Pure. Tested in __tests__/combine.test.ts. The reads and writes are in combine-store.ts.
 */
import { CASE_TYPES, type CaseType } from '@/lib/casework/clean'
import { isLabel, type Label } from './labels'
import { isSide, sideOfThread, type Side } from './sources'

export const COMBINE_MAX = 40
export const isCaseType = (v: unknown): v is CaseType => typeof v === 'string' && (CASE_TYPES as readonly string[]).includes(v)

/** A thread's side as a person sets it: the side, and for the insurer side the insurer on file. */
export type From = { side: Side; insurer_id: string | null }

/** One ticked thread as it is read: where it is filed, the client an insurer thread names, the case that holds it. */
export type CombineSource = {
  id: string; subject: string | null; last_message_at: string | null; label: Label | null
  company: { id: string; name: string | null; kind: string | null } | null
  /** The client an insurer or partner thread is about (thread_insurers). */
  client_of: string | null
  /** The one insurer taking part in the thread (thread_insurers); null when none or several. */
  insurer_of: string | null
}
export type Held = { id: string; title: string | null; picked_by: string | null; picked_at: string | null }
export type CombineThread = Omit<CombineSource, 'client_of' | 'insurer_of'> & From & { held: Held | null }
export type CombinePreview = {
  threads: CombineThread[]
  insurers: { id: string; name: string }[]
  client: { id: string; name: string } | null
  /** The client's open cases, to add the threads to one instead of starting another. */
  cases: { id: string; title: string | null; case_type: string }[]
  case_type: CaseType
  title: string
}

const INSURER = new Set(['insurer', 'tpa'])

/** The client most of the threads belong to: a thread filed under a client names it, an insurer's thread names the client it is about. */
export function clientAmong(threads: readonly CombineSource[]): string | null {
  const votes = new Map<string, number>()
  for (const t of threads) {
    const id = t.company?.kind === 'client' ? t.company.id : t.client_of
    if (id) votes.set(id, (votes.get(id) ?? 0) + 1)
  }
  let best: string | null = null
  for (const [id, n] of votes) if (!best || n > votes.get(best)!) best = id
  return best
}

/** The side a thread opens on, and for the insurer side the insurer: the one it is filed under, else the one taking part. */
export function fromOfThread(t: CombineSource, clientId: string | null): From {
  const kind = t.company?.kind ?? null
  const side = sideOfThread({ company_id: t.company?.id ?? null, companyKind: kind, named: !!clientId && t.client_of === clientId }, clientId)
  if (side !== 'insurer') return { side, insurer_id: null }
  return { side, insurer_id: t.company && kind && INSURER.has(kind) ? t.company.id : t.insurer_of }
}

const TYPE_OF_LABEL: Record<Label, CaseType> = {
  quotation_request: 'new_quote', quote_received: 'new_quote', renewal: 'renewal', claim: 'claim', member_movement: 'member_movement',
  endorsement: 'endorsement', document: 'documents', payment: 'premium_billing', other: 'other',
}
/** The kind of case the threads' labels point to: the kind most of them carry; a renewal anywhere makes a quotation a renewal. */
export function caseTypeAmong(labels: readonly (Label | null | undefined)[]): CaseType {
  const votes = new Map<CaseType, number>()
  for (const l of labels) if (isLabel(l) && l !== 'other') votes.set(TYPE_OF_LABEL[l], (votes.get(TYPE_OF_LABEL[l]) ?? 0) + 1)
  if (votes.has('renewal') && votes.has('new_quote')) { votes.set('renewal', votes.get('renewal')! + votes.get('new_quote')!); votes.delete('new_quote') }
  let best: CaseType = 'other'
  for (const [type, n] of votes) if (best === 'other' || n > votes.get(best)!) best = type
  return best
}

export const TITLE_MAX = 140
/** A subject without its reply and forward marks, as a case title. */
export function titleOf(subject: string | null | undefined): string {
  let s = String(subject ?? '').replace(/\s+/g, ' ').trim()
  for (let k = 0; k < 6; k++) { const next = s.replace(/^((re|fw|fwd|回复|转发)\s*[:：]|\[[^\]]{0,24}\])\s*/i, ''); if (next === s) break; s = next }
  return s.slice(0, TITLE_MAX).trim()
}
/** The title a new case opens with: the subject the matter started under. */
export function titleAmong(threads: readonly { subject: string | null; last_message_at: string | null }[]): string {
  const oldest = [...threads].sort((a, b) => String(a.last_message_at ?? '').localeCompare(String(b.last_message_at ?? '')))
  for (const t of oldest) { const title = titleOf(t.subject); if (title) return title }
  return ''
}

export type CombineInput = {
  company_id: string | null; case_type: CaseType; title: string
  /** An open case of the client's to add the threads to; null starts a case. */
  work_item_id: string | null
  threads: ({ id: string } & From)[]
  /** The threads the person agreed to take off the case that holds them. */
  move: string[]
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

/** What a person sent, bounded and parsed; the reason when it cannot stand. */
export function readCombine(body: unknown): CombineInput | { error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const seen = new Set<string>()
  const threads: CombineInput['threads'] = []
  for (const raw of Array.isArray(b.threads) ? b.threads : []) {
    const t = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    if (!isId(t.id) || seen.has(t.id)) continue
    if (!isSide(t.side)) return { error: 'Choose a side for every thread.' }
    if (t.insurer_id != null && !isId(t.insurer_id)) return { error: 'Choose an insurer on file.' }
    seen.add(t.id)
    threads.push({ id: t.id, side: t.side, insurer_id: t.side === 'insurer' && isId(t.insurer_id) ? t.insurer_id : null })
  }
  if (!threads.length) return { error: 'Tick at least one thread.' }
  if (threads.length > COMBINE_MAX) return { error: `Combine up to ${COMBINE_MAX} threads at a time.` }
  const workItemId = b.work_item_id == null || b.work_item_id === '' ? null : b.work_item_id
  if (workItemId !== null && !isId(workItemId)) return { error: 'Choose a case.' }
  const move = (Array.isArray(b.move) ? b.move : []).filter(isId)
  if (workItemId) return { company_id: null, case_type: 'other', title: '', work_item_id: workItemId, threads, move }
  if (!isId(b.company_id)) return { error: 'Choose the client.' }
  if (!isCaseType(b.case_type)) return { error: 'Choose the kind of case.' }
  const title = String(b.title ?? '').replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX)
  if (!title) return { error: 'Give the case a title.' }
  return { company_id: b.company_id, case_type: b.case_type, title, work_item_id: null, threads, move }
}
