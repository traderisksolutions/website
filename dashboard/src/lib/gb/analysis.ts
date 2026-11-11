/**
 * The EB analysis: one census in, one report out. Every package on the ladder priced at every
 * insurer with the same engine as the plan builder; the suggested rung, the rung above (add a
 * little) and the rung below (save a little); the pack saved on the quotation.
 *
 * The current insurer, when named, is priced on its renewal card; every other insurer as new
 * business, which is how a switch is underwritten. Nothing here calls a model.
 */
import { sb, sbTry, enc } from '@/lib/crm/db'
import { recordHousekeeping } from '../agent-activity'
import { priceBuilder } from './builder'
import { insurerKey, type InsurerKey } from './ladder'
import { PACKAGES, suggestedRung, type PackageKey } from './packages'
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
export type AnalysisPack = {
  at: string; by: string | null; quotationId: string
  effectiveDate: string; basis: 'new_business' | 'renewal'; currentInsurer: string | null
  employees: number; dependants: number
  suggested: PackageKey; because: string
  excluded: string[]
  rungs: AnalysisRung[]
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

export async function runAnalysis(input: {
  quotationId: string; members: Member[]; effectiveDate: string; basis: 'new_business' | 'renewal'
  currentInsurer?: string | null; current?: Parameters<typeof suggestedRung>[1]; suggested?: PackageKey | null; excluded?: string[]; by?: string | null
}): Promise<AnalysisPack> {
  const current = input.currentInsurer ? insurerKey(input.currentInsurer) : null
  const other: 'new_business' | 'renewal' = input.basis === 'renewal' && current ? 'new_business' : input.basis
  const excludedKeys = new Set((input.excluded ?? []).map(insurerKey).filter(Boolean))
  const rungs: AnalysisRung[] = []
  let employees = 0, dependants = 0
  type Run = Awaited<ReturnType<typeof priceBuilder>>
  const toRows = (r: Run, basis: 'new_business' | 'renewal', keep: (k: InsurerKey) => boolean, variant: AnalysisInsurer['variant']): AnalysisInsurer[] =>
    r.insurers.filter(i => keep(i.insurer)).map(i => {
      const cells = r.grids[i.rate_table_id]?.['All employees'] ?? []
      return {
        rate_table_id: i.rate_table_id, insurer_name: i.insurer_name, insurer: i.insurer, basis, variant, excluded: excludedKeys.has(i.insurer),
        net: Math.round(i.net * 100) / 100, gst: i.gst, total: i.total, by_product: i.by_product, unpriced: i.gaps.length,
        plans: Object.fromEntries(cells.map(c => [c.cover, c.plan])), notes: cells.filter(c => c.note || c.none).map(c => `${c.cover}: ${c.note ?? c.none}`),
      }
    })
  for (const p of PACKAGES) {
    const cat = [{ name: 'All employees', requirement: p.requirement, overrides: {} }]
    const main = await priceBuilder({ members: input.members, categories: cat, effective_date: input.effectiveDate, basis: input.basis, tier_b: false })
    const rest = other === input.basis ? main : await priceBuilder({ members: input.members, categories: cat, effective_date: input.effectiveDate, basis: other, tier_b: false })
    employees = main.employees; dependants = main.dependants
    const rows: AnalysisInsurer[] = [...toRows(main, input.basis, k => k === current, null), ...toRows(rest, other, k => k !== current, null)]
    // The co-insurance variants, in the same run: QBE's 20% co-insurance plan and RCC's Plan 2B,
    // where the rung is a private ward and the insurer priced a plain plan.
    const overrides: Record<string, string> = {}
    for (const row of rows) {
      const ghs = row.plans.GHS ?? ''
      if (row.insurer === 'qbe' && /Private/.test(ghs) && !/co-insurance/.test(ghs)) overrides[`${row.rate_table_id}|GHS`] = `${ghs} · 20% co-insurance`
      if (row.insurer === 'rcc' && /Plan 2A/.test(ghs)) overrides[`${row.rate_table_id}|GHS`] = 'Plan 2B (PTE 1-bed, 20% co-pay)'
    }
    if (Object.keys(overrides).length) {
      const vcat = [{ name: 'All employees', requirement: p.requirement, overrides }]
      const keys = new Set(Object.keys(overrides).map(k => k.split('|')[0]))
      const vmain = await priceBuilder({ members: input.members, categories: vcat, effective_date: input.effectiveDate, basis: input.basis, tier_b: false })
      const vrest = other === input.basis ? vmain : await priceBuilder({ members: input.members, categories: vcat, effective_date: input.effectiveDate, basis: other, tier_b: false })
      const variants = [...toRows(vmain, input.basis, k => k === current, 'co-insurance'), ...toRows(vrest, other, k => k !== current, 'co-insurance')]
        .filter(v => keys.has(v.rate_table_id) && /co-insurance|co-pay/.test(v.plans.GHS ?? ''))
      rows.push(...variants)
    }
    const insurers = rows.sort((a, b) => a.net - b.net)
    rungs.push({ key: p.key, name: p.name, facts: p.facts, insurers, best: bestOnRung(insurers) })
  }
  const s = suggestedRung(input.basis, input.current ?? null)
  const notes: string[] = []
  if (other !== input.basis) notes.push(`${input.currentInsurer} priced as a renewal; every other insurer as new business, which is how a switch is underwritten.`)
  notes.push('Net of GST. An insurer\'s unpriced lines are members its card does not price on this rung (age outside the plan, or a cover it does not sell); the total excludes them.')
  const pack: AnalysisPack = {
    at: new Date().toISOString(), by: input.by ?? null, quotationId: input.quotationId,
    effectiveDate: input.effectiveDate, basis: input.basis, currentInsurer: input.currentInsurer ?? null,
    employees, dependants, suggested: input.suggested ?? s.key, because: input.suggested ? 'chosen by the broker' : s.because, excluded: input.excluded ?? [], rungs, notes,
  }
  await saveAnalysis(pack)
  const sug = rungs.find(r => r.key === pack.suggested)
  recordHousekeeping({ action: 'gb.scenarios_priced', subject: `EB analysis`, resourceType: 'gb_quotation', resourceId: input.quotationId, basis: `${pack.suggested}${sug?.best ? ` ${sug.best.insurer_name} S$${Math.round(sug.best.net).toLocaleString('en-SG')}` : ''}; five packages at every insurer`, metadata: { by: input.by ?? null } })
  return pack
}
