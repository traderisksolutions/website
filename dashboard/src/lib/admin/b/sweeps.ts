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
import { laterActive, laterDue, clearLater } from './later'
import { adviceTask, rfqCheckTask, handleAdvice, handleRfqCheck, RFQ_DAYS } from './renewals/advice-agent'

type Row = Record<string, any>

export const CHASE_AFTER_WORKING_DAYS = 5
/** A client is chased after a calendar week; Nathan's own cadence is 7 to 14 days. */
export const CHASE_CLIENT_AFTER_DAYS = 7
/** Inside the last week before a deadline, every two days. */
export const NEAR_DEADLINE_DAYS = 7
export const NEAR_DEADLINE_EVERY = 2
/** Five days out the chase asks for the answer today. */
export const URGENT_DAYS = 5
/** After three chases the matter goes to a person: the fourth email does not work, a call does. */
export const MAX_CHASES = 3
export const STALL_AFTER_DAYS = 7
export const RENEWAL_BANDS = [60, 30, 14] as const

export type ChaseDecision = {
  chase: 'chase_insurer' | 'chase_client' | null
  stall: boolean
  round: number
  /** Deadline within URGENT_DAYS: the chase asks for the answer today. */
  urgent: boolean
  /** Three chases sent and still waiting: hand to a person for a call. */
  escalate: boolean
}

export type ChaseItem = {
  status: string; waiting_since: string | null; last_activity_at: string | null; snoozed_until: string | null; closed_at: string | null
  later_until?: string | null; later_when?: string | null; deadline?: string | null
}

/**
 * Pure. Cadence by party and by distance from the deadline, as Nathan keeps it: an insurer is
 * chased after 5 working days, a client after 7 calendar days, one chase per round; inside the
 * last week before a deadline every 2 days, and inside the last 5 days the chase asks for the
 * answer today. After three chases the item is handed to a person rather than chased a fourth
 * time. A TRS move owed for more than 7 days marks the item stalled.
 */
export function chaseDecision(i: ChaseItem, today: string): ChaseDecision {
  const none: ChaseDecision = { chase: null, stall: false, round: 0, urgent: false, escalate: false }
  if (i.closed_at || i.status === 'done') return none
  if (i.snoozed_until && i.snoozed_until > today) return none
  // Set aside by a person ("come back later"): neither chased nor marked stalled meanwhile.
  if (laterActive(i, `${today}T23:59:59.999Z`)) return none
  if (i.status === 'waiting_insurer' || i.status === 'waiting_client') {
    if (!i.waiting_since) return none
    const toDeadline = i.deadline ? daysBetween(today, i.deadline) : null
    const near = toDeadline !== null && toDeadline <= NEAR_DEADLINE_DAYS
    const urgent = toDeadline !== null && toDeadline <= URGENT_DAYS
    let round = 0
    if (near) {
      const d = daysBetween(i.waiting_since, today)
      round = d < NEAR_DEADLINE_EVERY ? 0 : Math.floor(d / NEAR_DEADLINE_EVERY)
    } else if (i.status === 'waiting_insurer') {
      const wd = workingDaysBetween(i.waiting_since, today)
      round = wd <= CHASE_AFTER_WORKING_DAYS ? 0 : Math.floor((wd - 1) / CHASE_AFTER_WORKING_DAYS)
    } else {
      const d = daysBetween(i.waiting_since, today)
      round = d < CHASE_CLIENT_AFTER_DAYS ? 0 : Math.floor(d / CHASE_CLIENT_AFTER_DAYS)
    }
    if (round === 0) return none
    if (round > MAX_CHASES) return { ...none, round, urgent, escalate: true }
    return { chase: i.status === 'waiting_insurer' ? 'chase_insurer' : 'chase_client', stall: false, round, urgent, escalate: false }
  }
  if (i.status === 'trs_to_act') {
    const since = i.last_activity_at ?? i.waiting_since
    return { ...none, stall: !!since && daysBetween(since, today) > STALL_AFTER_DAYS }
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
  const items = await sbTry<Row[]>('work_items?closed_at=is.null&select=id,company_id,status,waiting_since,last_activity_at,snoozed_until,closed_at,later_until,later_when,deadline,needs_human,next_action,insurer_name&limit=1000', [])
  const tasks: NewTask[] = []
  let stalled = 0, released = 0, escalated = 0
  const now = new Date().toISOString()
  for (const i of items) {
    // A timed "come back later" that has run out puts the item back on the queue.
    if (laterDue(i, now)) { await clearLater(i.id, 'time reached', 'chaser'); i.later_until = null; released++ }
    const d = chaseDecision(i as ChaseItem, today)
    if (d.escalate && !i.needs_human) {
      // The fourth chase is a call. The item moves to Decide with the ask spelled out.
      const who = i.status === 'waiting_insurer' ? (i.insurer_name ? `${i.insurer_name}` : 'the insurer') : 'the client'
      await sb(`work_items?id=eq.${enc(i.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ needs_human: `No reply from ${who} after ${MAX_CHASES} chases. Call them.`, updated_at: new Date().toISOString() }) })
      await itemEvent(i.id, 'note', 'chaser', { escalated: true, chases: MAX_CHASES, waiting_since: i.waiting_since })
      escalated++
    }
    if (d.stall) {
      await sb(`work_items?id=eq.${enc(i.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'stalled', updated_at: new Date().toISOString() }) })
      await itemEvent(i.id, 'status', 'chaser', { status: 'stalled', basis: `no TRS move for more than ${STALL_AFTER_DAYS} days` })
      stalled++
    }
    if (d.chase) tasks.push({ agent: 'drafter', kind: d.chase, work_item_id: i.id, company_id: i.company_id, payload: { round: d.round, urgent: d.urgent, deadline: i.deadline ?? null }, idem_key: `drafter:${d.chase}:${i.id}:${i.waiting_since}:${d.round}`, created_by_agent: 'chaser' })
  }
  await enqueue(tasks)
  return { chases: tasks.length, stalled, released, escalated }
}

export async function handleRenewals(task: AgentTask): Promise<Record<string, unknown> | 'handled'> {
  // The report at 60 days and the quote check at 30 days are the agent's other two jobs (renewals/advice-agent.ts).
  if (task.kind === 'advice') return handleAdvice(task)
  if (task.kind === 'rfq_check') return handleRfqCheck(task)
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
    // One report per renewal, from the first band the policy is seen in; one quote check inside 30 days.
    tasks.push(adviceTask(p.id, p.company_id, p.end_date))
    if (band <= RFQ_DAYS) tasks.push(rfqCheckTask(p.id, p.company_id, p.end_date))
  }
  await enqueue(tasks)
  return { policies: policies.length, opened, tasks: tasks.length }
}

/** The tasks the daily sweep starts. Keys carry the day, so a second run the same day is a no-op. */
export function dailySweepTasks(today: string): NewTask[] {
  return [
    { agent: 'renewals', kind: 'sweep', payload: { today }, idem_key: `renewals:sweep:${today}`, created_by_agent: 'system' },
    { agent: 'chaser', kind: 'sweep', payload: { today }, idem_key: `chaser:sweep:${today}`, created_by_agent: 'system' },
    { agent: 'claims', kind: 'sync', payload: { today }, idem_key: `claims:sync:${today}`, created_by_agent: 'system' },
  ]
}
