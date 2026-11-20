/**
 * The reads and writes behind Renewals (docs/renewals.md). No model is called here.
 *
 *   listRenewals(filters)          the open renewal records with client, line, premium and days to expiry
 *   changeRenewal(id, change)      a person moves the stage, sets the owner or closes the record
 *   openDueRenewals(today)         opens a record (and its four tasks) for every policy whose day has come; idempotent.
 *                                  A person's button and the daily admin sweep call it.
 *   loadFix()                      the To fix lists: end dates, lines to map, policies with no placing debit note
 *   confirmEndDates / confirmLines a person's confirmations; the only writes to policies here
 *
 * Every read works before 20261120_renewals.sql is applied: the renewal tables answer { tables: false }
 * and the To fix lists read without policies.line_code.
 */
import { sb, sbTry, enc, inChunks } from '@/lib/crm/db'
import { dueToOpen, renewable, type OpenPolicy } from './open'
import { isLineCode, lineName, lineOfPolicy, spellingKey, spellingOf, type LineCode } from './lines'
import {
  bucketOf, checkChange, checkRenewedPolicy, daysBetween, expiringFrom, isBucket, isOpenStage, opensOn, suggestEndDate, tasksFor,
  type Bucket, type Change, type NoteLike, type Stage,
} from './rules'

type Row = Record<string, any>
const quiet = { Prefer: 'return=minimal' }
/** The date in Singapore, where every policy on the register ends. */
export const renewalsToday = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)

const POLICY_COLS = 'id,company_id,policy_number,insurer,class_of_insurance,product_line,description,start_date,end_date,lifecycle,status,is_eb'
const COMPANY = 'companies!policies_company_id_fkey(company_name,kind,owner_email)'
const NOTE_COLS = 'id,policy_id,issue_date,event_type,gross_amount,commission,currency,reverses_debit_note_id,created_at'
const RENEWAL_COLS = 'id,policy_id,company_id,line_code,insurer,expiry_date,opens_on,expiring_premium,expiring_commission,currency,owner,stage,outcome,created_at,updated_at'

export class RenewalError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

/** Every row a query matches, a thousand at a time (the API's cap). */
async function readAll(path: string): Promise<Row[]> {
  const out: Row[] = []
  for (let offset = 0; offset < 50_000; offset += 1000) {
    const page = await sb<Row[]>(`${path}&order=id.asc&limit=1000&offset=${offset}`)
    out.push(...page)
    if (page.length < 1000) break
  }
  return out
}

/** Whether 20261120_renewals.sql has been applied. */
export const renewalTablesReady = async (): Promise<boolean> => (await sbTry<Row[] | null>('renewals?select=id&limit=1', null)) !== null
const lineColumnReady = async (): Promise<boolean> => (await sbTry<Row[] | null>('policies?select=line_code&limit=1', null)) !== null

/** Policies with their client, and line_code when the column exists. */
type PolicyRow = OpenPolicy & {
  policy_number: string | null; insurer: string | null; start_date: string | null
  companies?: { company_name?: string | null; kind?: string | null; owner_email?: string | null } | null
}
async function readPolicies(withLine: boolean): Promise<PolicyRow[]> {
  return readAll(`policies?select=${POLICY_COLS}${withLine ? ',line_code' : ''},${COMPANY}`) as Promise<PolicyRow[]>
}

async function notesByPolicy(): Promise<Map<string, NoteLike[]>> {
  const notes = await readAll(`debit_notes?policy_id=not.is.null&select=${NOTE_COLS}`)
  const by = new Map<string, NoteLike[]>()
  for (const n of notes) by.set(n.policy_id, [...(by.get(n.policy_id) ?? []), n as NoteLike])
  return by
}

// ── Change ───────────────────────────────────────────────────────────────────────────────────────

export async function changeRenewal(id: string, change: Change): Promise<{ id: string; stage: Stage }> {
  const [r] = await sb<Row[]>(`renewals?id=eq.${enc(id)}&select=id,policy_id,company_id,stage,outcome&limit=1`)
  if (!r) throw new RenewalError('This renewal is no longer on the list.', 404)
  const checked = checkChange(r as { policy_id: string; stage: string; outcome: string | null }, change)
  if ('error' in checked) throw new RenewalError(checked.error, checked.error === 'This renewal is closed.' ? 409 : 400)
  if (checked.patch.renewed_policy_id) {
    const [n] = await sb<Row[]>(`policies?id=eq.${enc(checked.patch.renewed_policy_id)}&select=id,company_id&limit=1`)
    const wrong = checkRenewedPolicy(r as { policy_id: string; company_id: string | null }, (n as { id: string; company_id: string | null } | undefined) ?? null)
    if (wrong) throw new RenewalError(wrong, n ? 400 : 404)
  }
  const [saved] = await sb<Row[]>(`renewals?id=eq.${enc(id)}&outcome=is.null`, { method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ...checked.patch, updated_at: new Date().toISOString() }) })
  if (!saved) throw new RenewalError('This renewal is closed.', 409)
  return { id: saved.id, stage: saved.stage }
}

// ── Open ─────────────────────────────────────────────────────────────────────────────────────────

export type OpenResult = { tables: boolean; opened: number; due: number }

/**
 * Opens a record and its four tasks for every policy due. A policy that has ever had a record is
 * left alone, so a second run opens nothing; the unique index on the open record holds a race.
 */
export async function openDueRenewals(today = renewalsToday()): Promise<OpenResult> {
  const existing = await sbTry<Row[] | null>('renewals?select=policy_id&limit=10000', null)
  if (!existing) return { tables: false, opened: 0, due: 0 }
  const [policies, notes, aliases] = await Promise.all([readPolicies(await lineColumnReady()), notesByPolicy(), readAliases()])
  const due = dueToOpen(policies, new Set(existing.map(e => e.policy_id as string)), today)
  let opened = 0
  for (const p of due) {
    const exp = expiringFrom(notes.get(p.id) ?? [])
    const line = (isLineCode(p.line_code) ? p.line_code : aliases.get(spellingKey(spellingOf(p)))) ?? null
    const [made] = await sbTry<Row[]>('renewals', [], { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
      policy_id: p.id, company_id: p.company_id, line_code: line, insurer: p.insurer, expiry_date: p.end_date, opens_on: opensOn({ ...p, line_code: line }),
      expiring_premium: exp?.premium ?? null, expiring_commission: exp?.commission ?? null, currency: exp?.currency ?? 'SGD',
      owner: p.companies?.owner_email ? String(p.companies.owner_email).toLowerCase() : null, stage: 'open',
    }) })
    if (!made?.id) continue
    opened++
    await sbTry('renewal_tasks', null, { method: 'POST', headers: quiet, body: JSON.stringify(tasksFor(p.end_date!).map(t => ({ renewal_id: made.id, ...t }))) })
  }
  return { tables: true, opened, due: due.length }
}

// ── To fix ───────────────────────────────────────────────────────────────────────────────────────

async function readAliases(): Promise<Map<string, LineCode>> {
  const rows = await sbTry<Row[]>('policy_line_aliases?select=spelling,line_code&limit=5000', [])
  return new Map(rows.filter(r => isLineCode(r.line_code)).map(r => [r.spelling as string, r.line_code as LineCode]))
}

export type EndDateFix = { policy_id: string; company_id: string | null; company: string | null; policy_number: string | null; insurer: string | null; class_of_insurance: string | null
  start_date: string | null; last_note_on: string | null; suggested: string | null; basis: 'start' | 'debit_note' | null }
export type LineFix = { spelling: string; key: string; policies: number; suggested: LineCode }
export type NoNoteFix = { policy_id: string; company_id: string | null; company: string | null; policy_number: string | null; insurer: string | null; class_of_insurance: string | null; end_date: string | null }
export type FixView = { tables: boolean; endDates: EndDateFix[]; lines: LineFix[]; noNote: NoNoteFix[] }

export async function loadFix(): Promise<FixView> {
  const [tables, withLine] = await Promise.all([renewalTablesReady(), lineColumnReady()])
  const [policies, notes, aliases] = await Promise.all([readPolicies(withLine), notesByPolicy(), readAliases()])
  const live = policies.filter(renewable)
  const ident = (p: PolicyRow) => ({ policy_id: p.id, company_id: p.company_id, company: p.companies?.company_name ?? null, policy_number: p.policy_number, insurer: p.insurer, class_of_insurance: p.class_of_insurance ?? null })

  const endDates: EndDateFix[] = live.filter(p => !p.end_date).map(p => {
    const own = notes.get(p.id) ?? []
    const s = suggestEndDate(p, own)
    const last = own.map(n => n.issue_date).filter((d): d is string => !!d).sort().at(-1) ?? null
    return { ...ident(p), start_date: p.start_date, last_note_on: last, suggested: s?.end_date ?? null, basis: s?.basis ?? null }
  }).sort((a, b) => (a.company ?? '').localeCompare(b.company ?? ''))

  // Every policy on the register is mapped, quotes included, so the line is known when one binds.
  const groups = new Map<string, { spelling: string; votes: Map<LineCode, number>; count: number }>()
  for (const p of policies) {
    const spelling = spellingOf(p)
    const key = spellingKey(spelling)
    if (!key || aliases.has(key) || isLineCode(p.line_code)) continue
    const g = groups.get(key) ?? { spelling, votes: new Map(), count: 0 }
    const line = lineOfPolicy(p)
    g.votes.set(line, (g.votes.get(line) ?? 0) + 1)
    g.count++
    groups.set(key, g)
  }
  const lines: LineFix[] = [...groups.entries()].map(([key, g]) => ({
    key, spelling: g.spelling, policies: g.count, suggested: [...g.votes.entries()].sort((a, b) => b[1] - a[1])[0][0],
  })).sort((a, b) => b.policies - a.policies || a.spelling.localeCompare(b.spelling))

  const noNote: NoNoteFix[] = live.filter(p => !expiringFrom(notes.get(p.id) ?? [])).map(p => ({ ...ident(p), end_date: p.end_date }))
    .sort((a, b) => (a.end_date ?? '9999').localeCompare(b.end_date ?? '9999'))
  return { tables, endDates, lines, noNote }
}

const DAY_RX = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Writes each confirmed end date on a policy that still has none. Never overwrites a date. */
export async function confirmEndDates(items: unknown): Promise<{ written: number }> {
  const list = Array.isArray(items) ? items : []
  const clean = list.map(i => i as Row).filter(i => typeof i?.policy_id === 'string' && UUID.test(i.policy_id) && typeof i?.end_date === 'string' && DAY_RX.test(i.end_date) && !Number.isNaN(Date.parse(i.end_date)))
  if (!clean.length || clean.length !== list.length) throw new RenewalError('Choose a policy and a date (YYYY-MM-DD).')
  let written = 0
  for (const i of clean) {
    const done = await sb<Row[]>(`policies?id=eq.${enc(i.policy_id)}&end_date=is.null&select=id`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ end_date: i.end_date }) })
    written += done.length
  }
  return { written }
}

/** Saves each confirmed spelling as a line and writes the line on every policy with that spelling and no line yet, and on their open renewals. */
export async function confirmLines(items: unknown, actor: string): Promise<{ tables: boolean; spellings: number; policies: number }> {
  if (!(await renewalTablesReady()) || !(await lineColumnReady())) return { tables: false, spellings: 0, policies: 0 }
  const list = Array.isArray(items) ? items : []
  const clean = list.map(i => i as Row).filter(i => typeof i?.spelling === 'string' && spellingKey(i.spelling) && isLineCode(i.line_code))
  if (!clean.length || clean.length !== list.length) throw new RenewalError('Choose a line for each spelling.')
  const wanted = new Map(clean.map(i => [spellingKey(i.spelling), i.line_code as LineCode]))
  const now = new Date().toISOString()
  await sb('policy_line_aliases?on_conflict=spelling', { method: 'POST', headers: { Prefer: 'return=minimal,resolution=merge-duplicates' },
    body: JSON.stringify([...wanted].map(([spelling, line_code]) => ({ spelling, line_code, confirmed_by: actor, confirmed_at: now }))) })
  const policies = await readAll('policies?line_code=is.null&select=id,class_of_insurance,product_line')
  const byLine = new Map<LineCode, string[]>()
  for (const p of policies) {
    const line = wanted.get(spellingKey(spellingOf(p)))
    if (line) byLine.set(line, [...(byLine.get(line) ?? []), p.id])
  }
  let count = 0
  for (const [line, ids] of byLine) {
    for (let i = 0; i < ids.length; i += 80) {
      const chunk = ids.slice(i, i + 80).join(',')
      await sb(`policies?id=in.(${chunk})&line_code=is.null`, { method: 'PATCH', headers: quiet, body: JSON.stringify({ line_code: line }) })
      await sb(`renewals?policy_id=in.(${chunk})&outcome=is.null&line_code=is.null`, { method: 'PATCH', headers: quiet, body: JSON.stringify({ line_code: line, updated_at: now }) })
    }
    count += ids.length
  }
  return { tables: true, spellings: wanted.size, policies: count }
}
