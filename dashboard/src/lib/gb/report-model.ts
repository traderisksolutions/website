/**
 * The client report's content, computed once from a saved quotation, for both the web view and
 * the PDF. Every figure is read from the quotation; nothing is recomputed.
 *
 * Pure. No I/O.
 */
import type { Comparison, Cell } from './compare'
import { BENEFIT_BY_CODE, PRODUCT_BY_CODE } from './canon'
import { resolveProduct } from './resolve'
import { censusProfile, type CensusProfile } from './score'
import { gstApplies } from '../gb-quote'
import type { CoverNames } from './cover-names'

export type ReportQuotation = {
  id: string; company_name: string | null; effective_date: string | null; basis: string | null; member_count: number
  census: { dob?: string | null; age?: number | null; relationship?: string | null }[] | null
  results: { rate_table_id: string; insurer_name: string; by_product: Record<string, number>; gst: number; total: number; missing: number }[]
  category_map: Record<string, Record<string, Record<string, string>>> | null
  benefits_analysis: Comparison | null; notes: string | null; created_at: string; priorities: string | null
}

export type ReportCover = { code: string; abbrev: string; name: string }
export type ReportRow = {
  insurer: string; tableId: string; total: number; gst: number; pepm: number; unpriced: number
  /** Per cover: an amount, or "in GP" for a cover inside another's bundle, or null when not quoted. */
  cells: Record<string, { amount: number | null; inside: string | null; extra: string[]; plan: string } | null>
  notQuoted: string[]
}
export type ReportBenefitTable = {
  cover: string; title: string
  insurers: { tableId: string; insurer: string; plan: string }[]
  rows: { name: string; values: (string | null)[] }[]
}
export type ReportModel = {
  company: string; effectiveDate: string | null; basis: string; prepared: string
  profile: CensusProfile; employees: number
  covers: ReportCover[]; rows: ReportRow[]; benefits: ReportBenefitTable[]
  basisLines: string[]; gstNote: string
}

const cellText = (c: Cell | undefined): string | null => {
  if (!c || c.absent) return null
  if (c.text?.trim()) return c.text.trim()
  const k = c.comparable
  return k.kind === 'sgd' ? `S$${k.n.toLocaleString('en-SG')}` : k.kind === 'percent' ? `${k.n}%` : k.kind === 'as_charged' ? 'As charged' : null
}

export function buildReportModel(q: ReportQuotation, names: CoverNames = {}): ReportModel {
  const profile = censusProfile(q.census ?? [], q.effective_date)
  const employees = profile.employees || q.member_count || 1
  const codesOf = (t: string) => resolveProduct(t).codes
  let asked: string[] = []
  try { asked = (JSON.parse(q.priorities ?? '{}')?.score?.filters?.requiredProducts ?? []) as string[] } catch { /* none */ }
  const coverCodes = (asked.length ? asked : Array.from(new Set(Object.values(q.category_map ?? {}).flatMap(m => Object.keys(m).flatMap(codesOf)))))
    .filter(c => PRODUCT_BY_CODE[c])
    .sort((a, b) => PRODUCT_BY_CODE[a].sortOrder - PRODUCT_BY_CODE[b].sortOrder)
  const covers = coverCodes.map(c => ({ code: c, abbrev: PRODUCT_BY_CODE[c].abbrev, name: names[c] || PRODUCT_BY_CODE[c].name }))

  const rows: ReportRow[] = [...(q.results ?? [])].sort((a, b) => a.total - b.total).map(r => {
    const cells: ReportRow['cells'] = {}
    for (const [title, cats] of Object.entries(q.category_map?.[r.rate_table_id] ?? {})) {
      const all = codesOf(title)
      const mine = all.filter(c => coverCodes.includes(c))
      if (!mine.length) continue
      const plan = Array.from(new Set(Object.values(cats))).join(', ')
      cells[mine[0]] = { amount: r.by_product[title] ?? null, inside: null, extra: all.filter(c => !coverCodes.includes(c)).map(c => PRODUCT_BY_CODE[c]?.abbrev ?? c), plan }
      for (const c of mine.slice(1)) cells[c] = { amount: null, inside: PRODUCT_BY_CODE[mine[0]].abbrev, extra: [], plan }
    }
    for (const c of coverCodes) if (!(c in cells)) cells[c] = null
    return {
      insurer: r.insurer_name, tableId: r.rate_table_id, total: r.total, gst: r.gst, pepm: r.total / 12 / employees,
      unpriced: r.missing, cells, notQuoted: coverCodes.filter(c => !cells[c]).map(c => PRODUCT_BY_CODE[c].abbrev),
    }
  })

  // Headline benefit lines for each cover asked for, one column per insurer.
  const cmp = q.benefits_analysis && Array.isArray(q.benefits_analysis.groups) ? q.benefits_analysis : null
  const benefits: ReportBenefitTable[] = !cmp ? [] : cmp.groups
    .filter(g => coverCodes.includes(g.productCode))
    .map(g => {
      // Insurers in the premium table's order, cheapest first.
      const order = new Map(rows.map((r, i) => [r.tableId, i]))
      const opts = Array.from(new Map(cmp.options.filter(o => o.productCodes.includes(g.productCode)).map(o => [o.key.split(':')[0], o])).values())
        .sort((a, b) => (order.get(a.key.split(':')[0]) ?? 99) - (order.get(b.key.split(':')[0]) ?? 99))
      const rowsH = g.rows.filter(r => BENEFIT_BY_CODE[r.benefit.code]?.headline)
      return {
        cover: g.productCode, title: names[g.productCode] || g.productName,
        insurers: opts.map(o => ({ tableId: o.key.split(':')[0], insurer: o.insurerName, plan: o.planCode })),
        rows: rowsH.map(r => ({
          name: names[r.benefit.code] || r.benefit.name,
          values: opts.map(o => cellText(r.cells.find(c => c.optionKey.split(':')[0] === o.key.split(':')[0]))),
        })),
      }
    })
    .filter(t => t.rows.length)

  const exempt = coverCodes.filter(c => !gstApplies(c)).map(c => (names[c] || PRODUCT_BY_CODE[c].name).toLowerCase())
  return {
    company: q.company_name || 'Untitled', effectiveDate: q.effective_date,
    basis: q.basis === 'renewal' ? 'Renewal' : 'New business', prepared: q.created_at.slice(0, 10),
    profile, employees, covers, rows, benefits,
    basisLines: (q.notes ?? '').split('\n').filter(l => l.trim() && !/^Drafted by|^Thread filed/.test(l))
      .map(l => l.replace(/\s*\[(message|thread):[^\]]*\]/g, '')),
    gstNote: `Premiums include GST at 9%${exempt.length ? `, except ${exempt.join(' and ')}, which ${exempt.length === 1 ? 'is' : 'are'} exempt` : ''}. Per employee per month is the annual total divided by 12 and by ${employees} employee${employees === 1 ? '' : 's'}.`,
  }
}

export const longDate = (iso: string | null) => {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}
export const sgd = (n: number, dp = 0) => `S$${n.toLocaleString('en-SG', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`
