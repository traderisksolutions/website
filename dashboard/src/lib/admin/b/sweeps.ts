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
import { adviceTask, rfqCheckTask, handleAdvice, handleRfqCheck, RFQ_DAYS, ADVICE_DAYS } from './renewals/advice-agent'
import { CHASE_AFTER_WORKING_DAYS, CHASE_CLIENT_AFTER_DAYS, NEAR_DEADLINE_DAYS, NEAR_DEADLINE_EVERY, URGENT_DAYS, MAX_CHASES, DOCUMENT_CHASE_DAYS } from './cadence'
import { runChases as runPlacementChases } from '@/lib/placement/workflow'
import { runMovementChases } from '@/lib/policies/movement-flow'
import { chaseBatches } from './endorsements/sync'
import { openRegisters, markRequested, syncRegister } from './documents/store'
import { DOC_LABEL } from './documents/gate'
import { loadCaseData } from './data'
import { detectLine } from './relay/intent'
import { familyOf } from '@/lib/placement/lines'
import { DAY_MARKS, OPEN_DAYS, TERMS_DAYS, UPDATE_DAYS, DECISION_DAYS, dayMark, priceCheck, flowAction } from '@/lib/cases/renewal'
import { stageIndex, isStage } from '@/lib/cases/stage'
import { getRenewalPack } from '@/lib/policies/ledger'
import { syncAllStages } from '@/lib/cases/sync'
import { renewalMethod, lineKey } from '@/lib/methods/method'
import { runFollowups } from '@/lib/followups/monitor'

const NO_RENEWAL = new Set(['car', 'bond'])

type Row = Record<string, any>

export { CHASE_AFTER_WORKING_DAYS, CHASE_CLIENT_AFTER_DAYS, NEAR_DEADLINE_DAYS, NEAR_DEADLINE_EVERY, URGENT_DAYS, MAX_CHASES, DOCUMENT_CHASE_DAYS } from './cadence'
export const STALL_AFTER_DAYS = 7
/** Renewal day marks, counted back from the policy end date (src/lib/cases/renewal.ts). */
export const RENEWAL_BANDS = DAY_MARKS
/** Financial lines: the proposal form goes with the 90-day data request; insurers give no terms without it. */
export const FORM_DAYS = OPEN_DAYS
/** Employee benefits: the claims experience is asked at 90 days, with the data request. */
export const CLAIMS_REPORT_DAYS = OPEN_DAYS
/** With no terms from the insurer by 30 days out, a person asks for them; two policies lapsed waiting for a notice. */
export const NOTICE_DAYS = UPDATE_DAYS

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

/** Pure. The renewal day mark a policy has reached today (90, 45, 30 or 15), or null outside 90 days. */
export function renewalBand(endDate: string | null, today: string): number | null {
  if (!endDate) return null
  return dayMark(daysBetween(today, endDate))
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
  // The document register: items still waiting on the client for a signed form, slip or letter.
  const open = new Map(items.map(i => [i.id, i]))
  let documentChases = 0
  for (const r of await openRegisters()) {
    const i = open.get(r.work_item_id)
    if (!i || (i.snoozed_until && i.snoozed_until > today) || laterActive(i, `${today}T23:59:59.999Z`)) continue
    // Never asked: the ask goes now (round 1). Asked: every 6 days after.
    const since = (r.requested ?? '').slice(0, 10)
    const d = since ? daysBetween(since, today) : DOCUMENT_CHASE_DAYS
    if (d < DOCUMENT_CHASE_DAYS) continue
    const round = since ? Math.floor(d / DOCUMENT_CHASE_DAYS) + 1 : 1
    if (round > MAX_CHASES) {
      if (!i.needs_human) {
        await sb(`work_items?id=eq.${enc(i.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ needs_human: `Documents still outstanding after ${MAX_CHASES} chases: ${r.kinds.map(k => DOC_LABEL[k]).join('; ')}. Call the client.`, updated_at: new Date().toISOString() }) })
        escalated++
      }
      continue
    }
    tasks.push({ agent: 'drafter', kind: 'request_documents', work_item_id: i.id, company_id: i.company_id, payload: { items: r.kinds.map(k => DOC_LABEL[k]), round }, idem_key: `drafter:request_documents:${i.id}:${since}:${round}`, created_by_agent: 'chaser' })
    await markRequested(i.id, r.kinds)
    documentChases++
  }
  await enqueue(tasks)
  // The other open records with a party to chase, on the same table: quotation requests to
  // insurers, member movements awaiting the insurer's note, endorsement batches.
  const nowDate = new Date()
  const placements = await runPlacementChases(nowDate).catch(e => { console.error('[chaser] placements', e instanceof Error ? e.message : e); return { drafted: 0, skipped: 0 } })
  const movements = await runMovementChases(nowDate).catch(e => { console.error('[chaser] movements', e instanceof Error ? e.message : e); return { drafted: 0, skipped: 0 } })
  const batches = await chaseBatches(nowDate).catch(e => { console.error('[chaser] batches', e instanceof Error ? e.message : e); return 0 })
  // Every email TRS sent that waits on a reply: registered, replies marked, chases drafted when due.
  const followups = await runFollowups(nowDate).catch(e => { console.error('[chaser] followups', e instanceof Error ? e.message : e); return null })
  return { chases: tasks.length - documentChases, documentChases, stalled, released, escalated, placements: placements.drafted, movements: movements.drafted, batches, followups }
}

export async function handleRenewals(task: AgentTask): Promise<Record<string, unknown> | 'handled'> {
  // The renewal update at 30 days and the terms check at 45 days are the agent's other two jobs (renewals/advice-agent.ts).
  if (task.kind === 'advice') return handleAdvice(task)
  if (task.kind === 'rfq_check') return handleRfqCheck(task)
  if (task.kind !== 'sweep') { await skip(task.id, `unknown kind ${task.kind}`); return 'handled' }
  const today = (task.payload?.today as string) ?? new Date().toISOString().slice(0, 10)
  const policies = await sbTry<Row[]>(`policies?end_date=gte.${today}&end_date=lte.${addDays(today, OPEN_DAYS)}&company_id=not.is.null&select=id,company_id,policy_number,insurer,class_of_insurance,product_line,end_date,lifecycle,description,companies(company_name,kind)&limit=1000`, [])
  const open = await sbTry<Row[]>('work_items?case_type=eq.renewal&closed_at=is.null&select=id,policy_id,policy_number,company_id', [])
  const covered = new Set(open.flatMap(o => [o.policy_id, o.policy_number && `${o.company_id}:${o.policy_number}`]).filter(Boolean))
  let opened = 0
  const tasks: NewTask[] = []
  // The method admins edit on /methods/renewal, read fresh for this run.
  const method = await renewalMethod()
  for (const p of policies) {
    if (looksLikeEndorsement(p) || (p.lifecycle && !['bound', 'live', 'renewal_due'].includes(p.lifecycle))) continue
    if (p.companies?.kind && p.companies.kind !== 'client') continue
    // Project covers end with the project: construction all risks and bonds are extended on request, never renewed.
    if (NO_RENEWAL.has(lineKey(`${p.class_of_insurance ?? ''} ${p.product_line ?? ''} ${p.description ?? ''}`) ?? '')) continue
    const left = daysBetween(today, p.end_date)
    const mark = dayMark(left)
    if (!mark) continue
    // 90 days: the case opens from TRS's own register, whatever the insurer has or has not sent.
    let itemId: string | null = open.find(o => o.policy_id === p.id)?.id ?? null
    if (!covered.has(p.id) && !covered.has(`${p.company_id}:${p.policy_number}`)) {
      // The price check reads the expiring year: claims against premium, heads and endorsements.
      const pack = await getRenewalPack(p.id, today).catch(() => null)
      const check = priceCheck(pack?.current ?? null, method, { client: p.companies?.company_name ?? null, insurer: p.insurer ?? null, line: `${p.class_of_insurance ?? ''} ${p.product_line ?? ''}` })
      const [item] = await sb<Row[]>('work_items', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          company_id: p.company_id, client_name: p.companies?.company_name ?? null, case_type: 'renewal',
          title: `Renewal: ${p.class_of_insurance ?? p.product_line ?? 'policy'}${p.policy_number ? ` ${p.policy_number}` : ''}`.slice(0, 140),
          status: 'trs_to_act', deadline: p.end_date, deadline_basis: 'policy end date', insurer_name: p.insurer, policy_id: p.id,
          policy_number: p.policy_number, next_action: flowAction(check.flow, p.insurer), source: 'renewals', confidence: 'high',
        }),
      })
      itemId = item.id
      covered.add(p.id)
      // Stage, start point and flow are written apart: until the case-stage migration is applied they are skipped, not fatal.
      await sbTry(`work_items?id=eq.${enc(item.id)}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ stage: 'request', stage_at: new Date().toISOString(), start_point: 'renewal', renewal_flow: check.flow }) })
      await itemEvent(item.id, 'note', 'renewals', { opened: `${mark}-day mark`, end_date: p.end_date, flow: check.flow, basis: check.basis, rules: check.rules, method_version: method.version })
      opened++
      // The data request, pre-filled from last year (headcount, wages, turnover, sum insured).
      tasks.push({ agent: 'drafter', kind: 'renewal_notice', work_item_id: item.id, company_id: p.company_id, policy_id: p.id, payload: { expiry: p.end_date, flow: check.flow }, idem_key: `drafter:renewal_notice:${p.id}:${p.end_date}`, created_by_agent: 'renewals' })
    }
    if (!itemId) continue
    const family = familyOf(detectLine(`${p.class_of_insurance ?? ''} ${p.product_line ?? ''} ${p.description ?? ''}`, null))
    if (family === 'eb' && left <= CLAIMS_REPORT_DAYS) tasks.push({ agent: 'drafter', kind: 'request_claims_report', work_item_id: itemId, company_id: p.company_id, policy_id: p.id, payload: { expiry: p.end_date }, idem_key: `drafter:request_claims_report:${p.id}:${p.end_date}`, created_by_agent: 'renewals' })
    if (family === 'financial' && left <= FORM_DAYS) {
      // The register takes the proposal form from here; the chaser asks for it on the next sweep.
      const d = await loadCaseData(itemId)
      if (d) await syncRegister(d, { caseType: 'renewal', line: detectLine(`${p.class_of_insurance ?? ''} ${p.product_line ?? ''}`, null), today, expiry: p.end_date }).catch(() => null)
    }
    // 45 days: terms due. 30 days: the renewal update to the client. One task each per renewal.
    if (left <= RFQ_DAYS) tasks.push(rfqCheckTask(p.id, p.company_id, p.end_date))
    if (left <= ADVICE_DAYS) tasks.push(adviceTask(p.id, p.company_id, p.end_date))
  }
  await enqueue(tasks)
  // 30 days with nothing from the insurer: a person asks for terms.
  let noNotice = 0
  for (const o of await sbTry<Row[]>(`work_items?case_type=eq.renewal&closed_at=is.null&needs_human=is.null&deadline=lte.${addDays(today, NOTICE_DAYS)}&deadline=gte.${today}&select=id,insurer_name,work_item_threads(side)`, [])) {
    const insurerSide = (o.work_item_threads ?? []).some((t: Row) => t.side === 'insurer')
    if (insurerSide) continue
    await sb(`work_items?id=eq.${enc(o.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ needs_human: `No renewal terms from ${o.insurer_name ?? 'the insurer'} with ${NOTICE_DAYS} days to the end date. Ask them for terms; do not wait for the notice.`, updated_at: new Date().toISOString() }) })
    await itemEvent(o.id, 'note', 'renewals', { no_notice: true, days: NOTICE_DAYS })
    noNotice++
  }
  // 15 days: no decision from the client yet. A person calls; the bind instruction follows the decision.
  let noDecision = 0
  for (const o of await sbTry<Row[]>(`work_items?case_type=eq.renewal&closed_at=is.null&needs_human=is.null&deadline=lte.${addDays(today, DECISION_DAYS)}&deadline=gte.${today}&select=id,client_name,stage`, [])) {
    if (isStage(o.stage) && stageIndex(o.stage) >= stageIndex('bind')) continue
    await sb(`work_items?id=eq.${enc(o.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ needs_human: `Renewal ends within ${DECISION_DAYS} days and ${o.client_name ?? 'the client'} has not decided. Call them for the decision.`, updated_at: new Date().toISOString() }) })
    await itemEvent(o.id, 'note', 'renewals', { no_decision: true, days: DECISION_DAYS })
    noDecision++
  }
  // Every open quote case's stage, recomputed from its records.
  const stages = await syncAllStages().catch(() => 0)
  return { policies: policies.length, opened, tasks: tasks.length, noNotice, noDecision, stages, marks: [OPEN_DAYS, TERMS_DAYS, UPDATE_DAYS, DECISION_DAYS] }
}

/** The tasks the daily sweep starts. Keys carry the day, so a second run the same day is a no-op. */
export function dailySweepTasks(today: string): NewTask[] {
  return [
    { agent: 'renewals', kind: 'sweep', payload: { today }, idem_key: `renewals:sweep:${today}`, created_by_agent: 'system' },
    { agent: 'chaser', kind: 'sweep', payload: { today }, idem_key: `chaser:sweep:${today}`, created_by_agent: 'system' },
    { agent: 'claims', kind: 'sync', payload: { today }, idem_key: `claims:sync:${today}`, created_by_agent: 'system' },
  ]
}
