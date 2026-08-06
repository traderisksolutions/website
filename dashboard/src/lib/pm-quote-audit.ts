/**
 * Renders the "how we got this number" quote audit trail — plain-English, per insurer, built
 * purely from QuoteAudit (already computed deterministically by pm-calc.ts and stored on the
 * quotation at creation time) plus review-provenance counts (resolved reconciliation issues +
 * human edits, both already tracked elsewhere). No AI call, no re-derivation of any number.
 */
import type { QuoteResult } from '@/lib/pm-quote'

export type ReviewHistory = { resolvedIssues: number; humanEdits: number }

export function renderQuoteAuditText(result: QuoteResult, history: Record<string, ReviewHistory>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const ins of result.insurers) {
    if (ins.error || !ins.audit) { out[ins.calculator_id] = ins.error ?? 'No pricing available for this insurer.'; continue }
    const a = ins.audit
    const parts: string[] = []

    const basisLabel = a.quote_basis === 'renewal' ? 'Renewal' : 'New Business'
    const ageBasisLabel = a.age_basis === 'ANB' ? 'Age Next Birthday' : a.age_basis === 'ALB' ? 'Age Last Birthday' : null
    parts.push(`Priced for ${a.headcount} life${a.headcount === 1 ? '' : 's'} as of ${a.effective_date}, on a ${basisLabel} basis${ageBasisLabel ? ` (${ageBasisLabel})` : ''}.`)

    if (a.loading) {
      const sign = a.loading.pct > 0 ? '+' : ''
      const exclNote = a.loading.excluded_codes.length ? `, excluding ${a.loading.excluded_codes.join(', ')} which the insurer prices flat regardless of group size` : ''
      parts.push(`A ${sign}${a.loading.pct}% group-size adjustment applied for a group of ${a.headcount}${exclNote}.`)
    }

    if (a.gst) {
      parts.push(a.gst.inclusive
        ? `The insurer's rates are GST-inclusive; this quote shows the net premium with ${Math.round(a.gst.rate * 100)}% GST backed out.`
        : `GST is not included in these rates.`)
    }

    if (a.basis_excluded_bands?.length) {
      parts.push(`The insurer doesn't price these age bands on a ${basisLabel} quote: ${a.basis_excluded_bands.join(', ')}.`)
    }

    const h = history[ins.calculator_id]
    if (h && (h.resolvedIssues > 0 || h.humanEdits > 0)) {
      const bits: string[] = []
      if (h.resolvedIssues > 0) bits.push(`${h.resolvedIssues} AI-extraction disagreement${h.resolvedIssues === 1 ? '' : 's'} resolved by a human reviewer`)
      if (h.humanEdits > 0) bits.push(`${h.humanEdits} value${h.humanEdits === 1 ? '' : 's'} hand-edited`)
      parts.push(`Before approval, this rate table had ${bits.join(' and ')}.`)
    }

    out[ins.calculator_id] = parts.join(' ')
  }
  return out
}
