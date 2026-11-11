/**
 * The EB analysis: one census in, one report out. Every package on the ladder priced at every
 * insurer with the same engine as the plan builder, co-insurance variants in the same run; the
 * suggested rung, the rung above (add a little) and the rung below (save a little); a custom set
 * of numbers priced the same way when the broker asks. The pack is saved on the quotation.
 *
 * The current insurer, when named, is priced on its renewal card; every other insurer as new
 * business, which is how a switch is underwritten. Nothing here calls a model.
 */
import { sb, sbTry, enc } from '@/lib/crm/db'
import { recordHousekeeping } from '../agent-activity'
import { priceBuilder } from './builder'
import { insurerKey, type CategoryInput, type InsurerKey, type Requirement } from './ladder'
import { PACKAGES, suggestedRung, type PackageKey } from './packages'
import { customRequirement, customSummary, resolveCustom, type CustomSpec } from './custom'
import { loadLimitFacts } from './limit-facts'
import type { Member } from '../gb-quote'

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
export type AnalysisRung = { key: PackageKey; name: string; facts: string[]; insurers: AnalysisInsurer[]; best: { insurer_name: string; net: number; total: number } | null }
export type CustomResult = { at: string; spec: CustomSpec; summary: string; insurers: AnalysisInsurer[]; best: AnalysisRung['best']; notes: Record<string, string[]> }
export type AnalysisPack = {
  at: string; by: string | null; quotationId: string
  effectiveDate: string; basis: 'new_business' | 'renewal'; currentInsurer: string | null
  employees: number; dependants: number
  suggested: PackageKey; because: string
  excluded: string[]
  /** Where the run was started from: the thread, the register, an HR link, the company page. Back returns there. */
  source?: { label: string; href: string } | null
  rungs: AnalysisRung[]
  custom?: CustomResult | null
  notes: string[]
}

const KEY = (quotationId: string) => `gb_analysis:${quotationId}`

export async function loadAnalysis(quotationId: string): Promise<AnalysisPack | null> {
  const [r] = await sbTry<{ value: string }[]>(`app_settings?key=eq.${enc(KEY(quotationId))}&select=value&limit=1`, [])
  if (!r?.value) return null
  try { return JSON.parse(r.value) as AnalysisPack } catch { return null }
}

export async function saveAnalysis(pack: AnalysisPack): Promise<void> {
  await sb('app_settings?on_conflict=key', { method: 'POST', headers: { Prefer: 'return=minimal,resolution=merge-duplicates' }, body: JSON.stringify({ key: KEY(pack.quotationId), value: JSON.stringify(pack), updated_at: new Date().toISOString() }) })
}

/** The lowest net total on a rung among the plain, not ruled-out rows. Unpriced lines are shown beside it, not hidden by it. */
export function bestOnRung(insurers: AnalysisInsurer[]): AnalysisRung['best'] {
  const r = insurers.filter(i => !i.variant && !i.excluded).sort((a, b) => a.net - b.net)[0]
  return r ? { insurer_name: r.insurer_name, net: r.net, total: r.total } : null
}

/** "Standard at Singlife S$33,219 · Enhanced +S$2,222 · Essential −S$10,299". */
export function analysisSummary(pack: AnalysisPack): string {
  const money = (n: number) => `S$${Math.round(n).toLocaleString('en-SG')}`
  const i = pack.rungs.findIndex(r => r.key === pack.suggested)
  const s = pack.rungs[i], up = pack.rungs[i + 1], down = pack.rungs[i - 1]
  const parts = [s?.best ? `${s.name} at ${s.best.insurer_name.split(' ')[0]} ${money(s.best.net)}` : 'no complete price']
  if (s?.best && up?.best) parts.push(`${up.name} +${money(up.best.net - s.best.net)}`)
  if (s?.best && down?.best) parts.push(`${down.name} −${money(s.best.net - down.best.net)}`)
  return parts.join(' · ')
}

type Run = Awaited<ReturnType<typeof priceBuilder>>
type Basis = 'new_business' | 'renewal'

function rowsOf(r: Run, basis: Basis, keep: (k: InsurerKey) => boolean, variant: AnalysisInsurer['variant'], excludedKeys: Set<InsurerKey | null>): AnalysisInsurer[] {
  return r.insurers.filter(i => keep(i.insurer)).map(i => {
    const cells = r.grids[i.rate_table_id]?.['All employees'] ?? []
    return {
      rate_table_id: i.rate_table_id, insurer_name: i.insurer_name, insurer: i.insurer, basis, variant, excluded: excludedKeys.has(i.insurer),
      net: Math.round(i.net * 100) / 100, gst: i.gst, total: i.total, by_product: i.by_product, unpriced: i.gaps.length,
      plans: Object.fromEntries(cells.map(c => [c.cover, c.plan])), notes: cells.filter(c => c.note || c.none).map(c => `${c.cover}: ${c.note ?? c.none}`),
    }
  })
}

/** One requirement priced at every insurer: the current insurer on `basis`, the rest on `other`. */
async function priceOnce(members: Member[], req: Requirement, overrides: CategoryInput['overrides'], effectiveDate: string, basis: Basis, other: Basis, current: InsurerKey | null, excludedKeys: Set<InsurerKey | null>, variant: AnalysisInsurer['variant'] = null): Promise<{ rows: AnalysisInsurer[]; employees: number; dependants: number }> {
  const cat = [{ name: 'All employees', requirement: req, overrides: overrides ?? {} }]
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
  recordHousekeeping({ action: 'gb.scenarios_priced', subject: 'EB analysis', resourceType: 'gb_quotation', resourceId: input.quotationId, basis: `${analysisSummary(pack)}; five packages at every insurer`, metadata: { by: input.by ?? null } })
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
  recordHousekeeping({ action: 'gb.scenarios_priced', subject: 'EB analysis · custom', resourceType: 'gb_quotation', resourceId: quotationId, basis: `${customSummary(spec)}; ${next.custom?.best ? `${next.custom.best.insurer_name} S$${Math.round(next.custom.best.net).toLocaleString('en-SG')}` : 'no price'}`, metadata: { by } })
  return next
}
