/**
 * Renewal Season: every policy that ends in the season window, beside the open renewal case that
 * works it. The window runs from 30 days back to the end of the third month ahead.
 *
 * A case is paired with a policy by its policy link, then its policy number, then the line its
 * title names, then as the only case the client has left for its only policy left. A case is
 * paired once. A link to a policy outside the list (the next term's draft) holds a case back from
 * nothing: its number and title still pair it. An open renewal case no policy takes keeps a row of its own while its date is in
 * the window (or it has none) and it has not reached the policy and debit note stage.
 *
 * A policy the register already holds a successor for (the same client and class, starting within
 * 45 days of its end) is renewed and left out. No model reads anything here.
 *
 * Pure and browser-safe. Tested in __tests__/season.test.ts. The reads and writes are in season-store.ts.
 */
import { basePolicyNumber } from '@/lib/policies/endorsement'
import { caseLine, checklistLine, lineName } from './checklist'
import { daysBetween, relevanceOf, type Relevance } from './relevance'
import type { Label } from './labels'

export const SEASON_BACK_DAYS = 30
export const SEASON_MONTHS_AHEAD = 3
export const SUCCESSOR_DAYS = 45

const addDays = (iso: string, n: number) => new Date(Date.parse(iso.slice(0, 10)) + n * 86_400_000).toISOString().slice(0, 10)

export type SeasonWindow = { from: string; to: string }
export function seasonWindow(today: string): SeasonWindow {
  const [y, m] = today.split('-').map(Number)
  // Day 0 of the month after the last one is that month's last day.
  return { from: addDays(today, -SEASON_BACK_DAYS), to: new Date(Date.UTC(y, m + SEASON_MONTHS_AHEAD, 0)).toISOString().slice(0, 10) }
}

export const OVERDUE = 'overdue'
export const NO_DATE = 'none'
/** Where a row sits in the month filter: Overdue once the date has passed, else its month ("2026-12"). */
export const bucketOf = (end: string | null | undefined, today: string): string => (!end ? NO_DATE : end.slice(0, 10) < today ? OVERDUE : end.slice(0, 7))
/** The months the filter offers, this month to the window's last. */
export function seasonMonths(today: string): string[] {
  const [y, m] = today.split('-').map(Number)
  return Array.from({ length: SEASON_MONTHS_AHEAD + 1 }, (_, i) => new Date(Date.UTC(y, m - 1 + i, 1)).toISOString().slice(0, 7))
}

export type SeasonPolicy = {
  id: string; company_id: string; policy_number: string | null; insurer: string | null; class_of_insurance: string | null
  label: string | null; product_line: string | null; start_date?: string | null; end_date: string; is_eb?: boolean | null
}
export type SeasonCase = {
  id: string; company_id: string | null; client_name: string | null; title: string | null; policy_id: string | null; policy_number: string | null
  deadline: string | null; stage: string | null; placement_id: string | null; owner_email: string | null
}

const EMPLOYMENT_BENEFITS = /benefit|medical|hospital|\bghs\b|\bgtl\b|dental|\beb\b|group life|critical illness/i
export type LineGroup = 'employment_benefits' | 'general'
export const LINE_GROUP_NAME: Record<LineGroup, string> = { employment_benefits: 'Employment Benefits', general: 'General' }
/** A known line decides (foreign worker medical is its own line); without one, the register's flag or the wording does. */
export const lineGroupOf = (i: { is_eb?: boolean | null; line: string | null; text: string }): LineGroup =>
  (i.line ? checklistLine(i.line) === 'employee_benefits' : i.is_eb || EMPLOYMENT_BENEFITS.test(i.text)) ? 'employment_benefits' : 'general'

/** The policy's line of insurance, as a case's Brief reads it. */
export const policyLine = (p: Pick<SeasonPolicy, 'product_line' | 'class_of_insurance'>): string | null => caseLine({ policyLine: p.product_line, policyClass: p.class_of_insurance })?.line ?? null

const sameClass = (a: string | null, b: string | null) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()
/** The register already holds the next term: the same client and class, starting within 45 days of this policy's end. */
export const isRenewed = (p: SeasonPolicy, others: readonly Pick<SeasonPolicy, 'id' | 'company_id' | 'class_of_insurance' | 'start_date' | 'end_date'>[]): boolean =>
  others.some(o => o.id !== p.id && o.company_id === p.company_id && sameClass(o.class_of_insurance, p.class_of_insurance) && !!o.start_date
    && Math.abs(daysBetween(p.end_date, o.start_date)) <= SUCCESSOR_DAYS && o.end_date > p.end_date)

export type PairBy = 'link' | 'number' | 'line' | 'only'
export const PAIR_BY_NAME: Record<PairBy, string> = { link: 'Policy on the case', number: 'Policy number', line: 'Line in the case title', only: 'The client’s only renewal case' }
export type Pair = { case_id: string; by: PairBy }

const numberKey = (n: string | null | undefined) => (basePolicyNumber(n) ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const titleLine = (c: SeasonCase) => checklistLine(caseLine({ title: c.title })?.line)
const gap = (p: SeasonPolicy, c: SeasonCase) => (c.deadline ? Math.abs(daysBetween(p.end_date, c.deadline)) : Number.MAX_SAFE_INTEGER)

/** The case that works each policy, by policy id. */
export function pairCases(policies: readonly SeasonPolicy[], cases: readonly SeasonCase[]): Map<string, Pair> {
  const pairs = new Map<string, Pair>()
  const taken = new Set<string>()
  const ordered = [...policies].sort((a, b) => a.end_date.localeCompare(b.end_date) || a.id.localeCompare(b.id))
  const listed = new Set(policies.map(p => p.id))
  /** The client's cases no policy has taken, leaving out those linked to another policy on the list. */
  const open = (p: SeasonPolicy) => cases.filter(c => c.company_id === p.company_id && !taken.has(c.id) && !(c.policy_id && listed.has(c.policy_id)))
  const take = (p: SeasonPolicy, c: SeasonCase | undefined, by: PairBy) => { if (c) { pairs.set(p.id, { case_id: c.id, by }); taken.add(c.id) } }

  for (const p of ordered) take(p, cases.find(c => c.policy_id === p.id && !taken.has(c.id)), 'link')
  for (const p of ordered) {
    const key = numberKey(p.policy_number)
    if (pairs.has(p.id) || key.length < 5) continue
    take(p, open(p).find(c => numberKey(c.policy_number) === key || (c.title ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').includes(key)), 'number')
  }
  for (const p of ordered) {
    const line = checklistLine(policyLine(p))
    if (pairs.has(p.id) || !line) continue
    take(p, open(p).filter(c => titleLine(c) === line).sort((a, b) => gap(p, a) - gap(p, b) || a.id.localeCompare(b.id))[0], 'line')
  }
  for (const p of ordered) {
    if (pairs.has(p.id) || ordered.some(o => o.id !== p.id && o.company_id === p.company_id && !pairs.has(o.id))) continue
    // A title that names another line is another policy's case.
    const left = open(p)
    if (left.length === 1 && !titleLine(left[0])) take(p, left[0], 'only')
  }
  return pairs
}

const DONE_STAGES = new Set(['policy_and_dn', 'paid'])
/** An open renewal case no policy took still gets a row: dated in the window or undated, and not yet at the policy and debit note. */
export const keepsOwnRow = (c: SeasonCase, w: SeasonWindow): boolean =>
  !DONE_STAGES.has(c.stage ?? '') && (!c.deadline || (c.deadline.slice(0, 10) >= w.from && c.deadline.slice(0, 10) <= w.to))

/** What the list shows of a case. Counted in season-store.ts. */
export type SeasonCaseState = { threads: number; wishes: number; documents: { ticked: number; required: number } | null }
export type SeasonCompare = { kind: 'compare_cover' | 'new_quotation' | 'quotes'; href: string }
export type SeasonRow = {
  key: string
  company_id: string | null; company: string
  /** Null on a case that no policy in the window takes. */
  policy: { id: string; name: string; insurer: string | null; number: string | null } | null
  end_date: string | null; days: number | null; bucket: string
  line: string | null; line_name: string | null; group: LineGroup
  case: (SeasonCaseState & { id: string; title: string | null; stage: string | null; owner: string | null; paired_by: PairBy | null }) | null
  compare: SeasonCompare | null
}

export type SeasonInput = {
  policies: readonly SeasonPolicy[]; cases: readonly SeasonCase[]
  /** Company names by id. */
  names: ReadonlyMap<string, string>
  states: ReadonlyMap<string, SeasonCaseState>
  compare: (row: Omit<SeasonRow, 'compare'>) => SeasonCompare | null
}

/** One row per policy in the window and per case no policy takes, the earliest end date first. */
export function seasonRows(i: SeasonInput, today: string): SeasonRow[] {
  const w = seasonWindow(today)
  const pairs = pairCases(i.policies, i.cases)
  const byId = new Map(i.cases.map(c => [c.id, c]))
  const paired = new Set([...pairs.values()].map(p => p.case_id))
  const none: SeasonCaseState = { threads: 0, wishes: 0, documents: null }
  const caseOf = (c: SeasonCase, by: PairBy | null) => ({ id: c.id, title: c.title, stage: c.stage, owner: c.owner_email, paired_by: by, ...(i.states.get(c.id) ?? none) })
  const dated = (end: string | null) => ({ end_date: end, days: end ? daysBetween(today, end) : null, bucket: bucketOf(end, today) })
  const named = (line: string | null) => ({ line, line_name: line ? lineName(line) : null })

  const rows: Omit<SeasonRow, 'compare'>[] = []
  for (const p of i.policies) {
    const pair = pairs.get(p.id)
    const c = pair ? byId.get(pair.case_id) : undefined
    const line = policyLine(p)
    rows.push({
      key: p.id, company_id: p.company_id, company: i.names.get(p.company_id) ?? 'Unfiled',
      policy: { id: p.id, name: p.label ?? p.class_of_insurance ?? 'Policy', insurer: p.insurer, number: p.policy_number },
      ...dated(p.end_date), ...named(line), group: lineGroupOf({ is_eb: p.is_eb, line, text: `${p.class_of_insurance ?? ''} ${p.label ?? ''}` }),
      case: c ? caseOf(c, pair!.by) : null,
    })
  }
  for (const c of i.cases) {
    if (paired.has(c.id) || !keepsOwnRow(c, w)) continue
    const line = caseLine({ title: c.title })?.line ?? null
    rows.push({
      key: `case:${c.id}`, company_id: c.company_id, company: (c.company_id && i.names.get(c.company_id)) || c.client_name || 'Unfiled', policy: null,
      ...dated(c.deadline?.slice(0, 10) ?? null), ...named(line), group: lineGroupOf({ line, text: c.title ?? '' }), case: caseOf(c, null),
    })
  }
  return rows
    .sort((a, b) => Number(!a.end_date) - Number(!b.end_date) || String(a.end_date).localeCompare(String(b.end_date)) || a.company.localeCompare(b.company) || a.key.localeCompare(b.key))
    .map(r => ({ ...r, compare: i.compare(r) }))
}

/** The title a case started from a policy carries, as the renewal sweep writes it. */
export const renewalTitle = (p: Pick<SeasonPolicy, 'class_of_insurance' | 'product_line' | 'policy_number'>): string =>
  `Renewal: ${p.class_of_insurance ?? p.product_line ?? 'policy'}${p.policy_number ? ` ${p.policy_number}` : ''}`.slice(0, 140)

/**
 * Where a thread sits when a person selects conversations for a renewal: by its label and its age
 * alone. Being on no case yet does not send it to the back burner, since selecting is what files it.
 */
export const pickGroupOf = (t: { last_message_at: string | null; label: Label | null }, today: string): Relevance =>
  relevanceOf({ lastMessageAt: t.last_message_at, label: t.label, onOpenCase: true }, today)
