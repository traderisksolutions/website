/**
 * The client report from Compare cover (13 Nov 2026): today beside the five products with the plans
 * the broker chose, the premium per cover and in total, then every benefit row. It replaces the
 * report written from the analysis run, which priced on the rate cards and disagreed with what the
 * broker chose on Compare cover (one client at Income: S$699,983 against S$405,540).
 *
 * buildCompareReport is pure; tested in src/__tests__/gb-compare-report.test.ts.
 */
import { coverWords } from './compare-words'
import { longDate, sgd } from './report-model'
import type { CompareData } from './compare-cover'

const COVERS = ['Hospital & Surgical', 'Major Medical', 'Outpatient GP', 'Outpatient Specialist', 'Dental', 'Personal Accident']
const sg = (t: string) => t.replace(/(^|[^S])\$/g, '$1S$')

export type ReportColumn = { name: string; total: number | null; delta: number | null; pct: number | null; covers: { words: string; premium: number | null; included: boolean }[] }
export type CompareReport = {
  company: string; effectiveDate: string; basis: string; lives: number; employees: number; prepared: string
  covers: string[]
  /** The category whose plans the report shows when the census has more than one. */
  shownFor: string | null
  today: ReportColumn & { label: string; source: 'last_year' | 'renewal' | null }
  products: ReportColumn[]
  rows: { cover: string; label: string; values: string[] }[]                      // today first, then the products
  notes: string[]
  workbook: string
}

export function buildCompareReport(d: CompareData & { company: string | null }, prepared = new Date().toISOString().slice(0, 10)): CompareReport {
  const cat = d.categories[0]?.key ?? ''
  const rule = (p: string, cv: string) => d.rules.find(r => r.product === p && r.cover === cv)
  const pick = (p: string, c: string, cv: string) => d.picks[p]?.[c]?.[cv] ?? ''
  const price = (p: string, c: string, cv: string) => { const plan = pick(p, c, cv); return plan ? d.prices[c]?.[p]?.[cv]?.[plan] ?? null : null }
  // Covers someone has: today's or any product's.
  const covers = COVERS.filter(cv => d.today.benefits[cat]?.[cv] || d.products.some(p => pick(p, cat, cv)))
  const todayTotal = d.today.total
  const products: ReportColumn[] = d.products.map(p => {
    let total = 0
    for (const c of d.categories) for (const cv of COVERS) total += price(p, c.key, cv) ?? 0
    return {
      name: p, total, delta: todayTotal != null ? total - todayTotal : null, pct: todayTotal ? (total - todayTotal) / todayTotal : null,
      covers: covers.map(cv => {
        const plan = pick(p, cat, cv)
        const sum = d.categories.reduce<number | null>((a, c) => { const v = price(p, c.key, cv); return v == null ? a : (a ?? 0) + v }, null)
        return { words: plan ? sg(coverWords(cv, plan, d.benefits[`${p}|${cv}|${plan}`] ?? {})) : 'None', premium: plan ? sum : null, included: rule(p, cv)?.premium === 'included' }
      }),
    }
  })
  const today = {
    name: 'Today', label: d.today.label, source: d.today.source, total: todayTotal, delta: null, pct: null,
    covers: covers.map(cv => { const b = d.today.benefits[cat]?.[cv]; return { words: b && Object.keys(b).length ? sg(coverWords(cv, 'today', b)) : 'None', premium: d.today.premiums[cat]?.[cv] ?? null, included: false } }),
  }
  const rows: CompareReport['rows'] = []
  for (const cv of covers) for (const id of Object.keys(d.labels).filter(k => d.labels[k][0] === cv)) {
    const values = [d.today.benefits[cat]?.[cv]?.[id] ?? '—', ...d.products.map(p => { const plan = pick(p, cat, cv); return plan ? d.benefits[`${p}|${cv}|${plan}`]?.[id] ?? '—' : '—' })].map(sg)
    if (values.some(v => v !== '—')) rows.push({ cover: cv, label: d.labels[id][1], values })
  }
  const notes = [
    'Annual premiums in Singapore dollars, net of GST. Estimates only: final premiums are subject to insurer underwriting and acceptance.',
    ...(d.today.policy?.gstRemoved ? ["Today's premium is last year's, with 9% GST taken off to compare like with like."] : []),
    ...(d.leftOut ? [`${d.leftOut} foreign-worker lives are priced on their own cover and are not in this comparison.`] : []),
  ]
  return {
    company: d.company ?? 'Quotation', effectiveDate: d.effectiveDate, basis: d.basis === 'renewal' ? 'Renewal' : 'New business', lives: d.lives, employees: d.employees, prepared,
    covers, shownFor: d.categories.length > 1 ? d.categories[0].name : null, today, products, rows, notes, workbook: d.workbook.name,
  }
}

/** The email, written by code from the report's own figures. */
export function reportEmail(m: CompareReport, first: string | null): { subject: string; body: string } {
  const line = (c: CompareReport['products'][number]) => `${c.name}: ${c.total != null ? sgd(c.total) : 'not priced'} a year, net of GST${c.pct != null && c.delta != null ? ` (${c.delta > 0 ? '+' : '−'}${Math.abs(c.pct * 100).toFixed(1)}% against today)` : ''}`
  return {
    subject: `Group benefits comparison for ${m.company}`,
    body: [
      `Dear ${first ?? 'Sir or Madam'},`, '',
      `Please find attached our comparison of group benefits for ${m.company}, for cover from ${longDate(m.effectiveDate)}. It sets today's cover beside five insurers, with the plans we propose and the annual premium for each.`, '',
      ...(m.today.total != null ? [`Today: ${sgd(m.today.total)} a year, net of GST`] : []),
      ...m.products.map(line), '',
      'The premiums are estimates and subject to each insurer’s underwriting. Please let us know which option you would like us to take forward.', '',
      'Kind regards,',
    ].join('\n'),
  }
}
