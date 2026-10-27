/**
 * The placement agent's model calls. Every call goes through callGemini under agent 'placement'
 * and every client- or insurer-facing text is written under the house voice. Nothing here sends.
 */
import { callGemini } from '@/lib/ai-call'
import { GEMINI_DEEP } from '@/lib/gemini-models'
import { withVoice } from '@/lib/voice'
import { productLineLabel, PRODUCT_LINES } from '@/lib/product-lines'
import { normaliseSpec, parseMoney, specLines } from './spec'
import type { Evidence, PlacementLogEntry, PlacementQuote, Spec } from './types'
import type { MailAttachment, MailMessage } from './store'

const parseJson = <T,>(text: string | null): T | null => {
  if (!text) return null
  try { return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')) as T } catch { return null }
}

const mailCorpus = (msgs: MailMessage[], atts: MailAttachment[] = [], budget = 60_000): string => {
  let left = budget
  const out: string[] = []
  for (const m of msgs) {
    const head = `--- ${m.direction.toUpperCase()} ${m.sent_at ?? ''} from ${m.from_address ?? '?'}\nSUBJECT: ${m.subject ?? ''}\n`
    const body = (m.body_text ?? '').slice(0, Math.min(left, 12_000))
    left -= body.length
    out.push(head + body)
    for (const a of atts.filter(a => a.message_id === m.id && (a.parsed_text ?? '').trim().length > 10)) {
      const t = (a.parsed_text ?? '').slice(0, Math.min(left, 20_000))
      left -= t.length
      out.push(`--- ATTACHMENT ${a.filename}\n${t}`)
    }
    if (left <= 0) break
  }
  return out.join('\n\n')
}

/** The memory, as the agent reads it: newest last, one line each. */
export const memoryLines = (log: PlacementLogEntry[], max = 40): string =>
  [...log].sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(-max)
    .map(e => `${e.created_at.slice(0, 10)} [${e.kind}] ${e.text}`).join('\n')

// ── 1. Intake: the client's request → policy lines ───────────────────────────────────────────

export type IntakeLine = { product_line: string; label: string; spec: Spec; confidence: number }
export type IntakeResult = { title: string; inception_date: string | null; lines: IntakeLine[]; client_asks: string[] }

export async function readRequest(msgs: MailMessage[], atts: MailAttachment[], companyName: string | null): Promise<IntakeResult | null> {
  const lines = PRODUCT_LINES.map(p => `${p.slug} = ${p.label}`).join('\n')
  const system = `You read an email thread in which a client asks an insurance broker (Trade Risk Solutions, Singapore) for insurance quotations.
List every policy the client is asking to be quoted, one per line, using ONLY these product-line slugs:
${lines}

For each line give the spec the insurers will be asked to price: insured (who and where), limit (limit of indemnity or sum insured, verbatim), excess, period, scope (activities, territory, what is included), extras (extensions asked for), notes (anything else the underwriter needs). Leave a field out if the client did not say.
Also give: a short title for this placement ("PI and D&O for ${companyName ?? 'the client'}"), the inception date as YYYY-MM-DD if stated, and client_asks: the questions the client asked that are not a spec (e.g. "can we pay quarterly").
Quote figures verbatim. Never invent a limit or a period. confidence is 0 to 1 for whether this line was really requested.
Return JSON only: { "title": string, "inception_date": string|null, "lines": [{ "product_line": slug, "label": string, "spec": {...}, "confidence": number }], "client_asks": string[] }`
  const { text, error } = await callGemini({
    agent: 'placement', feature: 'placement_intake', model: GEMINI_DEEP, system, json: true, temperature: 0, maxOutputTokens: 16_000, thinkingShare: 0.3,
    parts: [{ text: `CLIENT: ${companyName ?? 'unknown'}\n\n${mailCorpus(msgs, atts)}` }],
  })
  if (error) console.error('[placement] intake', error)
  const raw = parseJson<IntakeResult>(text)
  if (!raw?.lines) return null
  const valid = new Set(PRODUCT_LINES.map(p => p.slug))
  return {
    title: (raw.title ?? '').trim() || `Quotes for ${companyName ?? 'client'}`,
    inception_date: /^\d{4}-\d{2}-\d{2}$/.test(raw.inception_date ?? '') ? raw.inception_date : null,
    lines: raw.lines.filter(l => valid.has(l.product_line)).map(l => ({
      product_line: l.product_line, label: (l.label ?? '').trim() || productLineLabel(l.product_line), spec: normaliseSpec(l.spec), confidence: Number(l.confidence ?? 0.5),
    })),
    client_asks: Array.isArray(raw.client_asks) ? raw.client_asks.filter(x => typeof x === 'string').slice(0, 10) : [],
  }
}

// ── 2. The email to an insurer ───────────────────────────────────────────────────────────────

export type DispatchDraftInput = {
  insurerName: string; contactName: string | null
  clientName: string
  lines: { label: string; productLine: string; spec: Spec }[]
  roundNo: number; changeSummary: string | null; previousPremium: string | null
  inceptionDate: string | null
  memory: string
}
export type DraftText = { subject: string; body: string }

export async function draftToInsurer(i: DispatchDraftInput): Promise<DraftText | null> {
  const task = `Write the email a broker at Trade Risk Solutions sends to an underwriter asking for a quotation.
Reader: ${i.contactName ?? 'the underwriter'} at ${i.insurerName}.
Client: ${i.clientName}. Inception: ${i.inceptionDate ?? 'to be confirmed'}.
${i.roundNo > 1 ? `This is a REVISED request (round ${i.roundNo}). What changed: ${i.changeSummary ?? 'see spec'}. ${i.previousPremium ? `Their last quoted premium was ${i.previousPremium}.` : ''} Ask for a revised premium on the new terms and say the rest stays as previously submitted.` : 'This is the first request.'}
Lines to quote (each with its spec):
${i.lines.map(l => `• ${l.label} [${productLineLabel(l.productLine)}]\n  ${specLines(l.spec).join('\n  ') || '(spec to follow)'}`).join('\n')}

What we know so far about this client's placement (for your context, do not repeat it to the insurer):
${i.memory || '(nothing yet)'}

Rules: plain text, short paragraphs, one blank line between them. Name every line and its spec exactly as given. Ask for premium, excess, limit, validity of the quote and any subjectivities. Ask them to reply within 3 working days. No greeting fluff, no sign-off block (the signature is added on send). Never mention other insurers or their prices.
Return JSON only: { "subject": string, "body": string }`
  const { text, error } = await callGemini({
    agent: 'placement', feature: 'placement_dispatch_draft', model: GEMINI_DEEP, system: await withVoice(task, 'client'), json: true, temperature: 0.2, maxOutputTokens: 6_000,
    parts: [{ text: 'Write it now.' }],
  })
  if (error) console.error('[placement] dispatch draft', error)
  const raw = parseJson<DraftText>(text)
  if (!raw?.body) return null
  return { subject: (raw.subject ?? '').trim() || `Quotation request — ${i.clientName}`, body: raw.body.trim() }
}

// ── 3. Reading an insurer's reply ────────────────────────────────────────────────────────────

export type ReplyKind = 'quote' | 'decline' | 'info_request' | 'acknowledgement' | 'other'
export type ReplyRead = {
  kind: ReplyKind
  summary: string
  questions: string[]               // what the insurer asked us, if info_request
  quote: null | {
    premium: string | null; limit: string | null; excess: string | null; validity: string | null; valid_until: string | null
    key_terms: string[]; exclusions: string[]; subjectivities: string[]; evidence: Evidence; primary_source: string
  }
}

export async function readInsurerReply(msg: MailMessage, atts: MailAttachment[], ctx: { insurerName: string; lineLabel: string; spec: Spec; roundNo: number }): Promise<ReplyRead | null> {
  const system = `You read an insurer's reply to a broker's request for a quotation and classify it.
Context: ${ctx.insurerName} was asked (round ${ctx.roundNo}) to quote "${ctx.lineLabel}" with: ${specLines(ctx.spec).join('; ') || 'spec not recorded'}.
kind is one of: quote (a price is given), decline (they will not quote), info_request (they need something before quoting), acknowledgement (received, working on it), other.
If kind is quote, read the figures VERBATIM with currency as written: premium, limit, excess, validity (as written) and valid_until as YYYY-MM-DD if a date or a period from the email date (${msg.sent_at?.slice(0, 10) ?? 'unknown'}) can be read. key_terms, exclusions, subjectivities as short strings. evidence: for premium, limit, excess, validity give { "excerpt": the exact words you read it from, "source": "email body" or "attachment: <filename>" }. primary_source likewise.
Never compute or guess a figure. A figure with no excerpt must be null.
Return JSON only: { "kind": ..., "summary": one sentence, "questions": string[], "quote": {...} | null }`
  const { text, error } = await callGemini({
    agent: 'placement', feature: 'placement_reply_read', model: GEMINI_DEEP, system, json: true, temperature: 0, maxOutputTokens: 12_000, thinkingShare: 0.3,
    metadata: { message_id: msg.id }, parts: [{ text: mailCorpus([msg], atts, 80_000) }],
  })
  if (error) console.error('[placement] reply read', error)
  const raw = parseJson<ReplyRead>(text)
  if (!raw?.kind) return null
  const kinds: ReplyKind[] = ['quote', 'decline', 'info_request', 'acknowledgement', 'other']
  return {
    kind: kinds.includes(raw.kind) ? raw.kind : 'other',
    summary: (raw.summary ?? '').trim().slice(0, 600),
    questions: Array.isArray(raw.questions) ? raw.questions.filter(q => typeof q === 'string').slice(0, 10) : [],
    quote: raw.kind === 'quote' && raw.quote ? {
      premium: raw.quote.premium ?? null, limit: raw.quote.limit ?? null, excess: raw.quote.excess ?? null,
      validity: raw.quote.validity ?? null, valid_until: /^\d{4}-\d{2}-\d{2}$/.test(raw.quote.valid_until ?? '') ? raw.quote.valid_until : null,
      key_terms: arr(raw.quote.key_terms), exclusions: arr(raw.quote.exclusions), subjectivities: arr(raw.quote.subjectivities),
      evidence: (raw.quote.evidence && typeof raw.quote.evidence === 'object') ? raw.quote.evidence : {}, primary_source: raw.quote.primary_source ?? 'email body',
    } : null,
  }
}
const arr = (x: unknown): string[] => Array.isArray(x) ? x.filter(s => typeof s === 'string').map(s => s.trim()).filter(Boolean).slice(0, 20) : []

/** The quote row's normalised fields from a read. Premium with no evidence excerpt is flagged for review. */
export function quoteFields(read: NonNullable<ReplyRead['quote']>): Pick<PlacementQuote, 'premium_amount' | 'currency' | 'limit_amount' | 'needs_review'> {
  const p = parseMoney(read.premium), l = parseMoney(read.limit)
  const needs_review = !read.evidence?.premium?.excerpt || p == null
  return { premium_amount: p?.amount ?? null, currency: p?.currency ?? null, limit_amount: l?.amount ?? null, needs_review }
}

// ── 4. Reading the client's reply for a change of ask ────────────────────────────────────────

export type ClientChange = {
  kind: 'change' | 'question' | 'acceptance' | 'other'
  summary: string
  changes: { line_label: string; spec: Spec }[]    // the new spec per affected line, full not partial
}

export async function readClientReply(msg: MailMessage, atts: MailAttachment[], ctx: { lines: { label: string; spec: Spec; bestPremium: string | null }[]; memory: string }): Promise<ClientChange | null> {
  const system = `You read a client's email to their insurance broker during a quotation exercise and decide whether it changes what the insurers must be asked.
Lines in play:
${ctx.lines.map(l => `• ${l.label}: ${specLines(l.spec).join('; ') || 'spec not recorded'}${l.bestPremium ? ` — best price so far ${l.bestPremium}` : ''}`).join('\n')}
What happened so far:
${ctx.memory || '(nothing yet)'}

kind: change (they want different terms, e.g. a higher limit, a different excess, another cover added), question (asking something, no change), acceptance (they accept a quote / want to proceed), other.
If change: for each affected line give line_label exactly as above and the FULL new spec (copy the unchanged fields, change only what the client asked). If the client names a new policy not in the lines, put it under line_label "NEW: <name>".
summary: one sentence of what the client wants.
Return JSON only: { "kind": ..., "summary": string, "changes": [{ "line_label": string, "spec": {...} }] }`
  const { text, error } = await callGemini({
    agent: 'placement', feature: 'placement_client_change', model: GEMINI_DEEP, system, json: true, temperature: 0, maxOutputTokens: 8_000, thinkingShare: 0.3,
    metadata: { message_id: msg.id }, parts: [{ text: mailCorpus([msg], atts, 40_000) }],
  })
  if (error) console.error('[placement] client change', error)
  const raw = parseJson<ClientChange>(text)
  if (!raw?.kind) return null
  return {
    kind: (['change', 'question', 'acceptance', 'other'] as const).includes(raw.kind) ? raw.kind : 'other',
    summary: (raw.summary ?? '').trim().slice(0, 600),
    changes: Array.isArray(raw.changes) ? raw.changes.filter(c => c && typeof c.line_label === 'string').map(c => ({ line_label: c.line_label.trim(), spec: normaliseSpec(c.spec) })) : [],
  }
}

// ── 5. A chase ───────────────────────────────────────────────────────────────────────────────

export async function draftChase(i: { insurerName: string; contactName: string | null; clientName: string; lineLabel: string; sentOn: string; chaseNo: number; inceptionDate: string | null }): Promise<string | null> {
  const task = `Write a short follow-up to ${i.contactName ?? 'the underwriter'} at ${i.insurerName} on the quotation request for ${i.clientName} (${i.lineLabel}) sent on ${i.sentOn}. This is follow-up number ${i.chaseNo}.${i.inceptionDate ? ` Cover must start ${i.inceptionDate}.` : ''}
Ask when the quote can be expected and whether anything is missing from our side. Three sentences at most. Plain text. No sign-off block.
Return JSON only: { "body": string }`
  const { text } = await callGemini({
    agent: 'placement', feature: 'placement_chase_draft', model: GEMINI_DEEP, system: await withVoice(task, 'client'), json: true, temperature: 0.2, maxOutputTokens: 2_000,
    parts: [{ text: 'Write it now.' }],
  })
  return parseJson<{ body: string }>(text)?.body?.trim() ?? null
}

// ── 6. The comparison back to the client ────────────────────────────────────────────────────

export type ClientSummaryInput = {
  clientName: string; contactName: string | null; placementTitle: string
  lines: { label: string; spec: Spec; roundNo: number; quotes: { insurer: string; premium: string | null; limit: string | null; excess: string | null; validity: string | null; subjectivities: string[]; exclusions: string[] }[]; declined: string[]; awaiting: string[] }[]
  memory: string
}

export async function draftClientSummary(i: ClientSummaryInput): Promise<DraftText | null> {
  const task = `Write the email a broker at Trade Risk Solutions sends to ${i.contactName ?? 'the client'} at ${i.clientName} presenting the quotations received for "${i.placementTitle}".
For each line, list every quote as a plain-text table (insurer, premium, limit, excess, valid until) in the order received, then the subjectivities and exclusions that matter, then name the insurers that declined and the ones still to reply. Do not recommend unless one option is clearly cheaper on the same terms; then say so in one sentence with the figures. Ask the client how they wish to proceed and name any decision they must make (e.g. the limit). Keep figures exactly as given.
Lines:
${i.lines.map(l => `• ${l.label} (round ${l.roundNo}; asked: ${specLines(l.spec).join('; ') || 'spec not recorded'})
${l.quotes.map(q => `   - ${q.insurer}: premium ${q.premium ?? 'not stated'}; limit ${q.limit ?? 'not stated'}; excess ${q.excess ?? 'not stated'}; valid ${q.validity ?? 'not stated'}${q.subjectivities.length ? `; subject to: ${q.subjectivities.join(', ')}` : ''}${q.exclusions.length ? `; excludes: ${q.exclusions.join(', ')}` : ''}`).join('\n')}
   declined: ${l.declined.join(', ') || 'none'}; awaiting: ${l.awaiting.join(', ') || 'none'}`).join('\n')}

Context (do not repeat verbatim):
${i.memory || '(nothing yet)'}

Plain text, short paragraphs. No sign-off block.
Return JSON only: { "subject": string, "body": string }`
  const { text, error } = await callGemini({
    agent: 'placement', feature: 'placement_client_summary', model: GEMINI_DEEP, system: await withVoice(task, 'client'), json: true, temperature: 0.2, maxOutputTokens: 8_000,
    parts: [{ text: 'Write it now.' }],
  })
  if (error) console.error('[placement] client summary', error)
  const raw = parseJson<DraftText>(text)
  if (!raw?.body) return null
  return { subject: (raw.subject ?? '').trim() || `Quotations — ${i.placementTitle}`, body: raw.body.trim() }
}
