/**
 * Quote capture: an insurer's quotation, indication or bind confirmation read out of its email
 * and attachments into placement_quotes, whether or not the request went through the placement
 * module. Patterns first (no model); the model only when the mail plainly carries a quote the
 * patterns could not read, and it fails soft. Every figure keeps the excerpt it was read from.
 *
 * Mail that answers a dispatch sent by the placement module is left to that module
 * (workflow.ts handleInsurerReply), which files it against the request.
 */
import { callGemini } from '@/lib/ai-call'
import { GEMINI_FLASH } from '@/lib/gemini-models'
import { sb, sbTry, enc, bareEmail, emailDomain } from '@/lib/crm/db'
import { PRODUCT_LINES } from '@/lib/product-lines'
import { attachmentRefBytes } from '@/lib/storage/attachment-bytes'
import { parseMoney } from './spec'
import * as store from './store'
import type { Evidence } from './types'

export type QuoteKind = 'quotation' | 'indication' | 'bind_confirmation' | 'renewal_terms'

export type QuoteRead = {
  kind: QuoteKind
  premium_text: string | null; premium_amount: number | null; currency: string | null
  gst_text: string | null; gst_amount: number | null
  limit_text: string | null; limit_amount: number | null
  per_head_text: string | null; per_head_amount: number | null
  excess_text: string | null
  period_text: string | null; period_from: string | null; period_to: string | null
  validity_text: string | null; valid_until: string | null
  policy_number: string | null
  conditions: string[]
  evidence: Evidence
  confidence: 'high' | 'medium' | 'low'
}

// ── Product line from words ───────────────────────────────────────────────────────────────────

const LINE_WORDS: [string, RegExp][] = [
  ['wica', /\b(wica|work injury|workmen'?s? compensation|workguard)\b/i],
  ['foreign_worker_medical', /\b(fwmi|foreign worker medical|medical insurance for foreign)\b/i],
  ['foreign_worker_bond', /\b(security bond|foreign worker bond)\b/i],
  ['group_health', /\b(ghs|group hospital|hospitalisation|hospitalization|surgical|gp&s|outpatient|gpa|group personal accident|gtl|group term life)\b/i],
  ['group_travel', /\b(business travel|group travel)\b/i],
  ['employee_benefits', /\b(employee benefits?|eb (?:plan|scheme|renewal))\b/i],
  ['keyman', /\b(keyman|key man)\b/i],
  ['professional_indemnity', /\b(professional indemnity|\bpi\b|errors? (?:and|&) omissions)\b/i],
  ['do', /\b(d\s?&\s?o|directors'? (?:and|&) officers)\b/i],
  ['imi', /\b(investment management insurance|\bimi\b)\b/i],
  ['cyber', /\bcyber\b/i],
  ['medical_malpractice', /\b(medical malpractice|medmal)\b/i],
  ['environmental_liability', /\b(environmental (?:impairment|liability)|pollution liability)\b/i],
  ['general_liability', /\b(public liability|general liability|comprehensive general liability|\bcgl\b|\bpl\b|products? liability)\b/i],
  ['construction_car', /\b(contractors?'? all risks?|\bcar\b|erection all risks?|\bear\b)\b/i],
  ['machinery_breakdown', /\b(machinery breakdown)\b/i],
  ['electronic_equipment', /\b(electronic equipment)\b/i],
  ['commercial_vehicle', /\b(motor|vehicle|fleet|commercial vehicle)\b/i],
  ['marine_cargo', /\b(marine cargo|cargo|open cover)\b/i],
  ['stock_throughput', /\b(stock throughput)\b/i],
  ['inland_transit', /\b(inland transit)\b/i],
  ['trade_credit', /\b(trade credit|credit insurance)\b/i],
  ['surety_bonds', /\b(performance bond|surety|bid bond|advance payment bond|retention bond)\b/i],
  ['business_interruption', /\b(business interruption|\bbi\b|loss of profits)\b/i],
  ['iar_fire', /\b(industrial all risks?|\biar\b|fire (?:policy|insurance)|property all risks?|office (?:package|insurance|care)|officecare)\b/i],
]
const SLUGS = new Set(PRODUCT_LINES.map(p => p.slug))

/** The product line the words name, subject first; null when nothing names one. */
export function inferProductLine(subject: string | null | undefined, text: string | null | undefined): string | null {
  for (const hay of [subject ?? '', (text ?? '').slice(0, 6000)]) {
    if (!hay.trim()) continue
    for (const [slug, re] of LINE_WORDS) if (re.test(hay) && SLUGS.has(slug)) return slug
  }
  return null
}

// ── Dates ─────────────────────────────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 }

/** "15/10/2026", "15 Oct 2026", "15-Oct-26", "2026-10-15" → "2026-10-15". Day first, as TRS writes. */
export function parseDate(text: string | null | undefined): string | null {
  if (!text) return null
  const t = text.trim()
  let m = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (m) return valid(+m[1], +m[2], +m[3])
  m = t.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/)
  if (m) return valid(year(m[3]), +m[2], +m[1])
  m = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,9})[\s,-]+(\d{2,4})\b/)
  if (m) { const mo = MONTHS[m[2].slice(0, 4).toLowerCase()] ?? MONTHS[m[2].slice(0, 3).toLowerCase()]; if (mo) return valid(year(m[3]), mo, +m[1]) }
  m = t.match(/\b([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/)
  if (m) { const mo = MONTHS[m[1].slice(0, 3).toLowerCase()]; if (mo) return valid(+m[3], mo, +m[2]) }
  return null
}
const year = (s: string) => s.length === 2 ? 2000 + Number(s) : Number(s)
function valid(y: number, mo: number, d: number): string | null {
  if (!(y >= 2000 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCMonth() !== mo - 1) return null
  return dt.toISOString().slice(0, 10)
}
const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 864e5).toISOString().slice(0, 10)

// ── Patterns ──────────────────────────────────────────────────────────────────────────────────

const MONEY = String.raw`((?:S\$|SGD|US\$|USD|MYR|RM|EUR|GBP|HKD|\$)\s?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?(?:\s?(?:m|mil|million|k))?|\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?\s?(?:SGD|USD|MYR))`
const PREMIUM = new RegExp(String.raw`(?:total|annual|net|gross|minimum|renewal|quoted|indicative|proposed)?\s*premium(?:\s*(?:payable|amount|quoted|offered|is|of|:|-|–))?[^\n$S\d]{0,40}?${MONEY}`, 'i')
const PREMIUM_REV = new RegExp(String.raw`${MONEY}[^\n]{0,30}?\b(?:premium|per annum|p\.a\.)\b`, 'i')
const GST = new RegExp(String.raw`\bGST\b[^\n]{0,25}?${MONEY}`, 'i')
const GST_NOTE = /\((?:incl(?:usive|\.)?|excl(?:usive|\.)?|before|after|plus|subject to)[^)]{0,20}GST\)|\b(?:inclusive|exclusive|before|after|plus|subject to) of GST\b/i
const LIMIT = new RegExp(String.raw`(?:limit of (?:liability|indemnity)|limit of cover|sum insured|aggregate limit|any one (?:occurrence|accident|claim)|\blimit\b)[^\n]{0,30}?${MONEY}`, 'i')
const EXCESS = new RegExp(String.raw`(?:excess|deductible)[^\n]{0,30}?${MONEY}([^\n.;]{0,50})?`, 'i')
const PERIOD = /(?:period of (?:insurance|cover)|policy period|cover(?:age)? period|period)\s*[:\-–]?\s*(?:from\s*)?([^\n]{6,22}?)\s*(?:to|-|–|till|until)\s*([^\n,;(]{6,22})/i
const VALIDITY = /\b(?:quot(?:e|ation)|terms?|offer|indication)?\s*(?:is\s+|are\s+)?valid(?:ity)?\s*(?:for|until|till|up to|through|to)\s*([^\n.;)]{3,40})/i
const POLICY_NO = /\b(?:policy|cover note|certificate)\s*(?:no\.?|number|#|ref\.?)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/]{5,30})/i
const BIND = /\b(?:cover (?:is|has been) (?:bound|confirmed|in force)|we (?:are pleased to )?confirm (?:that )?(?:cover|the policy|coverage)|(?:policy|cover note) (?:has been|is) issued|bound (?:with effect|w\.?e\.?f)|risk (?:is )?bound|confirmation of cover)\b/i
const INDICATION = /\b(indicat(?:ion|ive)|non-?binding|ballpark|subject to (?:full )?underwriting)\b/i
const QUOTE = /\b(quotation|quote|we are pleased to (?:offer|quote|provide)|our terms|terms (?:and|&) conditions as follows|premium)\b/i
const RENEWAL = /\brenewal (?:terms|premium|quotation|offer)\b/i
const CONDITIONS = /(?:^|\n)\s*(?:subject to|conditions?|warranty|warranties|subjectivit(?:y|ies))\s*[:\-–]?\s*([^\n]{8,200})/gi

/** parseMoney with the currency code glued to the digits ("USD10,000", "SGD4,250") read correctly. */
const money = (text: string | null | undefined) => parseMoney(text?.replace(/\b(SGD|USD|MYR|EUR|GBP|HKD|AUD|IDR)(?=\d)/gi, '$1 '))

/** A premium excerpt that is not a quoted premium: a threshold, a payment, a question, a limit, or words that happen to say "premium". */
const NOT_A_PREMIUM = /premium (?:paid|payment|notice|road|foldable|bicycle|rate)|\bis it \$|\?|claims? experience|expiring premium|\b(?:up to|limit of|sum insured|cover(?:age)? (?:of|for|up to))\b[^\n]{0,40}?(?:S\$|SGD|US\$|USD|\$)\s?\d/i
const MINIMUM_PREMIUM = /\bminimum\b[^\n]{0,40}\bpremium\b|\bpremium\b[^\n]{0,30}\bminimum\b/i
const PER_HEAD = /\bper\s+(?:pax|head|person|employee|life|member|staff|worker)\b/i

const excerpt = (text: string, m: RegExpMatchArray | null, width = 220): string | null => {
  if (!m || m.index == null) return null
  const start = Math.max(0, text.lastIndexOf('\n', m.index) + 1)
  const end = text.indexOf('\n', m.index + m[0].length)
  return text.slice(start, end < 0 ? Math.min(text.length, start + width) : Math.min(end, start + width)).trim()
}

/** Does this text carry a quote, an indication or a bind confirmation at all? */
export function isQuoteLike(subject: string | null | undefined, text: string | null | undefined): boolean {
  const hay = `${subject ?? ''}\n${(text ?? '').slice(0, 20_000)}`
  return BIND.test(hay) || ((QUOTE.test(hay) || INDICATION.test(hay) || RENEWAL.test(hay)) && new RegExp(MONEY, 'i').test(hay))
}

/**
 * Reads one text (a body, or one attachment) into a quote. Null when nothing that looks like a
 * premium or a bind confirmation is there. Never computes a figure.
 */
export function readQuoteText(text: string | null | undefined, opts: { sentAt?: string | null; source?: string } = {}): QuoteRead | null {
  const t = (text ?? '').replace(/\r/g, '').replace(/[ \t]+/g, ' ')
  if (t.trim().length < 20) return null
  const source = opts.source ?? 'email body'
  const ev: Evidence = {}
  const put = (k: string, m: RegExpMatchArray | null) => { const x = excerpt(t, m); if (x) ev[k] = { excerpt: x, source } }

  const bind = BIND.test(t)
  let pm = t.match(PREMIUM)
  if (!pm) pm = t.match(PREMIUM_REV)
  let premium_text = pm ? pm[1].trim() : null
  put('premium', pm)
  const line = ev.premium?.excerpt ?? ''
  // Thresholds, payments, questions and limits are not a quoted premium.
  let perHead: string | null = null
  if (premium_text && PER_HEAD.test(line)) { perHead = premium_text; premium_text = null }
  else if (premium_text && (NOT_A_PREMIUM.test(line) || MINIMUM_PREMIUM.test(line))) { premium_text = null; delete ev.premium; if (!bind) return null }
  const pMoney = money(premium_text)
  if (!premium_text && !perHead && !bind) return null

  const gm = t.match(GST); put('gst', gm)
  const gst_text = gm ? gm[1].trim() : (t.match(GST_NOTE)?.[0] ?? null)
  const lm = t.match(LIMIT); put('limit', lm)
  const xm = t.match(EXCESS); put('excess', xm)
  const prm = t.match(PERIOD); put('period', prm)
  const period_from = prm ? parseDate(prm[1]) : null
  const period_to = prm ? parseDate(prm[2]) : null
  const vm = t.match(VALIDITY); put('validity', vm)
  let valid_until: string | null = null
  if (vm) {
    const days = vm[1].match(/(\d{1,3})\s*(?:calendar\s*)?days?/i)
    valid_until = parseDate(vm[1]) ?? (days && opts.sentAt ? addDays(opts.sentAt.slice(0, 10), Number(days[1])) : null)
  }
  const pn = t.match(POLICY_NO)
  const conditions: string[] = []
  for (const c of t.matchAll(CONDITIONS)) { const s = c[1].trim(); if (s && !conditions.includes(s)) conditions.push(s); if (conditions.length >= 8) break }

  const kind: QuoteKind = bind && !premium_text ? 'bind_confirmation' : bind && pn ? 'bind_confirmation' : RENEWAL.test(t) ? 'renewal_terms' : INDICATION.test(t) && !/\bquotation\b/i.test(t) ? 'indication' : 'quotation'
  // "We confirm cover" with neither a policy number nor a premium is a sentence, not a record.
  if (kind === 'bind_confirmation' && !pn && !premium_text) return null
  const confidence: QuoteRead['confidence'] =
    pMoney && pMoney.amount > 0 && (lm || prm || pn) ? 'high' : (pMoney && pMoney.amount > 0) || (kind === 'bind_confirmation' && pn) ? 'medium' : 'low'

  return {
    kind,
    premium_text, premium_amount: pMoney?.amount ?? null, currency: pMoney?.currency ?? null,
    gst_text, gst_amount: gm ? money(gm[1])?.amount ?? null : null,
    limit_text: lm ? lm[1].trim() : null, limit_amount: lm ? money(lm[1])?.amount ?? null : null,
    per_head_text: perHead, per_head_amount: money(perHead)?.amount ?? null,
    excess_text: xm ? `${xm[1]}${xm[2] ?? ''}`.trim().slice(0, 120) : null,
    period_text: prm ? `${prm[1].trim()} to ${prm[2].trim()}` : null, period_from, period_to,
    validity_text: vm ? vm[1].trim() : null, valid_until,
    policy_number: pn ? pn[1].trim() : null,
    conditions, evidence: ev, confidence,
  }
}

/** The better of two reads: a real premium beats none, then a higher confidence, then more fields. */
export function betterRead(a: QuoteRead | null, b: QuoteRead | null): QuoteRead | null {
  if (!a) return b
  if (!b) return a
  const score = (q: QuoteRead) => (q.premium_amount ? 10 : q.per_head_amount ? 6 : 0) + ({ high: 3, medium: 2, low: 1 }[q.confidence]) + Object.keys(q.evidence).length
  return score(b) > score(a) ? b : a
}

// ── Capture from a message ────────────────────────────────────────────────────────────────────

type Row = Record<string, any>
export type CaptureResult =
  | { captured: true; quoteId: string | null; kind: QuoteKind; premium: number | null; currency: string | null; product_line: string | null; read_by: 'patterns' | 'model'; confidence: QuoteRead['confidence']; source: string; excerpt: string | null; dry?: boolean }
  | { captured: false; reason: string }

async function pdfText(att: Row): Promise<string | null> {
  if (att.parsed_text) return String(att.parsed_text)
  if (!/pdf/i.test(att.mime_type ?? '') || !att.storage_url) return null
  try {
    const bytes = await attachmentRefBytes(att.storage_url)
    if (!bytes) return null
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('pdf-parse') as unknown
    const fn = (typeof mod === 'function' ? mod : (mod as { default?: unknown }).default) as (b: Buffer) => Promise<{ text?: string }>
    const r = await fn(bytes)
    return r?.text ?? null
  } catch { return null }
}

/** The model reads what the patterns could not. Same shape; a figure with no excerpt is dropped. */
async function modelRead(subject: string | null, corpus: string, sentAt: string | null, messageId: string): Promise<QuoteRead | null> {
  const { text } = await callGemini({
    agent: 'placement', feature: 'placement_quote_capture', model: GEMINI_FLASH, json: true, temperature: 0, maxOutputTokens: 3000, thinkingShare: 0,
    metadata: { message_id: messageId },
    system: `You read an insurer's email (and attachment text) to a Singapore insurance broker. If it contains a quotation, an indication, renewal terms or a confirmation that cover is bound, extract the figures VERBATIM. Never compute or guess.
Return JSON only: {"kind":"quotation|indication|bind_confirmation|renewal_terms|none","premium":"as written or null","gst":"as written or null","limit":"as written or null","excess":"as written or null","period":"as written or null","validity":"as written or null","valid_until":"YYYY-MM-DD or null","policy_number":"verbatim or null","conditions":["short strings"],"evidence":{"premium":{"excerpt":"exact words","source":"email body|attachment: name"}}}`,
    parts: [{ text: `SUBJECT: ${subject ?? ''}\nSENT: ${sentAt ?? ''}\n\n${corpus.slice(0, 40_000)}` }],
  })
  if (!text) return null
  let j: Row
  try { j = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')) } catch { return null }
  if (!j || !['quotation', 'indication', 'bind_confirmation', 'renewal_terms'].includes(j.kind)) return null
  const str = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : null
  const evidence: Evidence = (j.evidence && typeof j.evidence === 'object') ? j.evidence : {}
  const premium_text = evidence.premium?.excerpt ? str(j.premium) : null
  if (!premium_text && j.kind !== 'bind_confirmation') return null
  const p = money(premium_text), g = money(str(j.gst)), l = money(str(j.limit))
  const period = str(j.period); const [pf, pt] = period ? period.split(/\s*(?:to|-|–)\s*/) : [null, null]
  return {
    kind: j.kind, premium_text, premium_amount: p?.amount ?? null, currency: p?.currency ?? null,
    gst_text: str(j.gst), gst_amount: g?.amount ?? null, limit_text: str(j.limit), limit_amount: l?.amount ?? null,
    per_head_text: null, per_head_amount: null, excess_text: str(j.excess), period_text: period, period_from: parseDate(pf), period_to: parseDate(pt),
    validity_text: str(j.validity), valid_until: parseDate(str(j.valid_until)), policy_number: str(j.policy_number)?.slice(0, 80) ?? null,
    conditions: Array.isArray(j.conditions) ? j.conditions.filter((s: unknown) => typeof s === 'string').slice(0, 8) : [],
    evidence, confidence: p ? 'medium' : 'low',
  }
}

/**
 * Reads one inbound insurer message into placement_quotes. Skips mail that is not from an insurer
 * or TPA, mail the placement module already filed against a dispatch, and mail already captured.
 */
export async function captureQuoteFromMessage(messageId: string, opts: { dry?: boolean; model?: boolean } = {}): Promise<CaptureResult> {
  const msg = await store.message(messageId)
  if (!msg) return { captured: false, reason: 'message not found' }
  if (msg.direction !== 'inbound') return { captured: false, reason: 'outbound' }
  const sender = bareEmail(msg.from_address), domain = emailDomain(sender)
  if (!domain) return { captured: false, reason: 'no sender' }
  const [party] = await sbTry<Row[]>(`companies?kind=in.(insurer,tpa)&domains=cs.{${enc(domain)}}&select=id,company_name,kind&limit=1`, [])
  if (!party) return { captured: false, reason: 'not an insurer' }
  const existing = await sbTry<Row[]>(`placement_quotes?source_message_id=eq.${enc(messageId)}&select=id&limit=1`, [])
  if (existing.length) return { captured: false, reason: 'already captured' }
  const onThread = await sbTry<Row[]>(`placement_quotes?thread_id=eq.${enc(msg.thread_id)}&select=kind,premium_amount,premium_per_head_amount,policy_number`, [])
  if (await store.dispatchForThread(msg.thread_id, null)) return { captured: false, reason: 'placement module owns this thread' }

  const atts = await sbTry<Row[]>(`email_attachments?message_id=eq.${enc(messageId)}&select=id,filename,mime_type,parsed_text,storage_url`, [])
  const body = String(msg.body_text ?? '')
  let best = readQuoteText(body, { sentAt: msg.sent_at, source: 'email body' })
  let bestDoc: Row | null = null
  const texts: string[] = [body]
  for (const a of atts) {
    if (!/pdf|word|officedocument|text\/plain/i.test(a.mime_type ?? '') && !/\.(pdf|docx?|txt)$/i.test(a.filename ?? '')) continue
    const text = await pdfText(a)
    if (!text) continue
    texts.push(`--- ${a.filename}\n${text}`)
    const r = readQuoteText(text, { sentAt: msg.sent_at, source: `attachment: ${a.filename}` })
    const b = betterRead(best, r)
    if (b !== best) { best = b; bestDoc = a }
  }
  const corpus = texts.join('\n\n')
  if (!isQuoteLike(msg.subject, corpus)) return { captured: false, reason: 'no quote in the text' }
  let read_by: 'patterns' | 'model' = 'patterns'
  if ((!best || best.confidence === 'low') && opts.model !== false && !opts.dry) {
    const m = await modelRead(msg.subject, corpus, msg.sent_at, messageId)
    if (m && (!best || m.premium_amount)) { best = m; read_by = 'model'; bestDoc = null }
  }
  if (!best) return { captured: false, reason: 'quote words but no readable figures' }
  // The same figure quoted again on the same thread (a reply that restates it) is one quote, not two.
  if (onThread.some(q => (best!.premium_amount != null && Number(q.premium_amount) === best!.premium_amount) || (best!.per_head_amount != null && Number(q.premium_per_head_amount) === best!.per_head_amount) || (best!.kind === 'bind_confirmation' && best!.policy_number && q.policy_number === best!.policy_number)))
    return { captured: false, reason: 'same figure already on this thread' }

  const thread = await store.thread(msg.thread_id)
  let companyId: string | null = thread?.company_id ?? null
  if (companyId) { const [c] = await sbTry<Row[]>(`companies?id=eq.${enc(companyId)}&select=kind`, []); if (c && c.kind !== 'client') companyId = null }
  if (!companyId) { const [ti] = await sbTry<Row[]>(`thread_insurers?thread_id=eq.${enc(msg.thread_id)}&client_company_id=not.is.null&select=client_company_id&limit=1`, []); companyId = ti?.client_company_id ?? null }
  const product_line = inferProductLine(msg.subject, corpus)
  const excerptText = best.evidence.premium?.excerpt ?? best.evidence.policy_number?.excerpt ?? null
  const result: CaptureResult = { captured: true, quoteId: null, kind: best.kind, premium: best.premium_amount ?? best.per_head_amount, currency: best.currency, product_line, read_by, confidence: best.confidence, source: bestDoc ? `attachment: ${bestDoc.filename}` : 'email body', excerpt: excerptText, dry: opts.dry }
  if (opts.dry) return result

  const row = {
    insurer_name: party.company_name, insurer_company_id: party.id, company_id: companyId, product_line, kind: best.kind,
    premium_text: best.premium_text, premium_amount: best.premium_amount, currency: best.currency ?? (best.per_head_amount != null ? money(best.per_head_text)?.currency ?? null : null),
    premium_per_head_text: best.per_head_text, premium_per_head_amount: best.per_head_amount,
    gst_text: best.gst_text, gst_amount: best.gst_amount, limit_text: best.limit_text, limit_amount: best.limit_amount,
    excess_text: best.excess_text, period_text: best.period_text, period_from: best.period_from, period_to: best.period_to,
    validity_text: best.validity_text, valid_until: best.valid_until, policy_number: best.policy_number,
    conditions: best.conditions.join('\n') || null, subjectivities: best.conditions, evidence: best.evidence,
    summary: `${best.kind.replace('_', ' ')} from ${party.company_name}${product_line ? ` · ${product_line}` : ''}${best.premium_text ? ` · ${best.premium_text}` : ''}`.slice(0, 300),
    source_message_id: messageId, source_document_id: bestDoc?.id ?? null, thread_id: msg.thread_id,
    status: 'received', needs_review: best.confidence !== 'high', extracted_by: 'quote_capture', read_by, confidence: best.confidence, source: 'insurer',
  }
  const [made] = await sb<Row[]>('placement_quotes', {
    method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row),
  }).catch(async e => {
    // The capture key already holds this quote (a re-run): keep the first row.
    if (/duplicate|23505/i.test(String(e))) return [] as Row[]
    throw e
  })
  return { ...result, quoteId: made?.id ?? null }
}
