/**
 * The comparison a person fills for a renewal: the current policy beside each option on offer,
 * one row per policy term, and how each option meets each item of the client's wish list.
 *
 * Every word and figure is typed by a person reading the insurer's document. Code keeps the shape
 * (bounded here before it is stored), subtracts the current premium from each option's, and counts
 * the wishes an option meets. A person names the option recommended and writes why. No model
 * reads anything.
 *
 * Pure. Tested in __tests__/compare.test.ts. The reads and writes are in compare-store.ts.
 */
import { DASH, money } from '@/lib/format'
import type { LineGroup } from './season'

export const NEEDS = ['must', 'nice'] as const
export type Need = typeof NEEDS[number]
export const NEED_NAME: Record<Need, string> = { must: 'Must have', nice: 'Good to have' }
export const isNeed = (v: unknown): v is Need => typeof v === 'string' && (NEEDS as readonly string[]).includes(v)

export const METS = ['met', 'partly', 'not_met'] as const
export type Met = typeof METS[number]
export const MET_NAME: Record<Met, string> = { met: 'Met', partly: 'Partly met', not_met: 'Not met' }
export const isMet = (v: unknown): v is Met => typeof v === 'string' && (METS as readonly string[]).includes(v)

/** The option every comparison opens with: the policy in force. */
export const CURRENT = 'current'
/** The row that holds a figure: code reads it as money. */
export const PREMIUM = 'premium'
/** The current policy and four options on offer. */
export const OPTIONS_MAX = 5
export const ROWS_MAX = 30
export const NAME_MAX = 60
export const LABEL_MAX = 80
export const CELL_MAX = 500
export const REASON_MAX = 1200

export type CompareFile = { message_id: string; filename: string }
export type CompareOption = { id: string; name: string; insurer: string | null; /** The document on the case's emails the column was read from. */ file: CompareFile | null }
export type CompareRow = { id: string; label: string; /** What a person typed, by option id. */ cells: Record<string, string> }
export type Comparison = {
  options: CompareOption[]
  rows: CompareRow[]
  /** How an option meets a wish: wish note id, then option id. */
  wishes: Record<string, Record<string, Met>>
  recommended: string | null
  /** The reason for the recommendation, in the person's words. */
  note: string | null
}

const TERMS: Record<LineGroup, readonly string[]> = {
  general: ['Scope of cover', 'Sum insured or limit', 'Sub-limits', 'Excess', 'Extensions', 'Exclusions', 'Conditions and warranties', 'Period of insurance'],
  employment_benefits: ['Hospital ward', 'Annual limit', 'Pre-existing conditions', 'Outpatient: general practitioner and specialist', 'Panel and non-panel clinics', 'Exclusions', 'Underwriting terms', 'Period of insurance'],
}
export const PREMIUM_LABEL = 'Premium before GST'

/** The comparison a case opens with: the current policy alone and the terms of its kind of line. */
export function newComparison(group: LineGroup, insurer: string | null = null): Comparison {
  return {
    options: [{ id: CURRENT, name: 'Current policy', insurer: insurer?.trim() || null, file: null }],
    rows: [...TERMS[group].map((label, i) => ({ id: `t${i + 1}`, label, cells: {} })), { id: PREMIUM, label: PREMIUM_LABEL, cells: {} }],
    wishes: {}, recommended: null, note: null,
  }
}

const ID = /^[a-z0-9]{1,16}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const line = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')
/** A cell keeps its line breaks: a list of extensions reads as a list. */
const cell = (v: unknown) => (typeof v === 'string' ? v.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, CELL_MAX) : '')
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {})

/**
 * Bounds what is stored. The current policy is always the first option and the premium the last
 * row; a cell, a mark or a recommendation that names an option not on the list is dropped.
 * `wishIds` are the wishes on the case: a mark on any other note is dropped.
 */
export function cleanComparison(raw: unknown, wishIds?: ReadonlySet<string>): Comparison {
  const r = obj(raw)
  const options: CompareOption[] = []
  for (const o of Array.isArray(r.options) ? r.options.map(obj) : []) {
    if (typeof o.id !== 'string' || !ID.test(o.id) || options.some(x => x.id === o.id)) continue
    const f = obj(o.file)
    const file = typeof f.message_id === 'string' && UUID.test(f.message_id) && line(f.filename, 200) ? { message_id: f.message_id, filename: line(f.filename, 200) } : null
    options.push({ id: o.id, name: line(o.name, NAME_MAX), insurer: line(o.insurer, 80) || null, file })
  }
  const current = options.find(o => o.id === CURRENT) ?? { id: CURRENT, name: '', insurer: null, file: null }
  const offered = options.filter(o => o.id !== CURRENT).slice(0, OPTIONS_MAX - 1)
  const listed = [{ ...current, name: 'Current policy' }, ...offered.map((o, i) => ({ ...o, name: o.name || `Option ${i + 1}` }))]
  const on = new Set(listed.map(o => o.id))

  const cells = (v: unknown) => Object.fromEntries(Object.entries(obj(v)).filter(([k]) => on.has(k)).map(([k, t]) => [k, cell(t)] as const).filter(([, t]) => t))
  const rows: CompareRow[] = []
  let premium: CompareRow = { id: PREMIUM, label: PREMIUM_LABEL, cells: {} }
  for (const x of Array.isArray(r.rows) ? r.rows.map(obj) : []) {
    if (typeof x.id !== 'string' || !ID.test(x.id) || rows.some(y => y.id === x.id)) continue
    if (x.id === PREMIUM) { premium = { ...premium, cells: cells(x.cells) }; continue }
    const row = { id: x.id, label: line(x.label, LABEL_MAX), cells: cells(x.cells) }
    // A row with no name and nothing typed is an empty line at the foot of the grid.
    if (row.label || Object.keys(row.cells).length) rows.push(row)
  }

  const wishes: Comparison['wishes'] = {}
  for (const [id, marks] of Object.entries(obj(r.wishes))) {
    if (!UUID.test(id) || (wishIds && !wishIds.has(id))) continue
    const kept = Object.fromEntries(Object.entries(obj(marks)).filter((e): e is [string, Met] => on.has(e[0]) && isMet(e[1])))
    if (Object.keys(kept).length) wishes[id] = kept
  }
  return {
    options: listed, rows: [...rows.slice(0, ROWS_MAX - 1), premium], wishes,
    recommended: typeof r.recommended === 'string' && on.has(r.recommended) ? r.recommended : null,
    note: line(r.note, REASON_MAX) || null,
  }
}

/** A figure a person typed, as a number: "S$12,345.60", "12345.6", "SGD 12,345". Null for anything that is not one figure. */
export function amountOf(text: string | null | undefined): number | null {
  const t = (text ?? '').trim().replace(/^(?:sgd|s\$|\$)\s*/i, '')
  if (!/^\d{1,3}(?:,\d{3})*(?:\.\d+)?$|^\d+(?:\.\d+)?$/.test(t)) return null
  const n = Number(t.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

export type PremiumLine = { option: string; amount: number | null; /** This option's premium less the current policy's. */ change: number | null; /** The change as a share of the current premium, in percent. */ pct: number | null }

/** Each option's premium beside the current policy's. A cell that is not one figure gives no change. */
export function premiumLines(c: Comparison): PremiumLine[] {
  const row = c.rows.find(r => r.id === PREMIUM)
  const base = amountOf(row?.cells[CURRENT])
  return c.options.map(o => {
    const amount = amountOf(row?.cells[o.id])
    const change = o.id !== CURRENT && amount != null && base != null ? Math.round((amount - base) * 100) / 100 : null
    return { option: o.id, amount, change, pct: change != null && base ? Math.round((change / base) * 1000) / 10 : null }
  })
}

export type WishLine = { id: string; text: string; need: Need | null }
export type WishCount = { option: string; must: { met: number; of: number }; nice: { met: number; of: number }; /** Wishes with no mark for this option. */ unmarked: number }

/** For each option, the wishes it meets in full, by kind. A wish no one graded counts as good to have. */
export function wishCounts(wishes: readonly WishLine[], c: Comparison): WishCount[] {
  return c.options.map(o => {
    const out: WishCount = { option: o.id, must: { met: 0, of: 0 }, nice: { met: 0, of: 0 }, unmarked: 0 }
    for (const w of wishes) {
      const mark = c.wishes[w.id]?.[o.id]
      const kind = w.need === 'must' ? out.must : out.nice
      kind.of++
      if (mark === 'met') kind.met++
      if (!mark) out.unmarked++
    }
    return out
  })
}

/** The options on offer beside the current policy. */
export const offered = (c: Pick<Comparison, 'options'>): number => c.options.filter(o => o.id !== CURRENT).length
/** Must-have wishes first, then in the order they were written. */
export const byNeed = <T extends { need: Need | null }>(wishes: readonly T[]): T[] => [...wishes.filter(w => w.need === 'must'), ...wishes.filter(w => w.need !== 'must')]

/**
 * The document behind each option, as it may be stored. A document a person picks must be one of
 * `files` (the case's files they can see); the one already on record stays when the save names
 * the same email, so a document in a colleague's mailbox survives a save by someone who cannot
 * read its name.
 */
export function keepFiles(next: Comparison, raw: unknown, before: Comparison | null, files: readonly CompareFile[]): Comparison {
  const sent = Array.isArray(obj(raw).options) ? (obj(raw).options as unknown[]).map(obj) : []
  const asked = new Map(sent.map(o => [o.id, obj(o.file).message_id]))
  return {
    ...next,
    options: next.options.map(o => {
      const was = before?.options.find(x => x.id === o.id)?.file ?? null
      if (was && asked.get(o.id) === was.message_id && (!o.file || o.file.filename === was.filename)) return { ...o, file: was }
      return { ...o, file: o.file && files.some(f => f.message_id === o.file!.message_id && f.filename === o.file!.filename) ? o.file : null }
    }),
  }
}

/** "+S$1,200.00 (+8.5%)": an option's premium against the current policy's. Null without both figures. */
export function changeText(l: Pick<PremiumLine, 'change' | 'pct'>): string | null {
  if (l.change == null) return null
  const sign = l.change > 0 ? '+' : l.change < 0 ? '−' : ''
  return `${sign}${money(Math.abs(l.change))}${l.pct != null ? ` (${sign}${Math.abs(l.pct).toFixed(1)}%)` : ''}`
}

export type SummaryModel = {
  client: string
  title: string
  /** Policy number, insurer and period of the policy in force, where the case names one. */
  policy: { number: string | null; insurer: string | null; period: string | null } | null
  as_of: string
  /** One column per option, the current policy first. */
  options: { name: string; insurer: string | null; document: string | null; recommended: boolean }[]
  terms: { label: string; cells: string[] }[]
  premium: { cells: string[]; changes: string[] }
  wishes: { text: string; need: string; marks: string[] }[]
  /** "2 of 3" per option; null when the client has no must-have wish. */
  must: string[] | null
  recommended: { name: string; reason: string | null } | null
}

/**
 * The comparison as the client reads it: the same cells, the change in premium, the wish list with
 * each option's mark. A term nobody filled in for any option is left out.
 */
export function summaryModel(i: { client: string; title: string; policy: SummaryModel['policy']; as_of: string; comparison: Comparison; wishes: readonly WishLine[] }): SummaryModel {
  const c = i.comparison
  const blank = DASH
  const lines = premiumLines(c)
  const listed = byNeed(i.wishes)
  const counts = wishCounts(listed, c)
  const chosen = c.options.find(o => o.id === c.recommended) ?? null
  return {
    client: i.client, title: i.title, policy: i.policy, as_of: i.as_of,
    options: c.options.map(o => ({ name: o.name, insurer: o.insurer, document: o.file?.filename || null, recommended: o.id === c.recommended })),
    terms: c.rows.filter(r => r.id !== PREMIUM && c.options.some(o => r.cells[o.id])).map(r => ({ label: r.label || blank, cells: c.options.map(o => r.cells[o.id] || blank) })),
    premium: {
      cells: c.options.map((o, n) => (lines[n].amount != null ? money(lines[n].amount) : c.rows.find(r => r.id === PREMIUM)?.cells[o.id] || blank)),
      changes: lines.map(l => changeText(l) ?? blank),
    },
    wishes: listed.map(w => ({ text: w.text, need: w.need ? NEED_NAME[w.need] : 'Not graded', marks: c.options.map(o => { const m = c.wishes[w.id]?.[o.id]; return m ? MET_NAME[m] : blank }) })),
    must: listed.some(w => w.need === 'must') ? counts.map(k => `${k.must.met} of ${k.must.of}`) : null,
    recommended: chosen ? { name: chosen.insurer ? `${chosen.name} · ${chosen.insurer}` : chosen.name, reason: c.note } : null,
  }
}
