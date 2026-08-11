/**
 * Pricing Matrix — Phase 4: the deterministic email body for a "Reply in Engagement" hand-off.
 *
 * Builds a plain-text premium comparison (numbers copied from the stored quote — never AI, never
 * recomputed) plus the recommendation when one exists. The broker edits it in the composer before
 * sending; the per-insurer CSVs ride along as attachments.
 */
import type { QuoteResult } from '@/lib/pm-quote'
import type { Recommendation, LegacyRecommendation } from '@/lib/pm-recommend'

export type ReplyQuote = {
  company_name: string | null
  effective_date: string | null
  results: QuoteResult | null
  recommendation?: Recommendation | LegacyRecommendation | null
}

const sgd = (n: number | null | undefined) =>
  typeof n === 'number' ? n.toLocaleString('en-SG', { style: 'currency', currency: 'SGD' }) : '—'

export function buildReplyBody(quote: ReplyQuote): string {
  const insurers = (quote.results?.insurers ?? []).filter(i => !i.error)
  const lines: string[] = []

  lines.push(`Please find below our group employee benefits premium comparison${quote.company_name ? ` for ${quote.company_name}` : ''} (net annual premium, excluding GST).`)
  if (quote.effective_date) lines.push(`Policy effective date: ${quote.effective_date}.`)
  lines.push('')

  for (const ins of insurers) {
    lines.push(ins.insurer_name)
    for (const l of ins.coverage_lines) {
      const v = ins.by_line?.[l.code]
      if (typeof v === 'number') lines.push(`  ${l.label}: ${sgd(v)}`)
    }
    lines.push(`  Total annual premium (net): ${sgd(ins.grand)}  (avg ${sgd(ins.avg_per_life)}/life, ${ins.member_count} lives)`)
    lines.push('')
  }

  const rec = quote.recommendation
  if (rec && 'narrative' in rec) {
    if (rec.headline) lines.push(rec.headline)
    lines.push(rec.narrative)
    lines.push('')
  } else if (rec?.recommendation) {
    lines.push(`Our recommendation: ${rec.recommendation}`)
    if (rec.headline) lines.push(rec.headline)
    if (rec.rationale) lines.push(rec.rationale)
    lines.push('')
  }

  lines.push('Attached is a CSV per insurer with the full per-employee breakdown. Happy to walk through the options.')
  return lines.join('\n')
}
