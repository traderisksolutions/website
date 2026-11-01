/**
 * The daily sweeps: chaser and renewals (member-movement chases stay on /api/cron/placement-chase). Each decides with a pure rule (tested) and hands the
 * draft to the drafter through the queue. Idempotency keys carry the date bucket, so a sweep run
 * twice in a day, or a day missed, never doubles a chase.
 */
import { sb, sbTry, enc } from '@/lib/crm/db'
import { enqueue, skip, type AgentTask, type NewTask } from '@/lib/agent-tasks/queue'
import { looksLikeEndorsement } from '@/lib/policies/endorsement'
import { addDays, daysBetween, workingDaysBetween } from './dates'
import { itemEvent } from './data'

type Row = Record<string, any>

export const CHASE_AFTER_WORKING_DAYS = 5
export const STALL_AFTER_DAYS = 7
export const RENEWAL_BANDS = [60, 30, 14] as const

export type ChaseDecision = { chase: 'chase_insurer' | 'chase_client' | null; stall: boolean; round: number }

/**
 * Pure. Waiting more than 5 working days earns a chase; one per 5-working-day round, so the
 * idempotency key moves on only when another round has passed. A TRS move owed for more than 7
 * days marks the item stalled.
 */
export function chaseDecision(i: { status: string; waiting_since: string | null; last_activity_at: string | null; snoozed_until: string | null; closed_at: string | null }, today: string): ChaseDecision {
  const none: ChaseDecision = { chase: null, stall: false, round: 0 }
  if (i.closed_at || i.status === 'done') return none
  if (i.snoozed_until && i.snoozed_until > today) return none
  if (i.status === 'waiting_insurer' || i.status === 'waiting_client') {
    if (!i.waiting_since) return none
    const wd = workingDaysBetween(i.waiting_since, today)
    if (wd <= CHASE_AFTER_WORKING_DAYS) return none
    return { chase: i.status === 'waiting_insurer' ? 'chase_insurer' : 'chase_client', stall: false, round: Math.floor((wd - 1) / CHASE_AFTER_WORKING_DAYS) }
  }
  if (i.status === 'trs_to_act') {
    const since = i.last_activity_at ?? i.waiting_since
    return { chase: null, stall: !!since && daysBetween(since, today) > STALL_AFTER_DAYS, round: 0 }
  }
  return none
}

/** Pure. The renewal band a policy is in today: the smallest band its expiry falls inside. */
export function renewalBand(endDate: string | null, today: string): number | null {
  if (!endDate) return null
  const d = daysBetween(today, endDate)
  if (d < 0) return null
  for (const b of [...RENEWAL_BANDS].sort((a, b) => a - b)) if (d <= b) return b
  return null
}

export async function handleChaser(task: AgentTask): Promise<Record<string, unknown> | 'handled'> {
  const today = (task.payload?.today as string) ?? new Date().toISOString().slice(0, 10)
  if (task.kind !== 'sweep') { await skip(task.id, `unknown kind ${task.kind}`); return 'handled' }
  const items = await sbTry<Row[]>('work_items?closed_at=is.null&select=id,company_id,status,waiting_since,last_activity_at,snoozed_until,closed_at&limit=1000', [])
  const tasks: NewTask[] = []
  let stalled = 0
  for (const i of items) {
    const d = chaseDecision(i as Parameters<typeof chaseDecision>[0], today)
    if (d.stall) {
      await sb(`work_items?id=eq.${enc(i.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'stalled', updated_at: new Date().toISOString() }) })
      await itemEvent(i.id, 'status', 'chaser', { status: 'stalled', basis: `no TRS move for more than ${STALL_AFTER_DAYS} days` })
      stalled++
    }
    if (d.chase) tasks.push({ agent: 'drafter', kind: d.chase, work_item_id: i.id, company_id: i.company_id, idem_key: `drafter:${d.chase}:${i.id}:${i.waiting_since}:${d.round}`, created_by_agent: 'chaser' })
  }
  await enqueue(tasks)
  return { chases: tasks.length, stalled }
}

export async function handleRenewals(task: AgentTask): Promise<Record<string, unknown> | 'handled'> {
  if (task.kind !== 'sweep') { await skip(task.id, `unknown kind ${task.kind}`); return 'handled' }
  const today = (task.payload?.today as string) ?? new Date().toISOString().slice(0, 10)
  const max = Math.max(...RENEWAL_BANDS)
  const policies = await sbTry<Row[]>(`policies?end_date=gte.${today}&end_date=lte.${addDays(today, max)}&company_id=not.is.null&select=id,company_id,policy_number,insurer,class_of_insurance,product_line,end_date,lifecycle,description,companies(company_name,kind)&limit=1000`, [])
  const open = await sbTry<Row[]>('work_items?case_type=eq.renewal&closed_at=is.null&select=policy_id,policy_number,company_id', [])
  const covered = new Set(open.flatMap(o => [o.policy_id, o.policy_number && `${o.company_id}:${o.policy_number}`]).filter(Boolean))
  let opened = 0
  const tasks: NewTask[] = []
  for (const p of policies) {
    if (looksLikeEndorsement(p) || (p.lifecycle && !['bound', 'live', 'renewal_due'].includes(p.lifecycle))) continue
    if (p.companies?.kind && p.companies.kind !== 'client') continue
    const band = renewalBand(p.end_date, today)
    if (!band) continue
    // One notice per renewal: drafted when the item opens. Later bands only raise its rank on /work by deadline.
    let itemId: string | null = null
    if (!covered.has(p.id) && !covered.has(`${p.company_id}:${p.policy_number}`)) {
      const [item] = await sb<Row[]>('work_items', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          company_id: p.company_id, client_name: p.companies?.company_name ?? null, case_type: 'renewal',
          title: `Renewal: ${p.class_of_insurance ?? p.product_line ?? 'policy'}${p.policy_number ? ` ${p.policy_number}` : ''}`.slice(0, 140),
          status: 'trs_to_act', deadline: p.end_date, deadline_basis: 'policy expiry', insurer_name: p.insurer, policy_id: p.id,
          policy_number: p.policy_number, next_action: 'Ask the client for renewal changes, then request terms', source: 'renewals', confidence: 'high',
        }),
      })
      itemId = item.id
      covered.add(p.id)
      await itemEvent(item.id, 'note', 'renewals', { opened: `${band}-day band`, expiry: p.end_date })
      opened++
    }
    if (itemId) tasks.push({ agent: 'drafter', kind: 'renewal_notice', work_item_id: itemId, company_id: p.company_id, policy_id: p.id, payload: { expiry: p.end_date }, idem_key: `drafter:renewal_notice:${p.id}:${p.end_date}`, created_by_agent: 'renewals' })
  }
  await enqueue(tasks)
  return { policies: policies.length, opened, notices: tasks.length }
}

/** The tasks the daily sweep starts. Keys carry the day, so a second run the same day is a no-op. */
export function dailySweepTasks(today: string): NewTask[] {
  return [
    { agent: 'renewals', kind: 'sweep', payload: { today }, idem_key: `renewals:sweep:${today}`, created_by_agent: 'system' },
    { agent: 'chaser', kind: 'sweep', payload: { today }, idem_key: `chaser:sweep:${today}`, created_by_agent: 'system' },
    { agent: 'claims', kind: 'sync', payload: { today }, idem_key: `claims:sync:${today}`, created_by_agent: 'system' },
  ]
}
