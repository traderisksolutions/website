/**
 * The client email for one product on the compare page (Jarod, 13 Nov 2026): the price against
 * today, then where it pays more and where it pays less, row by row from the brochures, then each
 * cover with its premium. Code finds every difference and ranks them; a model only smooths the
 * wording, and a rewrite that changes any figure is discarded (keepsFigures).
 *
 * compareFacts and codeEmail are pure; tested in src/__tests__/gb-compare-cover.test.ts.
 */
import { changeOf, coverWords, amountOf } from './compare-words'
import type { CompareData, Picks } from './compare-cover'

const COVERS = ['Hospital & Surgical', 'Major Medical', 'Outpatient GP', 'Outpatient Specialist', 'Dental', 'Personal Accident']
const sg = (t: string) => t.replace(/(^|[^S])\$/g, '$1S$')
const money = (n: number) => `S$${Math.round(n).toLocaleString('en-SG')}`
const day = (iso: string) => { const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) }
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${money(Math.abs(n))}`

export type Highlight = { cover: string; label: string; today: string; theirs: string; change: string; weight: number }
export type CompareFacts = {
  company: string; product: string; lives: number; effectiveDate: string
  todayLabel: string; todayTotal: number | null; total: number; delta: number | null; pct: number | null
  covers: { cover: string; today: string; theirs: string; premium: number | null; delta: number | null }[]
  more: Highlight[]; less: Highlight[]
}

function weightOf(today: string, theirs: string, text: string): number {
  if (text === 'more' || text === 'less' || text === 'new' || text === 'none') return 10
  const a = amountOf(theirs), b = amountOf(today)
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b) || b === 0) return 0
  return Math.abs(Math.log(a / b))
}

/** Every difference between today and one product, for the largest category. Pure. */
export function compareFacts(d: CompareData & { company: string | null }, product: string, picks: Picks): CompareFacts {
  const cat = d.categories[0]?.key ?? ''
  const theirPick = (cv: string) => picks[cat]?.[cv] ?? ''
  const price = (p: string | null, c: string, cv: string, plan: string) => p && plan ? d.prices[c]?.[p]?.[cv]?.[plan] ?? null : null
  // Today: last year's policy and schedule as the compare page shows it (src/lib/gb/compare-cover.ts).
  const todayOf = (cv: string) => d.today.benefits?.[cat]?.[cv] ?? {}
  const todayTotal = d.today.total ?? d.today.lastYearTotal
  let total = 0
  for (const c of d.categories) for (const cv of COVERS) total += price(product, c.key, cv, picks[c.key]?.[cv] ?? '') ?? 0
  const covers = COVERS.map(cv => {
    const pp = theirPick(cv), tb = todayOf(cv)
    const pb = d.benefits[`${product}|${cv}|${pp}`] ?? {}
    const premium = price(product, cat, cv, pp), base = d.today.premiums?.[cat]?.[cv] ?? null
    return { cover: cv, today: coverWords(cv, Object.keys(tb).length ? 'today' : '', tb), theirs: coverWords(cv, pp, pb), premium, delta: premium != null && base != null && base > 0 ? premium - base : null }
  }).filter(c => c.theirs !== 'None' || c.today !== 'None')
  const more: Highlight[] = [], less: Highlight[] = []
  for (const id of Object.keys(d.labels)) {
    const [cv, label] = d.labels[id]
    const tv = todayOf(cv)[id]
    const pv = (d.benefits[`${product}|${cv}|${theirPick(cv)}`] ?? {})[id]
    if (tv == null || pv == null) continue
    const payer = /co-?pay|co-?insur/i.test(label)
    const c = changeOf(pv, tv, payer)
    if (c.tone === 'same' || id === 'ghs.annual_limit' && !/as charged/i.test(pv + tv)) continue
    const h = { cover: cv, label, today: sg(tv), theirs: sg(pv), change: c.text, weight: weightOf(tv, pv, c.text) }
    ;(c.tone === 'up' ? more : less).push(h)
  }
  const rank = (l: Highlight[]) => l.sort((a, b) => b.weight - a.weight).slice(0, 6)
  return {
    company: d.company ?? 'your company', product, lives: d.lives, effectiveDate: d.effectiveDate,
    todayLabel: d.today.label, todayTotal, total, delta: todayTotal != null ? total - todayTotal : null, pct: todayTotal ? (total - todayTotal) / todayTotal : null,
    covers, more: rank(more), less: rank(less),
  }
}

/** The email, written by code from the facts. Pure. */
export function codeEmail(f: CompareFacts, firstName: string | null): { subject: string; body: string } {
  const pct = f.pct == null ? '' : `, ${f.pct > 0 ? '+' : '−'}${Math.abs(f.pct * 100).toFixed(1)}% against today's ${money(f.todayTotal!)}`
  const line = (h: Highlight) => `- ${h.label}: ${h.theirs}, against ${h.today} today (${h.change})`
  const lines = [
    `Dear ${firstName ?? 'Sir or Madam'},`, '',
    `Here is ${f.product} for ${f.company}, ${f.lives} lives from ${day(f.effectiveDate)}: ${money(f.total)} a year, net of GST${pct}.`, '',
  ]
  if (f.more.length) lines.push('Where it pays more than your current plan:', ...f.more.map(line), '')
  if (f.less.length) lines.push('Where it pays less:', ...f.less.map(line), '')
  lines.push('Cover by cover:', ...f.covers.map(c => `- ${c.cover}: ${c.theirs}${c.premium != null ? `, ${money(c.premium)}${c.delta != null ? ` (${signed(c.delta)})` : ''}` : ''}`), '')
  lines.push('We can go through which of these matter most to your team, and adjust any cover up or down from here.', '', 'Kind regards,')
  return { subject: `Employee benefits: ${f.product} beside your current plan`, body: lines.join('\n') }
}

/** Facts, code email, tone pass. Server only. */
export async function composeCompareDraft(quotationId: string, product: string, picksOverride: Picks | null, by: string | null): Promise<{ facts: CompareFacts; subject: string; body: string; rewritten: boolean }> {
  const { loadCompare } = await import('./compare-cover')
  const { tonePass } = await import('./client-draft')
  const d = await loadCompare(quotationId)
  if ('error' in d) throw new Error(d.error)
  if (!d.products.includes(product as never)) throw new Error('Unknown product')
  const facts = compareFacts(d, product, picksOverride ?? d.picks[product])
  const email = codeEmail(facts, null)
  const tone = await tonePass(email.body, by, quotationId)
  return { facts, subject: email.subject, body: tone.body, rewritten: tone.rewritten }
}
