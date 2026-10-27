/**
 * The insurer's own notes on an EB policy: every debit and credit it issues, as read from the
 * email they came on or typed in by hand. Amounts are stored signed (a credit is negative) so
 * the running position is one sum. Proration is the insurer's arithmetic; we record what it
 * issued and match each note to the movement it settles.
 */
import { sbTry } from '@/lib/crm/db'
import { insert, patch } from '@/lib/placement/store'
import { normName } from './members'
import type { PolicyMovement, PolicyTransaction, TransactionEvidence, TransactionKind } from './types'

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const noteKey = (n: string | null | undefined) => String(n ?? '').toUpperCase().replace(/\s+/g, '')

export async function listTransactions(policyId: string): Promise<PolicyTransaction[]> {
  return sbTry<PolicyTransaction[]>(`policy_transactions?policy_id=eq.${policyId}&order=issued_on.desc.nullslast,created_at.desc`, [])
}

export type NewTransaction = {
  kind: TransactionKind
  note_no?: string | null
  issued_on?: string | null
  pax?: number | null
  /** The figure as written on the note, positive. The sign comes from kind. */
  amount: number
  currency?: string | null
  description?: string | null
  period_start?: string | null
  period_end?: string | null
  insurer?: string | null
  member_names?: string[] | null
  source_thread_id?: string | null
  source_message_id?: string | null
  source_attachment_id?: string | null
  evidence?: TransactionEvidence
  needs_review?: boolean
}

/** The signed amount a row stores: debits positive, credits negative, whatever sign came in. */
export const signedAmount = (kind: TransactionKind, amount: number): number =>
  kind === 'credit' ? -Math.abs(amount) : Math.abs(amount)

/**
 * Writes the note. A note number already on the policy is returned as it stands rather than
 * written twice (the insurer re-sends; so does the broker forwarding it), with `duplicate` set.
 */
export async function recordTransaction(policyId: string, companyId: string, t: NewTransaction): Promise<{ transaction: PolicyTransaction; duplicate: boolean }> {
  const amount = Number(t.amount)
  if (!Number.isFinite(amount)) throw new Error('Amount is not a number')
  const noteNo = t.note_no?.trim().slice(0, 80) || null
  if (noteNo) {
    const existing = (await listTransactions(policyId)).find(x => x.note_no && noteKey(x.note_no) === noteKey(noteNo))
    if (existing) return { transaction: existing, duplicate: true }
  }
  const names = Array.isArray(t.member_names) ? t.member_names.filter(s => typeof s === 'string' && s.trim()).map(s => s.trim().slice(0, 200)).slice(0, 200) : []
  const [row] = await insert<PolicyTransaction>('policy_transactions', {
    policy_id: policyId, company_id: companyId, kind: t.kind, note_no: noteNo, issued_on: isDate(t.issued_on) ? t.issued_on : null,
    pax: t.pax != null && Number.isFinite(Number(t.pax)) ? Math.round(Number(t.pax)) : null,
    amount: signedAmount(t.kind, amount), currency: (t.currency?.trim().toUpperCase() || 'SGD').slice(0, 8),
    description: t.description?.trim().slice(0, 1000) || null,
    period_start: isDate(t.period_start) ? t.period_start : null, period_end: isDate(t.period_end) ? t.period_end : null,
    insurer: t.insurer?.trim() || null, member_names: names,
    source_thread_id: t.source_thread_id ?? null, source_message_id: t.source_message_id ?? null, source_attachment_id: t.source_attachment_id ?? null,
    evidence: t.evidence && typeof t.evidence === 'object' ? t.evidence : {}, needs_review: !!t.needs_review,
  })
  return { transaction: row, duplicate: false }
}

/**
 * The movements a note settles, among those still open. Pure.
 *   1. By member name: every open movement whose name is on the note.
 *   2. Else by pax and date: open movements of the matching kind (credit ↔ leave, debit ↔ join
 *      or change) whose pax equals the note's, the one nearest the note's period start (or
 *      issue date). One movement only; a note without a name and without pax matches nothing.
 */
export function matchMovement(
  transaction: Pick<PolicyTransaction, 'kind' | 'pax' | 'issued_on' | 'period_start' | 'member_names'>,
  movements: PolicyMovement[],
): PolicyMovement[] {
  const open = movements.filter(m => (m.status === 'reported' || m.status === 'sent') && !m.transaction_id)
  const names = new Set((transaction.member_names ?? []).map(normName).filter(Boolean))
  if (names.size) {
    const byName = open.filter(m => names.has(normName(m.member_name)))
    if (byName.length) return byName
  }
  if (transaction.pax == null || transaction.pax <= 0) return []
  const kinds = transaction.kind === 'credit' ? ['leave'] : ['join', 'change']
  const anchor = transaction.period_start ?? transaction.issued_on
  const cands = open.filter(m => kinds.includes(m.kind) && m.pax === transaction.pax)
  if (cands.length === 0) return []
  if (!anchor) return [cands[0]]
  const t0 = Date.parse(anchor)
  const dist = (m: PolicyMovement) => m.effective_on ? Math.abs(Date.parse(m.effective_on) - t0) : Number.MAX_SAFE_INTEGER
  return [[...cands].sort((a, b) => dist(a) - dist(b))[0]]
}

/** Links the matched movements to the note: status 'noted', transaction_id set. */
export async function noteMovements(transactionId: string, movements: PolicyMovement[]): Promise<void> {
  if (movements.length === 0) return
  await patch('policy_movements', `id=in.(${movements.map(m => m.id).join(',')})`, { status: 'noted', transaction_id: transactionId })
}
