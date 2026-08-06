/**
 * Synthesized, human-readable summaries — pure templating over already-approved structured data
 * (RateTable), no AI, no re-reading source files. Two uses: (a) a standing "how this calculator
 * prices" summary generated once at approve time (pm-summary.ts here), and (b) the version-over-
 * version "what changed" summary in approve/route.ts, built from pm-diff.ts's DiffEntry[].
 */
import type { RateTable, LoadingBand } from '@/lib/pm-rates'
import type { DiffEntry } from '@/lib/pm-diff'

const fmtBand = (b: LoadingBand): string => {
  const range = b.max === null ? `${b.min}+` : b.min === b.max ? `${b.min}` : `${b.min}-${b.max}`
  return `${range} lives: ${b.loading_pct > 0 ? '+' : ''}${b.loading_pct}%`
}

/** Plain-English description of how a calculator prices — age basis, coverages/tiers, group-size
 *  loading, GST, quote-basis exclusions. Generated once at approve, stored on pm_calculators. */
export function buildWorkbookAnalysisSummary(rt: RateTable): string {
  const parts: string[] = []
  const covCount = new Set(rt.coverages.map(c => c.code)).size
  const planCount = new Set(rt.coverages.flatMap(c => (c.plans ?? []).map(p => p.code))).size
  const names = Array.from(new Set(rt.coverages.map(c => c.full_name || c.code)))
  const ageBasisLabel = rt.age_basis === 'ANB' ? 'Age Next Birthday' : rt.age_basis === 'ALB' ? 'Age Last Birthday' : 'an unspecified age basis'
  parts.push(`Prices ${covCount} coverage${covCount === 1 ? '' : 's'} (${names.join(', ')}) across ${planCount} plan tier${planCount === 1 ? '' : 's'}, using ${ageBasisLabel}.`)

  if (rt.rules.group_size_loading?.length) {
    const bands = rt.rules.group_size_loading.map(fmtBand).join('; ')
    const excl = rt.rules.loading_excludes?.length ? ` This adjustment doesn't apply to ${rt.rules.loading_excludes.join(', ')}.` : ''
    parts.push(`Premiums are adjusted by group size: ${bands}.${excl}`)
  } else {
    parts.push('No group-size loading or discount is applied — premiums are flat regardless of headcount.')
  }

  if (rt.rules.gst) {
    parts.push(rt.rules.gst.inclusive
      ? `Rates are quoted GST-inclusive at ${Math.round(rt.rules.gst.rate * 100)}%; quotes show the net amount.`
      : 'GST is not included in the quoted rates.')
  }

  const nb = rt.rules.quote_basis_exclusions?.new_business
  const rn = rt.rules.quote_basis_exclusions?.renewal
  if (nb?.length) parts.push(`These age bands are only priced on renewal, not new business: ${nb.join(', ')}.`)
  if (rn?.length) parts.push(`These age bands are only priced on new business, not renewal: ${rn.join(', ')}.`)

  return parts.join(' ')
}

/** Plain-English "what changed since the last approved version" from a DiffEntry[] (pm-diff.ts).
 *  Rate-cell changes are summarised with a direction/percentage; everything else is listed as-is. */
export function renderChangeSummary(rateDiff: DiffEntry[], termDiff: DiffEntry[]): string {
  if (rateDiff.length === 0 && termDiff.length === 0) return 'No changes from the previous approved version.'
  const parts: string[] = []

  const priceChanges = rateDiff.filter(d => d.path.startsWith('coverages.') && typeof d.from === 'number' && typeof d.to === 'number')
  const otherRateChanges = rateDiff.filter(d => !priceChanges.includes(d))
  if (priceChanges.length) {
    const bits = priceChanges.slice(0, 12).map(d => {
      const from = d.from as number, to = d.to as number
      const pct = from !== 0 ? `${to > from ? '+' : ''}${(((to - from) / from) * 100).toFixed(1)}%` : 'new rate'
      return `${d.path.replace(/^coverages\./, '')}: ${from} → ${to} (${pct})`
    })
    parts.push(`Rate changes: ${bits.join('; ')}${priceChanges.length > 12 ? `; and ${priceChanges.length - 12} more` : ''}.`)
  }
  if (otherRateChanges.length) {
    parts.push(`Rule changes: ${otherRateChanges.map(d => `${d.path} (${JSON.stringify(d.from)} → ${JSON.stringify(d.to)})`).join('; ')}.`)
  }
  if (termDiff.length) {
    const added = termDiff.filter(d => d.from === null)
    const removed = termDiff.filter(d => d.to === null)
    const changed = termDiff.filter(d => d.from !== null && d.to !== null)
    if (added.length) parts.push(`Added benefits: ${added.map(d => d.path).join('; ')}.`)
    if (removed.length) parts.push(`Removed benefits: ${removed.map(d => d.path).join('; ')}.`)
    if (changed.length) parts.push(`Changed benefits: ${changed.map(d => `${d.path} (${d.from} → ${d.to})`).join('; ')}.`)
  }
  return parts.join(' ')
}
