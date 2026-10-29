/**
 * The comparison the client receives and the pick that comes back. Pure: the table in the email
 * is built from the stored figures, never written by the model, so what the client reads is what
 * the insurers quoted. The model writes only the words around it.
 *
 * A table travels in the draft body as pipe rows ("| a | b |"), which a broker can still edit in
 * the review box; bodyToHtml turns each block of pipe rows into an HTML table when it is sent.
 */
import { quoteExpired } from './position'
import { findTier } from './match'
import type { LinePosition, PlacementQuote, PlacementShare } from './types'

export type EmailQuote = { quote: PlacementQuote; insurer: string; product: string | null; option: string }
export type EmailLine = { label: string; quotes: EmailQuote[]; pending: string[]; declined: string[] }

const money = (n: number) => n.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const cellText = (s: string) => s.replace(/\|/g, '/').replace(/\s+/g, ' ').trim()

/** The option a quote prices, in words: its tier, else the line's limit, else "As asked". */
export function optionLabel(pos: LinePosition, q: PlacementQuote): string {
  if (q.tier_id) return pos.tiers.find(t => t.id === q.tier_id)?.label ?? q.tier_label ?? 'Option'
  return q.limit_text?.trim() || (pos.round?.spec?.limit ?? pos.line.spec?.limit ?? '').trim() || 'As asked'
}

/**
 * Every current, unexpired quote per line, or only those in `include` when the broker picked a
 * partial set. Pending lists who is still to price which option, so a partial comparison says so.
 */
export function emailLines(positions: LinePosition[], include: Set<string> | null, now = new Date()): EmailLine[] {
  return positions.map(pos => {
    const quotes: EmailQuote[] = []
    for (const dp of pos.dispatches) {
      for (const q of dp.quotes) {
        if (quoteExpired(q, now) || q.status === 'not_chosen') continue
        if (include && !include.has(q.id)) continue
        quotes.push({ quote: q, insurer: dp.dispatch.insurer_name, product: dp.dispatch.insurer_product_name ?? null, option: optionLabel(pos, q) })
      }
    }
    for (const q of pos.engineQuotes) {
      if (quoteExpired(q, now) || (include && !include.has(q.id))) continue
      quotes.push({ quote: q, insurer: q.insurer_name, product: q.plan_label ?? null, option: optionLabel(pos, q) })
    }
    const asked = pos.tiers.filter(t => t.status === 'asked')
    const pending = pos.dispatches.flatMap(dp => {
      const s = dp.dispatch.status
      if (s === 'declined' || s === 'withdrawn' || s === 'drafted') return []
      if (!dp.quote) return [dp.dispatch.insurer_name]
      const missing = asked.filter(t => !dp.quotes.some(q => q.tier_id === t.id)).map(t => t.label)
      return missing.length ? [`${dp.dispatch.insurer_name} (${missing.join(', ')})`] : []
    })
    const declined = pos.dispatches.filter(dp => dp.dispatch.status === 'declined').map(dp => dp.dispatch.insurer_name)
    return { label: pos.line.label ?? pos.line.product_line, quotes: sortQuotes(quotes), pending, declined }
  })
}

/** Insurer, then option in the order the line lists them, so each insurer's options sit together. */
function sortQuotes(qs: EmailQuote[]): EmailQuote[] {
  return [...qs].sort((a, b) => a.insurer.localeCompare(b.insurer) || (a.quote.premium_amount ?? Infinity) - (b.quote.premium_amount ?? Infinity))
}

export const TABLE_HEAD = ['Insurer · plan', 'Option', 'Premium (S$)', 'Per head (S$)', 'Limit', 'Excess', 'Valid until', 'Key benefits']

/** One line's quotes as pipe rows, transparent: insurer and product named on every row. Blanks stay blank. */
export function comparisonTable(line: EmailLine): string {
  const fmtDate = (d: string | null) => d ? new Date(`${d}T00:00:00+08:00`).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore' }) : ''
  const fig = (n: number | null | undefined, text: string | null | undefined, cur: string | null) =>
    n != null ? `${cur && cur !== 'SGD' ? cur + ' ' : ''}${money(n)}` : (text ?? '')
  const rows = line.quotes.map(({ quote: q, insurer, product, option }) => [
    product ? `${insurer} · ${product}` : insurer,
    option,
    fig(q.premium_amount, q.premium_text, q.currency),
    fig(q.premium_per_head_amount, q.premium_per_head_text, q.currency),
    q.limit_text ?? '',
    q.excess_text ?? '',
    q.valid_until ? fmtDate(q.valid_until) : (q.validity_text ?? ''),
    q.key_terms.slice(0, 3).join('; '),
  ])
  return [TABLE_HEAD, ...rows].map(r => `| ${r.map(cellText).join(' | ')} |`).join('\n')
}

/** The body: the model's opening, then per line a heading, the table and who is still to reply; then the model's close. */
export function comparisonBody(parts: { opening: string; differences: string; closing: string }, lines: EmailLine[]): string {
  const blocks = [parts.opening.trim()]
  for (const l of lines) {
    if (l.quotes.length === 0 && l.pending.length === 0) continue
    const out = [`${l.label}`]
    out.push(l.quotes.length ? comparisonTable(l) : 'No quotes yet.')
    const notes = [l.pending.length ? `Still to come: ${l.pending.join('; ')}.` : '', l.declined.length ? `Declined: ${l.declined.join(', ')}.` : ''].filter(Boolean).join(' ')
    blocks.push(out.join('\n\n') + (notes ? `\n\n${notes}` : ''))
  }
  if (parts.differences.trim()) blocks.push(parts.differences.trim())
  blocks.push(parts.closing.trim())
  return blocks.filter(Boolean).join('\n\n')
}

/** The client's pick, as the model read it, matched to a quote on the line. Null when it is not clear. */
export function resolvePick(positions: LinePosition[], pick: { line_label: string; insurer: string; option: string | null }): { pos: LinePosition; quote: PlacementQuote } | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const pos = positions.find(x => norm(x.line.label ?? x.line.product_line) === norm(pick.line_label)) ?? (positions.length === 1 ? positions[0] : null)
  if (!pos) return null
  const ins = norm(pick.insurer)
  const byInsurer = pos.dispatches.filter(dp => {
    const n = norm(dp.dispatch.insurer_name)
    return ins && (n === ins || n.includes(ins) || ins.includes(n))
  })
  if (byInsurer.length !== 1) return null
  const quotes = byInsurer[0].quotes
  if (quotes.length === 0) return null
  if (!pick.option) return quotes.length === 1 ? { pos, quote: quotes[0] } : null
  const tier = findTier(pick.option, pos.tiers)
  const q = tier ? quotes.find(x => x.tier_id === tier.id) : quotes.find(x => !x.tier_id && norm(optionLabel(pos, x)) === norm(pick.option!))
  return q ? { pos, quote: q } : null
}

/** When each quote last went to the client: quote id → the latest sent date. */
export function sharedOn(shares: PlacementShare[] | undefined): Map<string, string> {
  const out = new Map<string, string>()
  for (const s of shares ?? []) {
    if (s.status !== 'sent' || !s.sent_at) continue
    for (const id of s.quote_ids) {
      const prev = out.get(id)
      if (!prev || s.sent_at > prev) out.set(id, s.sent_at)
    }
  }
  return out
}

// ── Plain text to HTML ──────────────────────────────────────────────────────────────────────

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const isPipeRow = (l: string) => /^\s*\|.*\|\s*$/.test(l)

function tableHtml(rows: string[]): string {
  const cells = rows.map(r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()))
    .filter(r => !r.every(c => /^:?-{2,}:?$/.test(c)))   // a markdown separator row, if a broker typed one
  const td = 'border:1px solid #d5d9d4;padding:4px 8px;text-align:center;font-size:13px;white-space:nowrap'
  const [head, ...body] = cells
  return `<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:4px 0">`
    + `<thead><tr>${head.map(c => `<th style="${td};background:#f1f2ee;font-weight:600">${escapeHtml(c)}</th>`).join('')}</tr></thead>`
    + `<tbody>${body.map(r => `<tr>${r.map(c => `<td style="${td}">${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
}

/** Plain text → HTML: a blank line splits a `<p>`, a single newline is a `<br>`, a block of pipe rows is a table. */
export function bodyToHtml(body: string): string {
  return body.replace(/\r\n/g, '\n').trim().split(/\n{2,}/).map(block => {
    const lines = block.split('\n')
    if (lines.length >= 2 && lines.every(isPipeRow)) return tableHtml(lines)
    return `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`
  }).join('')
}
