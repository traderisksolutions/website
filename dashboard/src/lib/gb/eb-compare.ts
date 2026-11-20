/**
 * Compare on /eb (Jarod's approved design, 20 Nov 2026): one column per product, per insurer
 * schedule and per copy a broker makes; one row per cover; Total a year and Per employee under it.
 *
 * A brochure column holds a plan per cover per category, priced from the stored price of every plan
 * (eb-price.ts), so a change of plan is a sum. A copy is a brochure column the broker changes on
 * its own, compared with its original. An insurer schedule column holds the insurer's own figures
 * as read (insurer-schedule.ts). Current is only what a premium or debit note states (call note 23).
 *
 * Pure and browser-safe. Tested in src/__tests__/gb-eb-compare.test.ts.
 */
import type { MatchReason } from './compare-cover'
import { applyRules } from './plan-pairs'
import { TIERS, type CoverKey, type CurrentPremium, type PlanOption, type Priced } from './eb-quote'
import { schedulePremium, type InsurerSchedule, type ScheduleStatus } from './insurer-schedule'

export type Tier = 'same' | 'lower'
export type ColumnPicks = Record<string, Record<CoverKey, string>>            // category → cover → plan
export type EbColumn =
  | { id: string; kind: 'brochure' | 'copy'; product: string; copyOf: string | null; picks: ColumnPicks }
  | { id: string; kind: 'schedule'; schedule: InsurerSchedule }

/** `noClass`: lives priced 0 for accident with no occupation class; `note`: a choice the insurer's rules do not expect (GP beside a specialist rider that includes it). */
export type CategoryCell = { category: string; plan: string; words: string; premium: number | null; unpriced: number; noClass: number; note: string | null; options: PlanOption[]; locked: boolean; reason: MatchReason | 'changed' | null }
export type PlanCell = { kind: 'plans'; perCategory: CategoryCell[]; premium: number | null; flag: boolean }
export type ScheduleCell = { kind: 'schedule'; premium: number | null; status: ScheduleStatus | null; sources: string[] }
export type Cell = PlanCell | ScheduleCell
export type ModelColumn = { id: string; kind: EbColumn['kind']; label: string; product: string | null; source: 'Brochure' | 'Insurer schedule'; total: number; perEmployee: number | null; vsOriginal: number | null; flags: number; warnings: string[] }
export type CompareModel = { columns: ModelColumn[]; rows: { key: CoverKey; label: string; current: number | null; cells: Cell[] }[]; current: { total: number | null; perEmployee: number | null }; employees: number; categories: string[] }

const round2 = (n: number) => Math.round(n * 100) / 100

/** Every brochure column's picks for a tier: each category's Same or Lower pick. Pure. */
export function tierPicks(priced: Priced, product: string, tier: Tier): ColumnPicks {
  return Object.fromEntries(priced.categories.map(c => [c.name, Object.fromEntries(TIERS.map(t => [t.key, c.products[product]?.[t.key]?.[tier].plan ?? ''])) as Record<CoverKey, string>]))
}

/** One plan changed in one column for one category, the product's plan rules applied. Pure. */
export function choosePlan(priced: Priced, col: Extract<EbColumn, { kind: 'brochure' | 'copy' }>, category: string, key: CoverKey, plan: string): EbColumn {
  const cat = priced.categories.find(c => c.name === category)
  if (!cat) return col
  const cur = col.picks[category] ?? ({} as Record<CoverKey, string>)
  const byCover = Object.fromEntries(TIERS.map(t => [t.cover, t.key === key ? plan : cur[t.key] ?? '']))
  const options = Object.fromEntries(TIERS.map(t => [t.cover, cat.products[col.product]?.[t.key]?.options.map(o => o.plan) ?? []]))
  const ruled = applyRules(priced.rules, col.product, byCover, options, TIERS.find(t => t.key === key)?.cover)
  return { ...col, picks: { ...col.picks, [category]: Object.fromEntries(TIERS.map(t => [t.key, ruled[t.cover] ?? ''])) as Record<CoverKey, string> } }
}

/** The label a column carries in the table, the proposal and the export: copies numbered, schedules named for their insurer. Pure. */
export function columnLabels(cols: EbColumn[]): string[] {
  const seen = new Map<string, number>()
  return cols.map(c => {
    if (c.kind === 'schedule') return `${c.schedule.insurer ?? c.schedule.file.replace(/\.[^.]+$/, '')} (insurer schedule)`
    if (c.kind === 'brochure') return c.product
    const n = (seen.get(c.product) ?? 0) + 1
    seen.set(c.product, n)
    return `${c.product} · copy${n > 1 ? ` ${n}` : ''}`
  })
}

export function compareModel(priced: Priced, cols: EbColumn[], current: CurrentPremium, tier: Tier): CompareModel {
  const employees = priced.categories.reduce((a, c) => a + c.employees, 0)
  const labels = columnLabels(cols)
  const rows = TIERS.map(t => ({
    key: t.key, label: t.cover, current: current.byCover[t.key],
    cells: cols.map((col): Cell => {
      if (col.kind === 'schedule') { const s = schedulePremium(col.schedule, t.key); return { kind: 'schedule', premium: s.premium, status: s.status, sources: s.sources } }
      const perCategory = priced.categories.map(c => {
        const pc = c.products[col.product]?.[t.key]
        const plan = col.picks[c.name]?.[t.key] ?? ''
        const opt = pc?.options.find(o => o.plan === plan)
        const tierPick = pc?.[tier]
        return {
          category: c.name, plan, words: plan ? opt?.words ?? plan : 'None', premium: plan ? opt?.premium ?? null : 0, unpriced: plan ? opt?.unpriced ?? 0 : 0, noClass: plan ? opt?.noClass ?? 0 : 0,
          note: plan && priced.rules.some(r => r.product === col.product && r.cover === t.cover && r.match === 'exclusive' && col.picks[c.name]?.[TIERS.find(x => x.cover === r.tiedTo)!.key]) ? 'Specialist already includes GP' : null,
          options: pc?.options ?? [], locked: !!pc?.locked,
          reason: !tierPick ? null : plan === tierPick.plan ? tierPick.reason : 'changed',
        } satisfies CategoryCell
      })
      const chosen = perCategory.filter(x => x.plan)
      const premium = chosen.length ? (chosen.some(x => x.premium != null) ? round2(chosen.reduce((a, x) => a + (x.premium ?? 0), 0)) : null) : null
      // Census against brochure (call note 1): no same plan for this census category, or a plan with no rate for these ages.
      const flag = perCategory.some(x => x.reason === 'no same plan' || x.reason === 'higher' || (x.plan && x.premium == null))
      return { kind: 'plans', perCategory, premium, flag }
    }),
  }))
  const columns: ModelColumn[] = cols.map((col, i) => {
    const total = round2(rows.reduce((a, r) => a + (r.cells[i].premium ?? 0), 0))
    return {
      id: col.id, kind: col.kind, label: labels[i], product: col.kind === 'schedule' ? null : col.product,
      source: col.kind === 'schedule' ? 'Insurer schedule' : 'Brochure', total, perEmployee: employees ? round2(total / employees) : null, vsOriginal: null,
      flags: rows.filter(r => r.cells[i].kind === 'plans' && (r.cells[i] as PlanCell).flag).length,
      warnings: col.kind === 'schedule' ? [] : [...(priced.warnings?.[col.product] ?? []), ...headcountWarnings(priced, col.product, col.picks)],
    }
  })
  cols.forEach((col, i) => {
    if (col.kind !== 'copy') return
    const j = cols.findIndex(o => o.id === col.copyOf)
    if (j >= 0) columns[i].vsOriginal = round2(columns[i].total - columns[j].total)
  })
  return {
    columns, rows, employees, categories: priced.categories.map(c => c.name),
    current: { total: current.total, perEmployee: current.total != null && employees ? round2(current.total / employees) : null },
  }
}

/**
 * Headcount the insurers require (eb-rules.md section 4; brochures): Income 2 employees per plan
 * type (p.12), Singlife 2 employees (Summary!B34), AIA 5 to 50 lives (p.18). Warned beside the
 * column, never blocking. Pure.
 */
export function headcountWarnings(priced: Priced, product: string, picks: ColumnPicks): string[] {
  const employees = priced.categories.reduce((a, c) => a + c.employees, 0)
  const lives = priced.categories.reduce((a, c) => a + c.lives, 0)
  if (product === 'Singlife MyBenefits Plus' && employees < 2) return [`Singlife needs 2 employees; this census has ${employees}`]
  if (product === 'AIA Flexi Vital Care Plus' && (lives < 5 || lives > 50)) return [`AIA takes 5 to 50 lives; this census has ${lives}`]
  if (product === 'Income FlexCare') {
    const byPlan = new Map<string, number>()
    for (const c of priced.categories) { const p = picks[c.name]?.hs; if (p) byPlan.set(p, (byPlan.get(p) ?? 0) + c.employees) }
    return [...byPlan].filter(([, n]) => n < 2).map(([p, n]) => `Income needs 2 employees per plan; ${p.replace(/\s*\(.*$/, '')} has ${n}`)
  }
  return []
}

/** The compare table as rows of cells, for the Excel export: covers down, Current then each column, plans and premiums. Pure. */
export function compareSheet(m: CompareModel, meta: { company: string; effectiveDate: string }): (string | number | null)[][] {
  const out: (string | number | null)[][] = [
    [`${meta.company || 'Employment Benefits'} · comparison`], [`Policy start ${meta.effectiveDate} · ${m.employees} employees · S$ a year, net of GST`], [],
    ['Cover', 'Current', ...m.columns.map(c => c.label)],
    ['', '', ...m.columns.map(c => c.source)],
  ]
  for (const r of m.rows) {
    out.push([r.label, r.current, ...r.cells.map(c => c.premium)])
    if (r.cells.some(c => c.kind === 'plans' && c.perCategory.some(x => x.plan))) {
      for (const cat of m.categories) out.push([`  ${m.categories.length > 1 ? `${cat} · ` : ''}plan`, null, ...r.cells.map(c => c.kind === 'plans' ? (c.perCategory.find(x => x.category === cat)?.plan || 'None') : c.status ?? '')])
    }
  }
  out.push(['Total a year', m.current.total, ...m.columns.map(c => c.total)])
  out.push(['Per employee', m.current.perEmployee, ...m.columns.map(c => c.perEmployee)])
  if (m.columns.some(c => c.vsOriginal != null)) out.push(['Against the original', null, ...m.columns.map(c => c.vsOriginal)])
  return out
}
