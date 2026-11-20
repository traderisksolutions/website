/**
 * The reads and writes behind Renewals › Pipeline, Forecast, a renewal's page and Today's Renewals
 * due (docs/renewals.md, release 2). Typed client only (src/lib/db/client.ts). No model is called.
 *
 *   loadPipeline(today)          every record (open and closed) with client, policy, next task, risk flags
 *   loadRenewal(id, today)       one record: facts, tasks, lines held and missing, the client's other policies
 *   setTaskDone(id, kind, done)  ticks or clears one task on an open record
 *   loadForecast(today)          records plus renewable policies not yet opened, as forecast items
 *   loadTasksDue(who, today)     tasks due today or before on open records, for one owner or all
 *
 * Reads are bounded: records up to 2,000; client threads only from the last 30 days; quotes only
 * for the clients on the list.
 */
import { db, rows } from '@/lib/db/client'
import { hasSuccessor, renewable, type OpenPolicy } from './open'
import { isLineCode, lineName, lineOfPolicy, type LineCode } from './lines'
import { addDays, daysBetween, expiringFrom, type NoteLike, type Stage } from './rules'
import {
  CONTACT_DAYS, crossSell, nextTask, pipeBucketOf, quotedPremium, riskFlags, sortTasks,
  type EbQuoteLike, type PipeBucket, type PlacementQuoteLike, type RiskFlag, type TaskRow,
} from './pipeline'
import type { ForecastItem } from './forecast'
import { RenewalError, renewalsToday } from './store'

const MAX = 2000
const CHUNK = 100
const chunks = <T,>(list: readonly T[]): T[][] => Array.from({ length: Math.ceil(list.length / CHUNK) }, (_, i) => list.slice(i * CHUNK, (i + 1) * CHUNK))
const uniq = (list: readonly (string | null | undefined)[]): string[] => [...new Set(list.filter((x): x is string => !!x))]
const closedAs = (o: string | null): 'renewed' | 'lost' | null => (o === 'renewed' || o === 'lost' ? o : null)
const n = (v: number | string | null | undefined): number | null => (v == null ? null : Number(v))

const RECORD = 'id, policy_id, company_id, line_code, insurer, expiry_date, opens_on, expiring_premium, expiring_commission, currency, owner, stage, outcome, loss_reason, loss_note, renewed_policy_id, created_at, updated_at, companies!renewals_company_id_fkey(company_name), policies!renewals_policy_id_fkey(policy_number, class_of_insurance, start_date)'

export type PipelineRow = {
  id: string; policy_id: string; company_id: string | null; company: string | null; policy_number: string | null; class_of_insurance: string | null
  line_code: string | null; line: string | null; insurer: string | null; expiry_date: string; opens_on: string; days: number; bucket: PipeBucket
  premium: number | null; commission: number | null; currency: string; owner: string | null; stage: Stage; outcome: 'renewed' | 'lost' | null
  next: { kind: string; due_on: string } | null; lastContact: string | null; quoted: number | null; risk: RiskFlag[]
}
export type PipelineView = { tables: true; today: string; rows: PipelineRow[] }

type RecordRow = Awaited<ReturnType<typeof readRecords>>[number]
async function readRecords(filter?: { id?: string }) {
  let q = db().from('renewals').select(RECORD)
  if (filter?.id) q = q.eq('id', filter.id)
  return rows('Renewals', q.order('expiry_date', { ascending: true }).limit(MAX))
}

async function tasksOf(ids: readonly string[]): Promise<Map<string, TaskRow[]>> {
  const by = new Map<string, TaskRow[]>()
  for (const part of chunks(ids)) {
    const list = await rows('Renewal tasks', db().from('renewal_tasks').select('renewal_id, kind, due_on, done_at, done_by').in('renewal_id', part).limit(CHUNK * 4))
    for (const t of list) by.set(t.renewal_id, [...(by.get(t.renewal_id) ?? []), t])
  }
  return by
}

/** The latest message on each client's threads in the last 30 days (either way). Older contact reads as none. */
async function recentContact(companyIds: readonly string[], today: string): Promise<Map<string, string>> {
  const since = addDays(today, -CONTACT_DAYS)
  const by = new Map<string, string>()
  for (const part of chunks(companyIds)) {
    const list = await rows('Renewals: client threads', db().from('email_threads').select('company_id, last_message_at')
      .in('company_id', part).gte('last_message_at', since).is('deleted_at', null).limit(2000))
    for (const t of list) if (t.company_id && t.last_message_at && (by.get(t.company_id) ?? '') < t.last_message_at) by.set(t.company_id, t.last_message_at)
  }
  return by
}

/** Quotes made since the earliest record opened, for the clients on the list. */
async function quotesFor(recs: readonly { company_id: string | null; line_code: string | null; opens_on: string; outcome: string | null }[]) {
  const open = recs.filter(r => !r.outcome && r.company_id)
  if (!open.length) return { placement: [] as PlacementQuoteLike[], eb: [] as EbQuoteLike[] }
  const since = open.map(r => r.opens_on).sort()[0]
  const companies = uniq(open.map(r => r.company_id))
  const ebCompanies = uniq(open.filter(r => r.line_code === 'eb').map(r => r.company_id))
  const placement: PlacementQuoteLike[] = []
  const eb: EbQuoteLike[] = []
  for (const part of chunks(companies)) {
    placement.push(...await rows('Renewals: placement quotes', db().from('placement_quotes').select('company_id, product_line, premium_amount, created_at, status')
      .in('company_id', part).gte('created_at', since).limit(2000)))
  }
  for (const part of chunks(ebCompanies)) {
    const list = await rows('Renewals: Employment Benefits quotations', db().from('eb_quotations').select('company_id, created_at, categories:snapshot->categories')
      .in('company_id', part).gte('created_at', since).limit(500))
    eb.push(...list.map(q => ({ company_id: q.company_id, created_at: q.created_at, categories: q.categories as unknown })))
  }
  return { placement, eb }
}

function toRow(r: RecordRow, today: string, tasks: TaskRow[], lastContact: string | null, quoted: number | null): PipelineRow {
  const days = daysBetween(today, r.expiry_date)
  const outcome = closedAs(r.outcome)
  const premium = n(r.expiring_premium)
  const next = outcome ? null : nextTask(tasks)
  return {
    id: r.id, policy_id: r.policy_id, company_id: r.company_id, company: r.companies?.company_name ?? null,
    policy_number: r.policies?.policy_number ?? null, class_of_insurance: r.policies?.class_of_insurance ?? null,
    line_code: r.line_code, line: lineName(r.line_code), insurer: r.insurer, expiry_date: r.expiry_date, opens_on: r.opens_on, days,
    bucket: pipeBucketOf({ outcome, days }), premium, commission: n(r.expiring_commission), currency: r.currency || 'SGD', owner: r.owner,
    stage: r.stage as Stage, outcome, next: next ? { kind: next.kind, due_on: next.due_on } : null, lastContact, quoted,
    risk: riskFlags({ outcome, stage: r.stage, days, lastContact, premium, quoted }, today),
  }
}

export async function loadPipeline(today = renewalsToday()): Promise<PipelineView> {
  const recs = await readRecords()
  const [tasks, contact, quotes] = await Promise.all([
    tasksOf(recs.map(r => r.id)),
    recentContact(uniq(recs.filter(r => !r.outcome).map(r => r.company_id)), today),
    quotesFor(recs),
  ])
  return {
    tables: true, today,
    rows: recs.map(r => toRow(r, today, tasks.get(r.id) ?? [], r.company_id ? contact.get(r.company_id) ?? null : null,
      r.outcome ? null : quotedPremium(r, quotes.placement, quotes.eb))),
  }
}

// ── One record ───────────────────────────────────────────────────────────────────────────────────

export type ClientPolicy = { id: string; policy_number: string | null; insurer: string | null; class_of_insurance: string | null; start_date: string | null; end_date: string | null; lifecycle: string }
export type RenewalDetail = PipelineRow & {
  loss_reason: string | null; loss_note: string | null; renewed_policy_id: string | null; start_date: string | null
  tasks: (TaskRow & { overdue: boolean })[]
  held: LineCode[]; missing: LineCode[]
  /** The client's other policies, newest end first: the choices for Close as Renewed. */
  policies: ClientPolicy[]
}

const LIVE = ['bound', 'live', 'renewal_due']

export async function loadRenewal(id: string, today = renewalsToday()): Promise<RenewalDetail | null> {
  const [r] = await readRecords({ id })
  if (!r) return null
  const [tasks, contact, quotes, policies] = await Promise.all([
    tasksOf([r.id]),
    r.company_id && !r.outcome ? recentContact([r.company_id], today) : Promise.resolve(new Map<string, string>()),
    quotesFor([r]),
    r.company_id
      ? rows('Renewal: client policies', db().from('policies').select('id, policy_number, insurer, class_of_insurance, product_line, is_eb, line_code, start_date, end_date, lifecycle')
        .eq('company_id', r.company_id).order('end_date', { ascending: false, nullsFirst: false }).limit(300))
      : Promise.resolve([]),
  ])
  const own = tasks.get(r.id) ?? []
  const row = toRow(r, today, own, r.company_id ? contact.get(r.company_id) ?? null : null, r.outcome ? null : quotedPremium(r, quotes.placement, quotes.eb))
  const lines = crossSell(policies.filter(p => LIVE.includes(p.lifecycle) && (!p.end_date || p.end_date >= today))
    .map(p => (isLineCode(p.line_code) ? p.line_code : lineOfPolicy(p))))
  return {
    ...row, loss_reason: r.loss_reason, loss_note: r.loss_note, renewed_policy_id: r.renewed_policy_id, start_date: r.policies?.start_date ?? null,
    tasks: sortTasks(own).map(t => ({ ...t, overdue: !t.done_at && t.due_on < today })),
    held: lines.held, missing: lines.missing,
    policies: policies.filter(p => p.id !== r.policy_id).map(p => ({ id: p.id, policy_number: p.policy_number, insurer: p.insurer, class_of_insurance: p.class_of_insurance, start_date: p.start_date, end_date: p.end_date, lifecycle: p.lifecycle })),
  }
}

const KINDS = new Set(['-90', '-60', '-30', '-15'])

/** Ticks (done) or clears one task. A closed record's tasks do not change. */
export async function setTaskDone(id: string, kind: unknown, done: unknown, actor: string): Promise<{ kind: string; done_at: string | null }> {
  if (typeof kind !== 'string' || !KINDS.has(kind)) throw new RenewalError('Choose the task.')
  if (typeof done !== 'boolean') throw new RenewalError('Say whether the task is done.')
  const [r] = await rows('Renewal', db().from('renewals').select('id, outcome').eq('id', id).limit(1))
  if (!r) throw new RenewalError('This renewal is no longer on the list.', 404)
  if (r.outcome) throw new RenewalError('This renewal is closed.', 409)
  const done_at = done ? new Date().toISOString() : null
  const saved = await rows('Renewal task', db().from('renewal_tasks').update({ done_at, done_by: done ? actor : null }).eq('renewal_id', id).eq('kind', kind).select('kind, done_at'))
  if (!saved.length) throw new RenewalError('This task is not on the renewal.', 404)
  return saved[0]
}

// ── Forecast ─────────────────────────────────────────────────────────────────────────────────────

const NOTE_COLS = 'id, policy_id, issue_date, event_type, gross_amount, commission, currency, reverses_debit_note_id, created_at'

/** Every record, plus every renewable policy expiring in the window that has no record yet and no next term on the register. */
export async function loadForecast(today = renewalsToday()): Promise<{ today: string; items: ForecastItem[]; owners: string[]; notOpened: number }> {
  const to = addDays(today, 400)
  const [recs, policies] = await Promise.all([
    rows('Forecast: renewals', db().from('renewals').select('policy_id, line_code, expiry_date, expiring_premium, expiring_commission, owner, outcome').limit(MAX)),
    rows('Forecast: policies', db().from('policies')
      .select('id, company_id, class_of_insurance, product_line, description, policy_number, start_date, end_date, lifecycle, is_eb, line_code, companies!policies_company_id_fkey(kind, owner_email)')
      .in('lifecycle', LIVE).lte('end_date', to).limit(MAX)),
  ])
  const have = new Set(recs.map(r => r.policy_id))
  const month0 = `${today.slice(0, 7)}-01`
  const waiting = policies.filter(p => p.end_date && p.end_date >= month0 && !have.has(p.id) && renewable(p as OpenPolicy) && !hasSuccessor(p as OpenPolicy, policies as OpenPolicy[]))
  const notes = new Map<string, NoteLike[]>()
  for (const part of chunks(waiting.map(p => p.id))) {
    const list = await rows('Forecast: debit notes', db().from('debit_notes').select(NOTE_COLS).in('policy_id', part)
      .or('event_type.in.(new_business,renewal),reverses_debit_note_id.not.is.null').limit(2000))
    for (const d of list) if (d.policy_id) notes.set(d.policy_id, [...(notes.get(d.policy_id) ?? []), d as NoteLike])
  }
  const items: ForecastItem[] = [
    ...recs.map(r => ({ expiry: r.expiry_date, premium: n(r.expiring_premium), commission: n(r.expiring_commission),
      outcome: closedAs(r.outcome), line_code: r.line_code, owner: r.owner })),
    ...waiting.map(p => {
      const exp = expiringFrom(notes.get(p.id) ?? [])
      return { expiry: p.end_date!, premium: exp?.premium ?? null, commission: exp?.commission ?? null, outcome: null,
        line_code: isLineCode(p.line_code) ? p.line_code : lineOfPolicy(p), owner: p.companies?.owner_email ? p.companies.owner_email.toLowerCase() : null }
    }),
  ]
  return { today, items, owners: uniq(items.map(i => i.owner)).sort(), notOpened: waiting.length }
}

// ── Today ────────────────────────────────────────────────────────────────────────────────────────

export type DueTask = { renewal_id: string; kind: string; due_on: string; company_id: string | null; company: string | null; line: string | null; expiry_date: string; owner: string | null }

/** Tasks due today or before, not done, on open records; `who` an owner's email, or 'all'. */
export async function loadTasksDue(who: string, today = renewalsToday()): Promise<DueTask[]> {
  const due = await rows('Renewal tasks due', db().from('renewal_tasks').select('renewal_id, kind, due_on').is('done_at', null).lte('due_on', today).order('due_on').limit(500))
  if (!due.length) return []
  const recs = new Map<string, { company_id: string | null; company: string | null; line_code: string | null; expiry_date: string; owner: string | null }>()
  for (const part of chunks(uniq(due.map(t => t.renewal_id)))) {
    let q = db().from('renewals').select('id, company_id, line_code, expiry_date, owner, companies!renewals_company_id_fkey(company_name)').in('id', part).is('outcome', null)
    if (who !== 'all') q = q.eq('owner', who.toLowerCase())
    for (const r of await rows('Renewals for tasks due', q.limit(CHUNK))) recs.set(r.id, { company_id: r.company_id, company: r.companies?.company_name ?? null, line_code: r.line_code, expiry_date: r.expiry_date, owner: r.owner })
  }
  return due.filter(t => recs.has(t.renewal_id)).map(t => {
    const r = recs.get(t.renewal_id)!
    return { renewal_id: t.renewal_id, kind: t.kind, due_on: t.due_on, company_id: r.company_id, company: r.company, line: lineName(r.line_code), expiry_date: r.expiry_date, owner: r.owner }
  })
}
