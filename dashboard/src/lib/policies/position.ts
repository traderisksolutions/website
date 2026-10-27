/**
 * The weekly line on an EB policy: who was covered at the end of the week, what moved, what the
 * insurer billed and credited, and where the client stands since inception. Weeks run Monday to
 * Sunday in Singapore time. Nothing is prorated here — the insurer's notes are taken as issued.
 */
import { sb, sbTry } from '@/lib/crm/db'
import { listMembers, listMovements, liveEbPolicies, policyRow } from './members'
import { listTransactions } from './transactions'
import type { PolicyMember, PolicyMovement, PolicyPositionWeek, PolicyTransaction, Snapshot } from './types'

const DAY = 86_400_000
const SGT_OFFSET_MS = 8 * 3_600_000   // Singapore has no daylight saving.

const ymd = (ms: number): string => new Date(ms).toISOString().slice(0, 10)
const dayMs = (d: string): number => Date.parse(`${d}T00:00:00Z`)
const addDays = (d: string, n: number): string => ymd(dayMs(d) + n * DAY)

/**
 * The Monday (YYYY-MM-DD) of the week containing the instant, read on the Singapore calendar.
 * 23:30 SGT on a Sunday is still that week; 00:30 SGT on the Monday is the next.
 */
export function mondayOf(date: Date | string | number, tz: 'SGT' = 'SGT'): string {
  void tz
  const ms = (typeof date === 'number' ? date : new Date(date).getTime()) + SGT_OFFSET_MS
  const local = new Date(ms)
  const dow = (local.getUTCDay() + 6) % 7   // Monday = 0
  return ymd(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - dow * DAY)
}

const round2 = (n: number) => Math.round(n * 100) / 100
const inWeek = (d: string | null, start: string, end: string) => !!d && d >= start && d <= end
const txDate = (t: Pick<PolicyTransaction, 'issued_on' | 'created_at'>) => t.issued_on ?? t.created_at.slice(0, 10)

/**
 * Pure. weekStart is a Monday (YYYY-MM-DD); the week ends on the Sunday.
 *   pax_active  members active at the Sunday: joined on or before it (or with no join date, i.e.
 *               the census) and not left on or before it
 *   joins/leaves  pax of join / leave movements effective in the week (cancelled ones excluded)
 *   billed      sum of debit notes issued in the week (positive)
 *   credited    sum of credit notes issued in the week, as a positive number
 *   net_week    billed − credited
 *   net_to_date every note issued up to the Sunday, signed
 */
export function weekSnapshot(
  members: Pick<PolicyMember, 'status' | 'joined_on' | 'left_on'>[],
  movements: Pick<PolicyMovement, 'kind' | 'effective_on' | 'pax' | 'status'>[],
  transactions: Pick<PolicyTransaction, 'kind' | 'amount' | 'issued_on' | 'created_at'>[],
  weekStart: string,
): Snapshot {
  const end = addDays(weekStart, 6)
  const pax_active = members.filter(m => {
    if (m.joined_on && m.joined_on > end) return false
    if (m.status === 'left') return !!m.left_on && m.left_on > end
    return !(m.left_on && m.left_on <= end)
  }).length
  const live = movements.filter(m => m.status !== 'cancelled' && inWeek(m.effective_on, weekStart, end))
  const joins  = live.filter(m => m.kind === 'join').reduce((s, m) => s + (m.pax || 1), 0)
  const leaves = live.filter(m => m.kind === 'leave').reduce((s, m) => s + (m.pax || 1), 0)
  const week = transactions.filter(t => inWeek(txDate(t), weekStart, end))
  const billed   = round2(week.filter(t => t.kind === 'debit').reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0))
  const credited = round2(week.filter(t => t.kind === 'credit').reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0))
  const net_to_date = round2(transactions.filter(t => txDate(t) <= end).reduce((s, t) => s + (Number(t.amount) || 0), 0))
  return { week_start: weekStart, pax_active, joins, leaves, billed, credited, net_week: round2(billed - credited), net_to_date }
}

export async function listWeeks(policyId: string, limit = 60): Promise<PolicyPositionWeek[]> {
  return sbTry<PolicyPositionWeek[]>(`policy_position_weekly?policy_id=eq.${policyId}&order=week_start.desc&limit=${limit}`, [])
}

/** Computes and upserts one policy's week on (policy_id, week_start). */
export async function snapshotWeek(policyId: string, weekStart: string): Promise<Snapshot> {
  const policy = await policyRow(policyId)
  if (!policy) throw new Error('Policy not found')
  if (!policy.company_id) throw new Error('Policy has no company')
  const [members, movements, transactions] = await Promise.all([listMembers(policyId), listMovements(policyId), listTransactions(policyId)])
  const snap = weekSnapshot(members, movements, transactions, weekStart)
  await sb('policy_position_weekly?on_conflict=policy_id,week_start', {
    method: 'POST', headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ policy_id: policyId, company_id: policy.company_id, ...snap }),
  })
  return snap
}

/** Every live EB policy, for the week that ended before `now` (run on Monday: last week). */
export async function snapshotAllLive(now = new Date()): Promise<{ week_start: string; policies: number; failed: string[] }> {
  const week_start = mondayOf(now.getTime() - DAY)
  const policies = await liveEbPolicies()
  const failed: string[] = []
  for (const p of policies) {
    try { await snapshotWeek(p.id, week_start) } catch (e) { failed.push(`${p.id}: ${e instanceof Error ? e.message : String(e)}`) }
  }
  return { week_start, policies: policies.length - failed.length, failed }
}
