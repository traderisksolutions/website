/**
 * The EB analysis: one census in, one report out. Every package on the ladder priced at every
 * insurer with the same engine as the plan builder, co-insurance variants in the same run; the
 * suggested rung, the rung above (add a little) and the rung below (save a little); a custom set
 * of numbers priced the same way when the broker asks. The pack is saved on the quotation.
 *
 * The current insurer, when named, is priced on its renewal card; every other insurer as new
 * business, which is how a switch is underwritten. Nothing here calls a model.
 */
import type { LastYear } from './last-year'
import { sb, sbTry, enc } from '@/lib/crm/db'
import { recordHousekeeping } from '../agent-activity'
import { priceBuilder } from './builder'
import { insurerKey, type CategoryInput, type InsurerKey, type Requirement } from './ladder'
import { PACKAGES, packageByKey, suggestedRung, type PackageKey } from './packages'
import type { ScenarioPack } from './scenario-run'
import type { Brief, ScenarioInsurer } from './scenarios'
import { customRequirement, customSummary, resolveCustom, type CustomSpec } from './custom'
import { loadLimitFacts } from './limit-facts'
import type { Member } from '../gb-quote'
import { shortInsurer } from './insurer-names'
import { CHANGES, groupsFor, planValues, unscheduled, type Schedule } from './current'

export type AnalysisInsurer = {
  rate_table_id: string; insurer_name: string; insurer: InsurerKey; basis: 'new_business' | 'renewal'
  /** A co-insurance variant of the insurer's plan on this rung (QBE 20%, RCC Plan 2B), priced in the same run. */
  variant: 'co-insurance' | null
  /** The client ruled this insurer out: shown greyed, still readable. */
  excluded: boolean
  net: number; gst: number; total: number; by_product: Record<string, number>
  /** Member lines the card did not price (age outside the plan, a cover not sold). */
  unpriced: number
  plans: Record<string, string | null>
  notes: string[]
}
export type AnalysisRung = { key: string; name: string; facts: string[]; insurers: AnalysisInsurer[]; best: { insurer_name: string; net: number; total: number } | null }
export type CustomResult = { at: string; spec: CustomSpec; summary: string; insurers: AnalysisInsurer[]; best: AnalysisRung['best']; notes: Record<string, string[]> }
/** Management on one rung, staff on another: each census category assigned a package, priced as one programme. */
export type SplitResult = { at: string; assignments: Record<string, PackageKey>; summary: string; insurers: AnalysisInsurer[]; best: AnalysisRung['best'] }
/** One insurer's plan per cover for the current cover, with the plan's own numbers from its brochure. */
export type CurrentPlan = {
  plans: Partial<Record<string, string>>
  ghs: { plan: string; hospital: string | null; beds: number | null; coins: number; kind: 'annual' | 'per_disability' | null; limit: number | null } | null
  gopcCopay: number | null; goscLimit: number | null; gdLimit: number | null
  notes: string[]
}
export type AnalysisPack = {
  at: string; by: string | null; quotationId: string
  effectiveDate: string; basis: 'new_business' | 'renewal'; currentInsurer: string | null
  employees: number; dependants: number
  /** 'current': the client's current cover, then one change at a time (12 Nov 2026). Absent: the package ladder. */
  mode?: 'current' | 'packages'
  schedule?: Schedule | null
  /** Lives the schedule left out (hospital plan not stated), by name. */
  unscheduled?: string[]
  /** People holding each plan value, per cover, for the schedule shown on the report. */
  planCounts?: Record<string, { value: string; people: number }[]>
  suggested: string; because: string
  excluded: string[]
  /** Where the run was started from: the thread, the register, an HR link, the company page. Back returns there. */
  source?: { label: string; href: string } | null
  rungs: AnalysisRung[]
  /** Per rate table, the plan each insurer sells for the largest group's current cover, and what it gives (13 Nov 2026). */
  currentPlans?: Record<string, CurrentPlan>
  /** Last year's policy as the broker confirmed it: the anchor every price is measured against (13 Nov 2026). */
  lastYear?: LastYear | null
  custom?: CustomResult | null
  split?: SplitResult | null
  notes: string[]
}

const KEY = (quotationId: string) => `gb_analysis:${quotationId}`

export async function loadAnalysis(quotationId: string): Promise<AnalysisPack | null> {
  const [r] = await sbTry<{ value: string }[]>(`app_settings?key=eq.${enc(KEY(quotationId))}&select=value&limit=1`, [])
  if (!r?.value) return null
  try { return JSON.parse(r.value) as AnalysisPack } catch { return null }
}

export type AnalysisSummary = { quotationId: string; at: string; suggested: string; package: string; best_insurer: string | null; best_net: number | null; best_total: number | null; source: AnalysisPack['source'] }
const SUMMARY_KEY = (quotationId: string) => `gb_analysis_summary:${quotationId}`

/** The line a list shows for an analysis: the suggested package, its best insurer and premium. */
export function summaryOf(pack: AnalysisPack): AnalysisSummary {
  const r = pack.rungs.find(x => x.key === pack.suggested)
  return { quotationId: pack.quotationId, at: pack.at, suggested: pack.suggested, package: r?.name ?? pack.suggested, best_insurer: r?.best?.insurer_name ?? null, best_net: r?.best?.net ?? null, best_total: r?.best?.total ?? null, source: pack.source ?? null }
}

export async function saveAnalysis(pack: AnalysisPack): Promise<void> {
  const now = new Date().toISOString()
  await sb('app_settings?on_conflict=key', { method: 'POST', headers: { Prefer: 'return=minimal,resolution=merge-duplicates' }, body: JSON.stringify([
    { key: KEY(pack.quotationId), value: JSON.stringify(pack), updated_at: now },
    { key: SUMMARY_KEY(pack.quotationId), value: JSON.stringify(summaryOf(pack)), updated_at: now },
  ]) })
}

/** The summaries of every analysis, keyed by quotation id, one read. */
export async function loadAnalysisSummaries(): Promise<Map<string, AnalysisSummary>> {
  const rows = await sbTry<{ key: string; value: string }[]>(`app_settings?key=like.gb_analysis_summary:*&select=key,value&limit=5000`, [])
  const out = new Map<string, AnalysisSummary>()
  for (const r of rows) { try { const s = JSON.parse(r.value) as AnalysisSummary; out.set(s.quotationId, s) } catch { /* skip */ } }
  return out
}

/** The lowest net total on a rung among the plain, not ruled-out rows. Unpriced lines are shown beside it, not hidden by it. */
export function bestOnRung(insurers: AnalysisInsurer[]): AnalysisRung['best'] {
  const r = insurers.filter(i => !i.variant && !i.excluded).sort((a, b) => a.net - b.net)[0]
  return r ? { insurer_name: r.insurer_name, net: r.net, total: r.total } : null
}

/** "Standard at Singlife S$33,219 · Enhanced +S$2,222 · Essential −S$10,299". */
export function analysisSummary(pack: AnalysisPack): string {
  const money = (n: number) => `S$${Math.round(n).toLocaleString('en-SG')}`
  if (pack.mode === 'current') {
    const c = pack.rungs[0], cur = pack.currentInsurer ? c?.insurers.find(x => insurerKey(x.insurer_name) === insurerKey(pack.currentInsurer)) : null
    return [c?.best ? `Current cover: ${shortInsurer(c.best.insurer_name)} ${money(c.best.net)}` : 'Current cover not priced', cur ? `${shortInsurer(cur.insurer_name)} renewal ${money(cur.net)}` : null, `${pack.rungs.length - 1} changes priced`].filter(Boolean).join(' · ')
  }
  const i = pack.rungs.findIndex(r => r.key === pack.suggested)
  const s = pack.rungs[i], up = pack.rungs[i + 1], down = pack.rungs[i - 1]
  const parts = [s?.best ? `${s.name} at ${shortInsurer(s.best.insurer_name)} ${money(s.best.net)}` : 'no complete price']
  if (s?.best && up?.best) parts.push(`${up.name} +${money(up.best.net - s.best.net)}`)
  if (s?.best && down?.best) parts.push(`${down.name} −${money(s.best.net - down.best.net)}`)
  return parts.join(' · ')
}

type Run = Awaited<ReturnType<typeof priceBuilder>>
type Basis = 'new_business' | 'renewal'

function rowsOf(r: Run, basis: Basis, keep: (k: InsurerKey) => boolean, variant: AnalysisInsurer['variant'], excludedKeys: Set<InsurerKey | null>): AnalysisInsurer[] {
  return r.insurers.filter(i => keep(i.insurer)).map(i => {
    const grid = r.grids[i.rate_table_id] ?? {}
    const cells = grid['All employees'] ?? Object.values(grid)[0] ?? []
    return {
      rate_table_id: i.rate_table_id, insurer_name: i.insurer_name, insurer: i.insurer, basis, variant, excluded: excludedKeys.has(i.insurer),
      net: Math.round(i.net * 100) / 100, gst: i.gst, total: i.total, by_product: i.by_product, unpriced: i.gaps.length,
      plans: Object.fromEntries(cells.map(c => [c.cover, c.plan])), notes: cells.filter(c => c.note || c.none).map(c => `${c.cover}: ${c.note ?? c.none}`),
    }
  })
}

/** One requirement priced at every insurer: the current insurer on `basis`, the rest on `other`. */
async function priceOnce(members: Member[], req: Requirement, overrides: CategoryInput['overrides'], effectiveDate: string, basis: Basis, other: Basis, current: InsurerKey | null, excludedKeys: Set<InsurerKey | null>, variant: AnalysisInsurer['variant'] = null): Promise<{ rows: AnalysisInsurer[]; employees: number; dependants: number }> {
  return priceCategories(members, [{ name: 'All employees', requirement: req, overrides: overrides ?? {} }], effectiveDate, basis, other, current, excludedKeys, variant)
}

/** Several categories (management, staff), each with its own requirement, priced as one programme. */
async function priceCategories(members: Member[], cat: CategoryInput[], effectiveDate: string, basis: Basis, other: Basis, current: InsurerKey | null, excludedKeys: Set<InsurerKey | null>, variant: AnalysisInsurer['variant'] = null): Promise<{ rows: AnalysisInsurer[]; employees: number; dependants: number }> {
  const main = await priceBuilder({ members, categories: cat, effective_date: effectiveDate, basis, tier_b: false })
  const rest = other === basis ? main : await priceBuilder({ members, categories: cat, effective_date: effectiveDate, basis: other, tier_b: false })
  return { rows: [...rowsOf(main, basis, k => k === current, variant, excludedKeys), ...rowsOf(rest, other, k => k !== current, variant, excludedKeys)], employees: main.employees, dependants: main.dependants }
}

export async function runAnalysis(input: {
  quotationId: string; members: Member[]; effectiveDate: string; basis: Basis
  currentInsurer?: string | null; current?: Partial<Requirement> | null; suggested?: PackageKey | null; excluded?: string[]; source?: { label: string; href: string } | null; by?: string | null
}): Promise<AnalysisPack> {
  const current = input.currentInsurer ? insurerKey(input.currentInsurer) : null
  const other: Basis = input.basis === 'renewal' && current ? 'new_business' : input.basis
  const excludedKeys = new Set((input.excluded ?? []).map(insurerKey))
  const rungs: AnalysisRung[] = []
  let employees = 0, dependants = 0
  for (const p of PACKAGES) {
    const plain = await priceOnce(input.members, p.requirement, {}, input.effectiveDate, input.basis, other, current, excludedKeys)
    employees = plain.employees; dependants = plain.dependants
    const rows = plain.rows
    // The co-insurance variants, in the same run: QBE's 20% co-insurance plan and RCC's Plan 2B,
    // where the rung is a private ward and the insurer priced a plain plan.
    const overrides: Record<string, string> = {}
    for (const row of rows) {
      const ghs = row.plans.GHS ?? ''
      if (row.insurer === 'qbe' && /Private/.test(ghs) && !/co-insurance/.test(ghs)) overrides[`${row.rate_table_id}|GHS`] = `${ghs} · 20% co-insurance`
      if (row.insurer === 'rcc' && /Plan 2A/.test(ghs)) overrides[`${row.rate_table_id}|GHS`] = 'Plan 2B (PTE 1-bed, 20% co-pay)'
    }
    if (Object.keys(overrides).length) {
      const keys = new Set(Object.keys(overrides).map(k => k.split('|')[0]))
      const v = await priceOnce(input.members, p.requirement, overrides, input.effectiveDate, input.basis, other, current, excludedKeys, 'co-insurance')
      rows.push(...v.rows.filter(x => keys.has(x.rate_table_id) && /co-insurance|co-pay/.test(x.plans.GHS ?? '')))
    }
    const insurers = rows.sort((a, b) => a.net - b.net)
    rungs.push({ key: p.key, name: p.name, facts: p.facts, insurers, best: bestOnRung(insurers) })
  }
  const s = suggestedRung(input.basis, input.current ?? null)
  const notes: string[] = []
  if (other !== input.basis) notes.push(`${input.currentInsurer} priced as a renewal; every other insurer as new business, which is how a switch is underwritten.`)
  notes.push('Net of GST. An insurer\'s unpriced lines are members its card does not price on this rung (age outside the plan, or a cover it does not sell); the total excludes them.')
  const prev = await loadAnalysis(input.quotationId)
  const pack: AnalysisPack = {
    at: new Date().toISOString(), by: input.by ?? null, quotationId: input.quotationId,
    effectiveDate: input.effectiveDate, basis: input.basis, currentInsurer: input.currentInsurer ?? null,
    employees, dependants, suggested: input.suggested ?? s.key, because: input.suggested ? 'chosen by the broker' : s.because, excluded: input.excluded ?? [], source: input.source ?? prev?.source ?? null, rungs, custom: prev?.custom ?? null, notes,
  }
  await saveAnalysis(pack)
  recordHousekeeping({ action: 'gb.scenarios_priced', subject: 'Employment benefits analysis', resourceType: 'gb_quotation', resourceId: input.quotationId, basis: `${analysisSummary(pack)}; five packages at every insurer`, metadata: { by: input.by ?? null } })
  return pack
}

/** The broker's own numbers, resolved to a plan per insurer and priced the same way, kept on the pack as Custom. */
export async function runCustom(quotationId: string, spec: CustomSpec, members: Member[], by: string | null): Promise<AnalysisPack> {
  const pack = await loadAnalysis(quotationId)
  if (!pack) throw new Error('Run the analysis first')
  const current = pack.currentInsurer ? insurerKey(pack.currentInsurer) : null
  const other: Basis = pack.basis === 'renewal' && current ? 'new_business' : pack.basis
  const excludedKeys = new Set(pack.excluded.map(insurerKey))
  const tables = [...new Set(pack.rungs.flatMap(r => r.insurers.map(i => i.rate_table_id)))]
  const facts = await loadLimitFacts(tables)
  const overrides: Record<string, string> = {}
  const notes: Record<string, string[]> = {}
  for (const t of tables) {
    const f = facts.get(t); if (!f) continue
    const r = resolveCustom(spec, f)
    for (const [cover, plan] of Object.entries(r.overrides)) if (plan) overrides[`${t}|${cover}`] = plan
    if (r.notes.length) notes[t] = r.notes
  }
  const priced = await priceOnce(members, customRequirement(spec), overrides, pack.effectiveDate, pack.basis, other, current, excludedKeys)
  const insurers = priced.rows.sort((a, b) => a.net - b.net)
  const next: AnalysisPack = { ...pack, custom: { at: new Date().toISOString(), spec, summary: customSummary(spec), insurers, best: bestOnRung(insurers), notes } }
  await saveAnalysis(next)
  recordHousekeeping({ action: 'gb.scenarios_priced', subject: 'Employment benefits analysis · custom', resourceType: 'gb_quotation', resourceId: quotationId, basis: `${customSummary(spec)}; ${next.custom?.best ? `${next.custom.best.insurer_name} S$${Math.round(next.custom.best.net).toLocaleString('en-SG')}` : 'no price'}`, metadata: { by } })
  return next
}

/** Each census category on a rung: the whole programme priced at every insurer, kept on the pack as Split. */
export async function runSplit(quotationId: string, assignments: Record<string, PackageKey>, members: Member[], by: string | null): Promise<AnalysisPack> {
  const pack = await loadAnalysis(quotationId)
  if (!pack) throw new Error('Run the analysis first')
  const current = pack.currentInsurer ? insurerKey(pack.currentInsurer) : null
  const other: Basis = pack.basis === 'renewal' && current ? 'new_business' : pack.basis
  const excludedKeys = new Set(pack.excluded.map(insurerKey))
  const rungs = [...new Set(Object.values(assignments))].map(k => packageByKey(k)).filter((p): p is NonNullable<typeof p> => !!p)
  if (!rungs.length) throw new Error('Assign at least one category to a package')
  const categories: CategoryInput[] = rungs.map(p => ({ name: p.name, requirement: p.requirement, overrides: {} }))
  const first = rungs[0]
  const placed = members.map(m => ({ ...m, category: packageByKey(assignments[m.category] ?? first.key)?.name ?? first.name }))
  const priced = await priceCategories(placed, categories, pack.effectiveDate, pack.basis, other, current, excludedKeys)
  const insurers = priced.rows.sort((a, b) => a.net - b.net)
  const summary = Object.entries(assignments).map(([c, k]) => `${c} on ${packageByKey(k)?.name ?? k}`).join(' · ')
  const next: AnalysisPack = { ...pack, split: { at: new Date().toISOString(), assignments, summary, insurers, best: bestOnRung(insurers) } }
  await saveAnalysis(next)
  recordHousekeeping({ action: 'gb.scenarios_priced', subject: 'Employment benefits analysis · split', resourceType: 'gb_quotation', resourceId: quotationId, basis: `${summary}; ${next.split?.best ? `${next.split.best.insurer_name} S$${Math.round(next.split.best.net).toLocaleString('en-SG')}` : 'no price'}`, metadata: { by } })
  return next
}

/**
 * The analysis in the shape the client report and the client draft read (the older scenario
 * pack): the suggested package first, then one up, then one down. A split or a custom run, when
 * present, is the first column instead, since it is what the broker chose to present.
 */
export function analysisAsScenarios(pack: AnalysisPack, companyName: string | null): ScenarioPack {
  const current = pack.currentInsurer ? insurerKey(pack.currentInsurer) : null
  const rows = rowsFor
  void rows
  function rowsFor(ins: AnalysisInsurer[]): ScenarioInsurer[] { return ins.filter(i => !i.variant).map(i => ({
    rate_table_id: i.rate_table_id, insurer_name: i.insurer_name, insurer: i.insurer, net: i.net, gst: i.gst, total: i.total, missing: i.unpriced, by_product: i.by_product, gaps: [],
    inForce: true, excluded: i.excluded, preferred: false, current: !!current && i.insurer === current, withinBudget: null,
  })) }
  const scenarios: ScenarioPack['scenarios'] = []
  if (pack.mode === 'current') {
    const cur = pack.rungs[0]
    const changes = pack.rungs.slice(1).filter(r => r.best && cur?.best)
    const cheaper = changes.filter(r => r.best!.net < cur!.best!.net).sort((a, b) => b.best!.net - a.best!.net)[0]
    const dearer = changes.filter(r => r.best!.net > cur!.best!.net).sort((a, b) => a.best!.net - b.best!.net)[0]
    const req = PACKAGES[1].requirement
    if (cur) scenarios.push({ key: 'A', name: 'Current cover', summary: 'The cover held today', requirement: req, changes: [], insurers: [] })
    if (dearer) scenarios.push({ key: 'C', name: dearer.name, summary: dearer.name, requirement: req, changes: [], insurers: [] })
    if (cheaper) scenarios.push({ key: 'B', name: cheaper.name, summary: cheaper.name, requirement: req, changes: [], insurers: [] })
    const by = new Map([[cur?.key, cur], [dearer?.key, dearer], [cheaper?.key, cheaper]])
    for (const sc of scenarios) { const r = [...by.values()].find(x => x && x.name === sc.name); sc.insurers = r ? rowsFor(r.insurers) : [] }
    const brief0: Brief = { company: companyName, basis: pack.basis, currentInsurer: pack.currentInsurer, current: {}, currentPlanText: null, expiringPremium: null, budget: null, budgetText: null, budgetNetOfGst: null, mustHaves: [], wishes: [], optional: [], excludeInsurers: pack.excluded, preferInsurers: [], renewalDate: null, effectiveDate: pack.effectiveDate, decisions: [], open: [] }
    return { at: pack.at, by: pack.by, threadId: null, quotationId: pack.quotationId, model: 'none', messages: 0, brief: brief0, effectiveDate: pack.effectiveDate, basis: pack.basis, employees: pack.employees, dependants: pack.dependants, scenarios, notes: pack.notes }
  }
  const i = pack.rungs.findIndex(r => r.key === pack.suggested)
  const sug = pack.rungs[i], up = pack.rungs[i + 1], down = pack.rungs[i - 1]
  const push = (key: 'A' | 'B' | 'C', name: string, summary: string, insurers: AnalysisInsurer[], requirement: Requirement) => scenarios.push({ key, name, summary, requirement, changes: [], insurers: rows(insurers) })
  if (pack.split) push('A', `Split · ${pack.split.summary}`, pack.split.summary, pack.split.insurers, sug?.key ? packageByKey(sug.key)!.requirement : PACKAGES[1].requirement)
  else if (pack.custom) push('A', 'Custom', pack.custom.summary, pack.custom.insurers, customRequirement(pack.custom.spec))
  else if (sug) push('A', `${sug.name}`, sug.facts.join(' · '), sug.insurers, packageByKey(sug.key)!.requirement)
  if (up) push('C', `${up.name} (add a little)`, up.facts.join(' · '), up.insurers, packageByKey(up.key)!.requirement)
  if (down) push('B', `${down.name} (save a little)`, down.facts.join(' · '), down.insurers, packageByKey(down.key)!.requirement)
  const brief: Brief = {
    company: companyName, basis: pack.basis, currentInsurer: pack.currentInsurer, current: {}, currentPlanText: null, expiringPremium: null,
    budget: null, budgetText: null, budgetNetOfGst: null, mustHaves: [], wishes: [], optional: [], excludeInsurers: pack.excluded, preferInsurers: [],
    renewalDate: null, effectiveDate: pack.effectiveDate, decisions: [], open: [],
  }
  return { at: pack.at, by: pack.by, threadId: null, quotationId: pack.quotationId, model: 'none', messages: 0, brief, effectiveDate: pack.effectiveDate, basis: pack.basis, employees: pack.employees, dependants: pack.dependants, scenarios, notes: pack.notes }
}

/**
 * The current cover, then one change at a time: every column priced at every insurer in one run.
 * People with the same numbers price as one category; the current insurer on its renewal card.
 */
export async function runCurrent(input: {
  quotationId: string; members: Member[]; schedule: Schedule; effectiveDate: string; basis: Basis
  currentInsurer?: string | null; excluded?: string[]; source?: { label: string; href: string } | null; by?: string | null
  lastYear?: LastYear | null
}): Promise<AnalysisPack> {
  const current = input.currentInsurer ? insurerKey(input.currentInsurer) : null
  const other: Basis = input.basis === 'renewal' && current ? 'new_business' : input.basis
  const excludedKeys = new Set((input.excluded ?? []).map(insurerKey))
  const tables = (await builderTablesFor(input.effectiveDate)).map(t => t.id)
  const facts = await loadLimitFacts(tables)
  const rungs: AnalysisRung[] = []
  let employees = 0, dependants = 0
  // The plan each insurer sells for the largest group's current cover, shown in the report's plan table.
  const currentPlans: Record<string, CurrentPlan> = {}
  {
    const base = (groupsFor(input.members, input.schedule, CHANGES[0]) ?? []).filter(g => !g.foreignWorker).sort((a, b) => b.members.length - a.members.length)[0]
    if (base) for (const t of tables) {
      const f = facts.get(t); if (!f) continue
      const r = resolveCustom(base.spec, f)
      const pick = <T extends { plan: string }>(list: T[], plan: string | undefined) => plan ? list.find(x => x.plan === plan) ?? null : null
      const g = pick(f.ghs, r.overrides.GHS)
      currentPlans[t] = {
        plans: r.overrides as Partial<Record<string, string>>,
        ghs: g ? { plan: g.plan, hospital: g.hospital, beds: g.beds, coins: g.coins, kind: g.kind, limit: g.limit } : null,
        gopcCopay: pick(f.gopc, r.overrides.GOPC)?.copay ?? null,
        goscLimit: pick(f.gosc, r.overrides.GOSC)?.limit ?? null,
        gdLimit: pick(f.gd, r.overrides.GD)?.limit ?? null,
        notes: r.notes,
      }
    }
  }
  for (const change of CHANGES) {
    const groups = groupsFor(input.members, input.schedule, change)
    if (!groups) continue
    const cats: CategoryInput[] = []
    const placed: Member[] = []
    groups.forEach((g, i) => {
      const name = `Group ${i + 1}`
      const overrides: Record<string, string> = {}
      if (!g.foreignWorker) for (const t of tables) { const f = facts.get(t); if (!f) continue; for (const [cover, plan] of Object.entries(resolveCustom(g.spec, f).overrides)) if (plan) overrides[`${t}|${cover}`] = plan }
      cats.push({ name, requirement: g.foreignWorker ? { ...customRequirement(g.spec), ward: 'G4', wardLevel: 'entry' } : customRequirement(g.spec), overrides })
      for (const m of g.members) placed.push({ ...m, category: name, work_pass: g.foreignWorker ? 'WP' : m.work_pass ?? null })
    })
    const priced = await priceCategories(placed, cats, input.effectiveDate, input.basis, other, current, excludedKeys)
    employees = priced.employees; dependants = priced.dependants
    const insurers = priced.rows.sort((a, b) => a.net - b.net)
    // A change that moves no price at any insurer (the limit is tied to the ward there) is left out.
    const base = rungs[0]
    if (base && insurers.every(i => Math.abs(i.net - (base.insurers.find(b => b.rate_table_id === i.rate_table_id && b.variant === i.variant)?.net ?? NaN)) < 1)) continue
    rungs.push({ key: change.key, name: change.name, facts: [change.group], insurers, best: bestOnRung(insurers) })
  }
  const notes: string[] = []
  if (other !== input.basis) notes.push(`${input.currentInsurer} priced as a renewal; every other insurer as new business, which is how a switch is underwritten.`)
  notes.push('Changes that move no price at any insurer are left out: at most insurers the per-stay limit comes with the ward, so a limit change alone selects the same plan.')
  notes.push('Net of GST. Each change applies to everyone at once; foreign-worker cover stays as it is. Unpriced lines are members a card does not price (age outside the plan, or a cover it does not sell).')
  const left = unscheduled(input.members, input.schedule)
  const prev = await loadAnalysis(input.quotationId)
  const pack: AnalysisPack = {
    at: new Date().toISOString(), by: input.by ?? null, quotationId: input.quotationId, mode: 'current', schedule: input.schedule,
    unscheduled: left.map(m => m.name), planCounts: planValues(input.members), effectiveDate: input.effectiveDate, basis: input.basis, currentInsurer: input.currentInsurer ?? null,
    employees, dependants, suggested: 'current', because: 'the cover the client holds today', excluded: input.excluded ?? [],
    source: input.source ?? prev?.source ?? null, rungs, custom: null, split: null, notes,
    lastYear: input.lastYear !== undefined ? input.lastYear : prev?.lastYear ?? null, currentPlans,
  }
  await saveAnalysis(pack)
  const c = rungs[0]
  recordHousekeeping({ action: 'gb.scenarios_priced', subject: 'Employment benefits analysis · current cover', resourceType: 'gb_quotation', resourceId: input.quotationId, basis: `current cover ${c?.best ? `${shortInsurer(c.best.insurer_name)} S$${Math.round(c.best.net).toLocaleString('en-SG')}` : 'not priced'}; ${rungs.length - 1} changes at every insurer`, metadata: { by: input.by ?? null } })
  return pack
}

async function builderTablesFor(effectiveDate: string) {
  const { builderTables } = await import('./builder')
  const { cardsInForce } = await import('./table-version')
  const every = await builderTables(false)
  const ids = new Set([...cardsInForce(every, effectiveDate.slice(0, 10), 'new_business').cards, ...cardsInForce(every, effectiveDate.slice(0, 10), 'renewal').cards].map(c => c.id))
  return every.filter(t => ids.has(t.id))
}
