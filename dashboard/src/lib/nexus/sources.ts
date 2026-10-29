/**
 * The three record sources of the ledger, besides email. Each maps its records to rows (pure, and
 * tested) and syncs them: rows that should be open are inserted once (dedupe_key), open rows whose
 * date moved are updated, and open rows whose record no longer qualifies are closed as done.
 * A row a broker marked done stays done: the insert ignores keys already present.
 *
 *   rfq        — a dispatch sent to an insurer and not yet answered: the insurer owes a quotation,
 *                due at the next chase date; an insurer's request for information: TRS owes it.
 *   renewal    — a live policy ending within 60 days (or ended in the last 30 and still live): a date.
 *   debit_note — a new-system debit note unpaid or part-paid with a payment due date: the client
 *                owes payment. Historical imports are excluded: their paid status was never kept.
 */
import { sb, sbTry } from '@/lib/crm/db'
import { addWorkingDays, dedupeKey, dueAtFromDate, sgtDate } from './rules'
import type { FollowUp, FollowUpInsert } from './types'

export type DispatchRec = {
  id: string; company_id: string; insurer_name: string; to_email: string; status: string; thread_id: string | null
  sent_at: string | null; last_inbound_at: string | null; next_chase_at: string | null; sent_by?: string | null
  placements?: { ref: string | null } | null; placement_lines?: { label: string | null; product_line: string | null } | null
}
export type PolicyRec = {
  id: string; company_id: string | null; policy_number: string | null; insurer: string | null; label: string | null
  class_of_insurance: string | null; product_line: string | null; end_date: string | null; lifecycle: string | null
}
export type DebitNoteRec = {
  id: string; company_id: string; debit_note_no: string; issue_date: string | null; payment_due_date: string | null
  currency: string | null; gross_amount: number | null; net_amount: number | null; paid_amount: number | null; status: string; origin: string | null
  contacts?: { email: string | null; first_name: string | null; last_name: string | null } | null
}

const money = (n: number, ccy: string | null) => `${ccy ?? 'SGD'} ${n.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function mapDispatch(d: DispatchRec, owners: Map<string, string | null>, now: Date): FollowUpInsert | null {
  const line = d.placement_lines?.label ?? d.placement_lines?.product_line ?? 'the request'
  const base = {
    company_id: d.company_id, thread_id: d.thread_id, owner_email: d.sent_by ?? owners.get(d.company_id) ?? null,
    counterparty_name: d.insurer_name, counterparty_email: d.to_email, source_kind: 'rfq' as const, source_ref: d.id,
    source_label: d.placements?.ref ?? null, dedupe_key: dedupeKey.rfq(d.id),
  }
  if (d.status === 'sent' || d.status === 'acknowledged') {
    const since = d.sent_at ?? now.toISOString()
    return { ...base, owner_party: 'insurer', what: `Quotation for ${line}`, since_at: since,
      due_at: d.next_chase_at ?? dueAtFromDate(addWorkingDays(new Date(since), 3)) }
  }
  if (d.status === 'info_requested') {
    const since = d.last_inbound_at ?? d.sent_at ?? now.toISOString()
    // A different key: the insurer's question is a separate thing owed from the quotation.
    return { ...base, dedupe_key: `${dedupeKey.rfq(d.id)}:info`, owner_party: 'trs', what: `Information ${d.insurer_name} asked for on ${line}`,
      since_at: since, due_at: dueAtFromDate(addWorkingDays(new Date(since), 1)) }
  }
  return null
}

export const RENEWAL_AHEAD_DAYS = 60
export const RENEWAL_BEHIND_DAYS = 30
export function mapPolicy(p: PolicyRec, owners: Map<string, string | null>, now: Date): FollowUpInsert | null {
  if (!p.end_date || !p.lifecycle || !['live', 'renewal_due'].includes(p.lifecycle)) return null
  const today = sgtDate(now)
  const days = Math.round((Date.parse(p.end_date) - Date.parse(today)) / 86_400_000)
  if (days > RENEWAL_AHEAD_DAYS || days < -RENEWAL_BEHIND_DAYS) return null
  const cover = p.label ?? p.class_of_insurance ?? p.product_line ?? 'policy'
  return {
    company_id: p.company_id, owner_party: 'date', owner_email: p.company_id ? owners.get(p.company_id) ?? null : null,
    counterparty_name: p.insurer, what: `Renewal: ${cover}`, due_at: dueAtFromDate(p.end_date),
    since_at: dueAtFromDate(new Date(Date.parse(p.end_date) - RENEWAL_AHEAD_DAYS * 86_400_000).toISOString().slice(0, 10)),
    source_kind: 'renewal', source_ref: p.id, source_label: p.policy_number, dedupe_key: dedupeKey.renewal(p.id, p.end_date),
  }
}

export function mapDebitNote(n: DebitNoteRec, owners: Map<string, string | null>): FollowUpInsert | null {
  if (n.origin === 'historical' || !n.payment_due_date || !['unpaid', 'partially_paid'].includes(n.status)) return null
  const total = n.net_amount ?? n.gross_amount ?? 0
  const left = Math.max(0, total - (n.paid_amount ?? 0))
  if (total > 0 && left <= 0.005) return null
  const name = [n.contacts?.first_name, n.contacts?.last_name].filter(Boolean).join(' ').trim() || null
  return {
    company_id: n.company_id, owner_party: 'client', owner_email: owners.get(n.company_id) ?? null,
    counterparty_name: name, counterparty_email: n.contacts?.email?.toLowerCase() ?? null,
    what: `Payment of debit note ${n.debit_note_no}${total > 0 ? `, ${money(left, n.currency)}` : ''}`,
    due_at: dueAtFromDate(n.payment_due_date), since_at: n.issue_date ? dueAtFromDate(n.issue_date) : undefined,
    source_kind: 'debit_note', source_ref: n.id, source_label: n.debit_note_no, dedupe_key: dedupeKey.debitNote(n.id),
  }
}

export type SyncPlan = { insert: FollowUpInsert[]; redate: { id: string; due_at: string | null; what: string }[]; close: string[] }

/** What a sync does, given the rows that should exist and the rows of that kind that are live. Pure. */
export function planSync(want: FollowUpInsert[], live: Pick<FollowUp, 'id' | 'dedupe_key' | 'due_at' | 'what'>[]): SyncPlan {
  const byKey = new Map(want.map(w => [w.dedupe_key, w]))
  const liveKeys = new Set(live.map(l => l.dedupe_key))
  const redate: SyncPlan['redate'] = []
  const close: string[] = []
  for (const l of live) {
    const w = byKey.get(l.dedupe_key)
    if (!w) { close.push(l.id); continue }
    const due = w.due_at ?? null
    const same = (due == null && l.due_at == null) || (due != null && l.due_at != null && Date.parse(due) === Date.parse(l.due_at))
    if (!same || w.what !== l.what) redate.push({ id: l.id, due_at: due, what: w.what })
  }
  return { insert: want.filter(w => !liveKeys.has(w.dedupe_key)), redate, close }
}

async function companyOwners(ids: string[]): Promise<Map<string, string | null>> {
  const uniq = [...new Set(ids.filter(Boolean))]
  const out = new Map<string, string | null>()
  for (let i = 0; i < uniq.length; i += 80) {
    const rows = await sbTry<{ id: string; owner_email: string | null }[]>(`companies?id=in.(${uniq.slice(i, i + 80).join(',')})&select=id,owner_email`, [])
    for (const r of rows) out.set(r.id, r.owner_email)
  }
  return out
}

export async function loadWanted(now: Date): Promise<Record<'rfq' | 'renewal' | 'debit_note', FollowUpInsert[]>> {
  const today = sgtDate(now)
  const from = new Date(Date.parse(today) - RENEWAL_BEHIND_DAYS * 86_400_000).toISOString().slice(0, 10)
  const to = new Date(Date.parse(today) + RENEWAL_AHEAD_DAYS * 86_400_000).toISOString().slice(0, 10)
  const cols = 'id,company_id,insurer_name,to_email,status,thread_id,sent_at,last_inbound_at,next_chase_at'
  const dq = (sel: string) => sb<DispatchRec[]>(`placement_dispatches?status=in.(sent,acknowledged,info_requested)&select=${sel}&limit=2000`)
  // sent_by arrives with a later migration; the embeds need the foreign keys. Each step down
  // keeps the source working with less detail rather than failing the sync.
  const [dispatches, policies, notes] = await Promise.all([
    dq(`${cols},sent_by,placements(ref),placement_lines(label,product_line)`)
      .catch(() => dq(`${cols},placements(ref),placement_lines(label,product_line)`))
      .catch(() => dq(cols)),
    sb<PolicyRec[]>(`policies?lifecycle=in.(live,renewal_due)&end_date=gte.${from}&end_date=lte.${to}&select=id,company_id,policy_number,insurer,label,class_of_insurance,product_line,end_date,lifecycle&limit=2000`),
    sb<DebitNoteRec[]>(`debit_notes?status=in.(unpaid,partially_paid)&origin=neq.historical&payment_due_date=not.is.null&select=id,company_id,debit_note_no,issue_date,payment_due_date,currency,gross_amount,net_amount,paid_amount,status,origin,contacts(email,first_name,last_name)&limit=2000`),
  ])
  const owners = await companyOwners([...dispatches.map(d => d.company_id), ...policies.map(p => p.company_id ?? ''), ...notes.map(n => n.company_id)])
  const keep = <T,>(xs: (T | null)[]) => xs.filter((x): x is T => x != null)
  return {
    rfq: keep(dispatches.map(d => mapDispatch(d, owners, now))),
    renewal: keep(policies.map(p => mapPolicy(p, owners, now))),
    debit_note: keep(notes.map(n => mapDebitNote(n, owners))),
  }
}

/** Runs the sync for the three record sources. `dryRun` returns the plans without writing. */
export async function syncSources(now = new Date(), opts: { dryRun?: boolean } = {}): Promise<Record<string, { insert: number; redate: number; close: number }>> {
  const wanted = await loadWanted(now)
  const out: Record<string, { insert: number; redate: number; close: number }> = {}
  for (const kind of ['rfq', 'renewal', 'debit_note'] as const) {
    const live = await sb<Pick<FollowUp, 'id' | 'dedupe_key' | 'due_at' | 'what'>[]>(`follow_ups?source_kind=eq.${kind}&status=in.(open,snoozed)&select=id,dedupe_key,due_at,what&limit=5000`)
    const plan = planSync(wanted[kind], live)
    out[kind] = { insert: plan.insert.length, redate: plan.redate.length, close: plan.close.length }
    if (opts.dryRun) continue
    for (let i = 0; i < plan.insert.length; i += 200) {
      await sb('follow_ups?on_conflict=dedupe_key', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(plan.insert.slice(i, i + 200)) })
    }
    for (const r of plan.redate) {
      await sb(`follow_ups?id=eq.${r.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ due_at: r.due_at, what: r.what }) })
    }
    for (let i = 0; i < plan.close.length; i += 100) {
      await sb(`follow_ups?id=in.(${plan.close.slice(i, i + 100).join(',')})&status=in.(open,snoozed)`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'done', closed_at: now.toISOString(), closed_by: 'source' }),
      })
    }
  }
  return out
}

