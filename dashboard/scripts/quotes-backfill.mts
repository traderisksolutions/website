/**
 * Reads insurers' quotations, indications and bind confirmations out of past inbound mail into
 * placement_quotes (src/lib/placement/quote-read.ts).
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/quotes-backfill.mts dry   [days]
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/quotes-backfill.mts write [days]
 *
 * dry    reads every candidate and prints what would be captured, with the excerpt each premium
 *        was read from, so the figures can be checked against the mail. Writes nothing, calls no model.
 * write  captures. Idempotent: a message already captured is skipped.
 * Needs migration 20261103_quotes.sql.
 */
import { sbTry, enc, bareEmail, emailDomain } from '@/lib/crm/db'
import { captureQuoteFromMessage, isQuoteLike, type CaptureResult } from '@/lib/placement/quote-read'

const [mode, daysArg] = process.argv.slice(2)
if (mode !== 'dry' && mode !== 'write') { console.error('usage: quotes-backfill.mts dry|write [days]'); process.exit(2) }
const days = Number(daysArg ?? 365)
const since = new Date(Date.now() - days * 864e5).toISOString()
type Row = Record<string, any>

const parties = await sbTry<Row[]>('companies?kind=in.(insurer,tpa)&select=id,company_name,domains', [])
const domains = new Set<string>(parties.flatMap(p => (p.domains ?? []).map((d: string) => d.toLowerCase())))

const msgs: Row[] = []
for (let off = 0; ; off += 1000) {
  const page = await sbTry<Row[]>(`email_messages?direction=eq.inbound&deleted_at=is.null&sent_at=gte.${enc(since)}&select=id,from_address,subject,body_text,has_attachments,sent_at&order=sent_at.asc&offset=${off}&limit=1000`, [])
  msgs.push(...page.filter(m => domains.has(emailDomain(bareEmail(m.from_address)))))
  if (page.length < 1000) break
}
console.log(`inbound from insurers/TPAs since ${since.slice(0, 10)}: ${msgs.length}`)

// Cheap pre-filter on body + subject; attachments are read inside the capture.
const attByMsg = new Map<string, number>()
for (let i = 0; i < msgs.length; i += 100) {
  const ids = msgs.slice(i, i + 100).map(m => m.id)
  for (const a of await sbTry<Row[]>(`email_attachments?message_id=in.(${ids.join(',')})&select=message_id`, [])) attByMsg.set(a.message_id, (attByMsg.get(a.message_id) ?? 0) + 1)
}
const candidates = msgs.filter(m => isQuoteLike(m.subject, m.body_text) || (attByMsg.get(m.id) ?? 0) > 0)
console.log(`candidates (quote words in body, or attachments): ${candidates.length}`)

const counts: Record<string, number> = {}
const tally = (k: string) => (counts[k] = (counts[k] ?? 0) + 1)
const samples: CaptureResult[] = []
let n = 0
for (const m of candidates) {
  const r = await captureQuoteFromMessage(m.id, { dry: mode === 'dry' })
  if (r.captured) { tally(`captured · ${r.kind} · ${r.read_by} · ${r.confidence}`); if (samples.length < 40) samples.push(r) }
  else tally(`skipped · ${r.reason}`)
  if (++n % 50 === 0) console.log(`… ${n}/${candidates.length}`)
}
console.log(JSON.stringify(counts, null, 1))
if (mode === 'dry') {
  console.log('\nSAMPLE (first 40 captures) — check the premium against the excerpt:')
  for (const s of samples) if (s.captured) console.log(`- ${s.kind} | ${s.product_line ?? '?'} | ${s.currency ?? ''} ${s.premium ?? '-'} | ${s.confidence} | ${s.source}\n    ${(s.excerpt ?? '').slice(0, 160)}`)
}
