/**
 * Request to insurers, built by hand (Policy page › Request): the line's fields as a list a person
 * ticks and edits, and the email written from it in code. No model writes it. Pure.
 */
import { LINE_SPECS, fieldLabel } from './lines'
import { parseMoney } from './spec'
import type { Spec } from './types'

export type RequestItem = { key: string; label: string; hint: string; value: string; included: boolean }

/** The fields a request for this line asks for, in the line's order, with what the spec already holds. */
export function requestItems(productLine: string, spec: Spec, clientName: string): RequestItem[] {
  const x = spec.fields ?? {}
  const own = LINE_SPECS[productLine]?.fields ?? []
  const base: RequestItem[] = [
    { key: 'insured', label: 'Insured', hint: 'legal name', value: spec.insured ?? clientName, included: true },
    ...own.map(f => ({ key: f.key, label: f.label, hint: f.hint, value: x[f.key] ?? '', included: true })),
  ]
  // A line with no field list of its own asks the general facts.
  if (!own.length) base.push(
    { key: 'scope', label: 'Business and scope', hint: 'what the insured does and what the cover is for', value: spec.scope ?? '', included: true },
    { key: 'limit', label: 'Limit or sum insured', hint: 'verbatim with currency', value: spec.limit ?? '', included: true },
    { key: 'period', label: 'Period of insurance', hint: 'from and to', value: spec.period ?? '', included: true },
  )
  base.push({ key: 'notes', label: 'Notes', hint: 'anything else the insurer should know', value: spec.notes ?? '', included: !!spec.notes })
  return base
}

/** The items written back into the line's spec: general keys on the spec, the rest under fields. */
export function specFromItems(spec: Spec, items: RequestItem[]): Spec {
  const out: Spec = { ...spec, fields: { ...(spec.fields ?? {}) } }
  for (const it of items) {
    const v = it.value.trim()
    if (['insured', 'scope', 'limit', 'period', 'notes'].includes(it.key)) (out as Record<string, unknown>)[it.key] = v || undefined
    else if (v) out.fields![it.key] = v
    else delete out.fields![it.key]
  }
  return out
}

/** The ticked items with no value: what the client still owes. */
export const missingItems = (items: RequestItem[]) => items.filter(i => i.included && !i.value.trim() && i.key !== 'notes')

/** The subject in the house pattern: "(TRS) Client | Line renewal 2027". */
export function requestSubject(clientName: string, lineLabel: string, requestType: string | null, inception: string | null): string {
  const year = inception ? inception.slice(0, 4) : ''
  const kind = requestType === 'renewal' ? `renewal${year ? ` ${year}` : ''}` : requestType === 'new' ? 'quotation' : requestType === 'endorsement' ? 'endorsement' : 'quotation'
  return `(TRS) ${clientName} | ${lineLabel} ${kind}`.trim()
}

/** The email body from the ticked items. One draft serves every insurer, so it greets the underwriter. */
export function requestBody(i: { lineLabel: string; items: RequestItem[]; attachments: string[]; deadline: string | null; sender: string | null }): string {
  const ticked = i.items.filter(x => x.included)
  const missing = missingItems(i.items)
  const lines = ['Dear Underwriter,', '', `Please find below a client we would like to place for ${i.lineLabel}:`, '']
  for (const it of ticked) {
    const v = it.value.trim() || 'to follow'
    lines.push(v.includes('\n') ? `${it.label}:\n${v}` : `${it.label}: ${v}`)
  }
  lines.push('')
  if (i.attachments.length) lines.push(`Attached: ${i.attachments.map(a => a.replace(/\.(pdf|xlsx?|docx?|csv)$/i, '')).join('; ')}.`)
  if (missing.length) lines.push(`${missing.map(m => m.label).join(', ')} will follow.`)
  if (i.deadline) lines.push(`We would appreciate your terms by ${i.deadline}.`)
  lines.push('', 'Please let me know if you need further information. Thank you.', '', 'Warm regards,', i.sender ?? '')
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export type ManualQuote = { premium_text: string; premium_amount: number; excess_text: string | null; limit_text: string | null; valid_until: string | null; note: string | null }

/** A quote typed by a person from an insurer's reply: premium required and positive; dates checked. */
export function manualQuoteFrom(b: Record<string, unknown>): { quote: ManualQuote } | { error: string } {
  const premium = typeof b.premium === 'string' || typeof b.premium === 'number' ? String(b.premium).trim() : ''
  const amount = parseMoney(premium)?.amount ?? (Number(premium.replace(/[^0-9.]/g, '')) || null)
  if (!premium || !amount || amount <= 0) return { error: 'Enter the premium the insurer quoted' }
  const text = (k: string) => (typeof b[k] === 'string' && (b[k] as string).trim() ? (b[k] as string).trim().slice(0, 300) : null)
  const valid = text('valid_until')
  if (valid && !(/^\d{4}-\d{2}-\d{2}$/.test(valid) && !Number.isNaN(Date.parse(valid)))) return { error: 'Valid until must be a date' }
  return { quote: { premium_text: premium, premium_amount: amount, excess_text: text('excess'), limit_text: text('limit'), valid_until: valid, note: text('note') } }
}

export { fieldLabel }
