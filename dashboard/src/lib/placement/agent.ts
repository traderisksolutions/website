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
  /** Null = the same request goes to several insurers: address no insurer or person by name. */
  insurerName: string | null; contactName: string | null
  clientName: string
  lines: { label: string; productLine: string; spec: Spec; tiers?: TierAsk[] }[]
  roundNo: number; changeSummary: string | null; previousPremium: string | null
  inceptionDate: string | null
  memory: string
}
export type DraftText = { subject: string; body: string }

export async function draftToInsurer(i: DispatchDraftInput): Promise<DraftText | null> {
  const reader = i.insurerName
    ? `Reader: ${i.contactName ?? 'the underwriter'} at ${i.insurerName}.`
    : 'Reader: the underwriter at each insurer being asked. The same email goes to several insurers, so name no insurer and no person; open with "Dear Underwriter," and write as to one reader.'
  const task = `Write the email a broker at Trade Risk Solutions sends to an underwriter asking for a quotation.
${reader}
Client: ${i.clientName}. Inception: ${i.inceptionDate ?? 'to be confirmed'}.
${i.roundNo > 1 ? `This is a REVISED request (round ${i.roundNo}). What changed: ${i.changeSummary ?? 'see spec'}. ${i.previousPremium ? `Their last quoted premium was ${i.previousPremium}.` : ''} Ask for a revised premium on the new terms and say the rest stays as previously submitted.` : 'This is the first request.'}
Lines to quote (each with its spec):
${i.lines.map(l => `• ${l.label} [${productLineLabel(l.productLine)}]\n  ${specLines(l.spec).join('\n  ') || '(spec to follow)'}${l.tiers?.length ? `\n  Also price each of these options separately:\n  ${l.tiers.map(tierLine).join('\n  ')}` : ''}`).join('\n')}

What we know so far about this client's placement (for your context, do not repeat it to the insurer):
${i.memory || '(nothing yet)'}

Rules: plain text, short paragraphs, one blank line between them. Name every line and its spec exactly as given. Where options are listed, ask for a separate premium for each option, total and per head where it applies. Ask for premium, excess, limit, validity of the quote and any subjectivities. Ask them to reply within 3 working days. No greeting fluff, no sign-off block (the signature is added on send). Never mention other insurers or their prices.
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

export type TierAsk = { label: string; spec: Spec; target_premium: string | null }
const tierLine = (t: TierAsk): string => `- ${t.label}${specLines(t.spec).length ? ` (${specLines(t.spec).join('; ')})` : ''}${t.target_premium ? ` — the client's budget is ${t.target_premium}; tell us the best cover it buys` : ''}`

/**
 * The follow-up asking insurers already on a line to price more options. One text for all of
 * them: it names no insurer and goes as a reply on each insurer's own thread.
 */
export async function draftTierAsk(i: { clientName: string; lineLabel: string; spec: Spec; tiers: TierAsk[]; inceptionDate: string | null }): Promise<DraftText | null> {
  const task = `Write the follow-up a broker at Trade Risk Solutions sends to an underwriter who has already been asked to quote "${i.lineLabel}" for ${i.clientName}. The client now wants to compare more options side by side, and the underwriter is asked to price each one separately.
The same email goes to several insurers: name no insurer and no person; open with "Dear Underwriter,".
Current spec: ${specLines(i.spec).join('; ') || 'as previously submitted'}. Inception: ${i.inceptionDate ?? 'to be confirmed'}.
Options to price, each on its own:
${i.tiers.map(tierLine).join('\n')}
Ask for the premium of each option (total, and per head where it applies), with any change to excess, limits or terms. Say any quote already given still stands. Ask them to reply within 3 working days.
Plain text, short paragraphs. No sign-off block. Never mention other insurers or their prices.
Return JSON only: { "subject": string, "body": string }`
  const { text, error } = await callGemini({
    agent: 'placement', feature: 'placement_tier_ask', model: GEMINI_DEEP, system: await withVoice(task, 'client'), json: true, temperature: 0.2, maxOutputTokens: 4_000,
    parts: [{ text: 'Write it now.' }],
  })
  if (error) console.error('[placement] tier ask', error)
  const raw = parseJson<DraftText>(text)
  if (!raw?.body) return null
  return { subject: (raw.subject ?? '').trim() || `Further options — ${i.lineLabel}, ${i.clientName}`, body: raw.body.trim() }
}

// ── 3. Reading an insurer's reply ────────────────────────────────────────────────────────────

export type ReplyKind = 'quote' | 'decline' | 'info_request' | 'acknowledgement' | 'confirmation' | 'other'
export type ReadQuote = {
  /** Which line it prices, by the key given in the prompt; which tier, as the insurer wrote it (null = the line's own spec). */
  line_key: string; tier: string | null
  premium: string | null; per_head: string | null; limit: string | null; excess: string | null; validity: string | null; valid_until: string | null
  key_terms: string[]; exclusions: string[]; subjectivities: string[]; evidence: Evidence; primary_source: string
}
export type ReplyRead = {
  kind: ReplyKind
  summary: string
  questions: string[]               // what the insurer asked us, if info_request
  /** Every price in the reply: one per line per tier. */
  quotes: ReadQuote[]
  /** Lines the insurer will not quote, by key. Empty with kind decline = all of them. */
  declined_lines: string[]
  /** With kind confirmation: the policy or cover note number the insurer gives, verbatim. */
  policy_number: string | null
}
export type ReplyLine = { key: string; label: string; spec: Spec; tiers: string[] }

/**
 * One reply can price several lines (WICA and EB in one email) and several tiers of each (500k,
 * 1M, 2M). Every price comes back as its own entry so none is lost.
 */
export async function readInsurerReply(msg: MailMessage, atts: MailAttachment[], ctx: { insurerName: string; roundNo: number; lines: ReplyLine[] }): Promise<ReplyRead | null> {
  const lines = ctx.lines.map(l => `• key "${l.key}": ${l.label} — ${specLines(l.spec).join('; ') || 'spec not recorded'}${l.tiers.length ? `\n  tiers asked: ${l.tiers.map(t => `"${t}"`).join(', ')}` : ''}`).join('\n')
  const system = `You read an insurer's reply to a broker's request for a quotation and classify it.
Context: ${ctx.insurerName} was asked (round ${ctx.roundNo}) to quote:
${lines}
kind is one of: quote (at least one price is given), decline (they will not quote), info_request (they need something before quoting), acknowledgement (received, working on it), confirmation (they confirm cover is bound or in force for the option the broker confirmed, or say the policy / cover note is issued), other.
policy_number: with confirmation, the policy or cover note number they give, verbatim; else null.
quotes: one entry for EVERY price in the email and its attachments. If the insurer prices several cover levels, plans or options, each is its own entry. For each: line_key (the key above it prices; if only one line is listed use its key), tier (the cover level or plan as the insurer names it, using a tier name from the list above when it is that tier; null when it is simply the spec asked), premium (total, verbatim with currency), per_head (premium per employee or per life if stated, verbatim), limit, excess, validity (as written), valid_until as YYYY-MM-DD if a date or a period from the email date (${msg.sent_at?.slice(0, 10) ?? 'unknown'}) can be read, key_terms, exclusions, subjectivities as short strings, evidence: for premium, per_head, limit, excess, validity give { "excerpt": the exact words you read it from, "source": "email body" or "attachment: <filename>" }, primary_source likewise.
declined_lines: keys of lines they will not quote (empty if kind is decline for everything).
Never compute or guess a figure. A figure with no excerpt must be null. Never put two prices in one entry.
Return JSON only: { "kind": ..., "summary": one sentence, "questions": string[], "quotes": [...], "declined_lines": string[], "policy_number": string|null }`
  const { text, error } = await callGemini({
    agent: 'placement', feature: 'placement_reply_read', model: GEMINI_DEEP, system, json: true, temperature: 0, maxOutputTokens: 16_000, thinkingShare: 0.3,
    metadata: { message_id: msg.id }, parts: [{ text: mailCorpus([msg], atts, 80_000) }],
  })
  if (error) console.error('[placement] reply read', error)
  const raw = parseJson<Partial<ReplyRead> & { kind?: ReplyKind; quotes?: Partial<ReadQuote>[] }>(text)
  if (!raw?.kind) return null
  const kinds: ReplyKind[] = ['quote', 'decline', 'info_request', 'acknowledgement', 'confirmation', 'other']
  const keys = new Set(ctx.lines.map(l => l.key))
  const onlyKey = ctx.lines.length === 1 ? ctx.lines[0].key : null
  const date = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
  const str = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : null
  const quotes: ReadQuote[] = (Array.isArray(raw.quotes) ? raw.quotes : []).flatMap(q => {
    if (!q || typeof q !== 'object') return []
    const key = typeof q.line_key === 'string' && keys.has(q.line_key) ? q.line_key : onlyKey
    if (!key) return []
    return [{
      line_key: key, tier: str(q.tier), premium: str(q.premium), per_head: str(q.per_head), limit: str(q.limit), excess: str(q.excess),
      validity: str(q.validity), valid_until: date(q.valid_until),
      key_terms: arr(q.key_terms), exclusions: arr(q.exclusions), subjectivities: arr(q.subjectivities),
      evidence: (q.evidence && typeof q.evidence === 'object') ? q.evidence as Evidence : {}, primary_source: str(q.primary_source) ?? 'email body',
    }]
  })
  return {
    kind: kinds.includes(raw.kind) ? raw.kind : 'other',
    summary: (raw.summary ?? '').trim().slice(0, 600),
    questions: Array.isArray(raw.questions) ? raw.questions.filter(q => typeof q === 'string').slice(0, 10) : [],
    quotes: quotes.slice(0, 40),
    declined_lines: Array.isArray(raw.declined_lines) ? raw.declined_lines.filter((k): k is string => typeof k === 'string' && keys.has(k)) : [],
    policy_number: str(raw.policy_number)?.slice(0, 80) ?? null,
  }
}
const arr = (x: unknown): string[] => Array.isArray(x) ? x.filter(s => typeof s === 'string').map(s => s.trim()).filter(Boolean).slice(0, 20) : []

/** The quote row's normalised fields from a read. Premium with no evidence excerpt is flagged for review. */
export function quoteFields(read: ReadQuote): Pick<PlacementQuote, 'premium_amount' | 'currency' | 'limit_amount' | 'premium_per_head_amount' | 'needs_review'> {
  const p = parseMoney(read.premium), l = parseMoney(read.limit), h = parseMoney(read.per_head)
  const needs_review = (!read.evidence?.premium?.excerpt || p == null) && (!read.evidence?.per_head?.excerpt || h == null)
  return { premium_amount: p?.amount ?? null, currency: p?.currency ?? h?.currency ?? null, limit_amount: l?.amount ?? null, premium_per_head_amount: h?.amount ?? null, needs_review }
}

// ── 4. Reading the client's reply for a change of ask ────────────────────────────────────────

export type ClientChange = {
  kind: 'change' | 'tiers' | 'question' | 'acceptance' | 'other'
  summary: string
  changes: { line_label: string; spec: Spec }[]    // the new spec per affected line, full not partial
  /** Options the client wants priced side by side, kept alongside what is already asked. */
  tiers: { line_label: string; label: string; target_premium: string | null; spec: Spec }[]
  /** With acceptance: which quote they go with, per line, as they named it. */
  picks: { line_label: string; insurer: string; option: string | null }[]
}

export async function readClientReply(msg: MailMessage, atts: MailAttachment[], ctx: { lines: { label: string; spec: Spec; bestPremium: string | null; quoted?: string[] }[]; memory: string }): Promise<ClientChange | null> {
  const system = `You read a client's email to their insurance broker during a quotation exercise and decide whether it changes what the insurers must be asked.
Lines in play:
${ctx.lines.map(l => `• ${l.label}: ${specLines(l.spec).join('; ') || 'spec not recorded'}${l.bestPremium ? ` — best price so far ${l.bestPremium}` : ''}${l.quoted?.length ? `\n  quoted: ${l.quoted.join('; ')}` : ''}`).join('\n')}
What happened so far:
${ctx.memory || '(nothing yet)'}

kind:
- tiers: they want to SEE MORE OPTIONS priced side by side with what is already quoted, e.g. "what about 1M or 2M", "what does $1,000 or $1,300 per head get us", "can we also see it with outpatient", "and with a higher deductible". Nothing already asked is replaced.
- change: the basis itself changes and replaces what was asked, e.g. headcount is now 60, drop dependants, a different start date, another cover added.
- question (asking something, no change), acceptance (they accept a quote / want to proceed), other.
If tiers: one entry per option per line: line_label exactly as above, label (short, as the client would say it: "1M", "S$1,300 per head", "with outpatient"), target_premium (a budget they want to see what it buys, verbatim, else null), spec (only the fields this option changes, e.g. { "limit": "S$1,000,000" }).
If change: for each affected line give line_label exactly as above and the FULL new spec (copy the unchanged fields, change only what the client asked). If the client names a new policy not in the lines, put it under line_label "NEW: <name>".
If acceptance: picks, one per line they decide on: line_label exactly as above, insurer (as quoted above), option (the option or cover level as listed above, or null when that insurer quoted only one). Only what they clearly chose; leave a line out when unsure.
An email can hold both; then kind is change and both lists are filled.
summary: one sentence of what the client wants.
Return JSON only: { "kind": ..., "summary": string, "changes": [{ "line_label": string, "spec": {...} }], "tiers": [{ "line_label": string, "label": string, "target_premium": string|null, "spec": {...} }], "picks": [{ "line_label": string, "insurer": string, "option": string|null }] }`
  const { text, error } = await callGemini({
    agent: 'placement', feature: 'placement_client_change', model: GEMINI_DEEP, system, json: true, temperature: 0, maxOutputTokens: 8_000, thinkingShare: 0.3,
    metadata: { message_id: msg.id }, parts: [{ text: mailCorpus([msg], atts, 40_000) }],
  })
  if (error) console.error('[placement] client change', error)
  const raw = parseJson<ClientChange>(text)
  if (!raw?.kind) return null
  return {
    kind: (['change', 'tiers', 'question', 'acceptance', 'other'] as const).includes(raw.kind) ? raw.kind : 'other',
    summary: (raw.summary ?? '').trim().slice(0, 600),
    changes: Array.isArray(raw.changes) ? raw.changes.filter(c => c && typeof c.line_label === 'string').map(c => ({ line_label: c.line_label.trim(), spec: normaliseSpec(c.spec) })) : [],
    tiers: Array.isArray(raw.tiers) ? raw.tiers.filter(t => t && typeof t.line_label === 'string' && typeof t.label === 'string' && t.label.trim()).slice(0, 12).map(t => ({
      line_label: t.line_label.trim(), label: t.label.trim().slice(0, 80),
      target_premium: typeof t.target_premium === 'string' && t.target_premium.trim() ? t.target_premium.trim() : null, spec: normaliseSpec(t.spec),
    })) : [],
    picks: Array.isArray(raw.picks) ? raw.picks.filter(x => x && typeof x.line_label === 'string' && typeof x.insurer === 'string' && x.insurer.trim()).slice(0, 12).map(x => ({
      line_label: x.line_label.trim(), insurer: x.insurer.trim(), option: typeof x.option === 'string' && x.option.trim() ? x.option.trim() : null,
    })) : [],
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
  clientName: string; contactName: string | null; placementTitle: string; inceptionDate: string | null
  /** What the tables will show, for the model to write around; it never writes the tables. */
  lines: { label: string; spec: Spec; roundNo: number; quotes: { insurer: string; product: string | null; option: string; premium: string | null; perHead: string | null; limit: string | null; keyTerms: string[]; subjectivities: string[]; exclusions: string[] }[]; pending: string[]; declined: string[] }[]
  memory: string
}
export type ComparisonWords = { subject: string; opening: string; differences: string; closing: string }

/**
 * The words around the comparison tables. The tables themselves are built from the stored
 * figures (compare.ts) and placed between the opening and the differences.
 */
export async function draftClientSummary(i: ClientSummaryInput): Promise<ComparisonWords | null> {
  const partial = i.lines.some(l => l.pending.length > 0)
  const task = `A broker at Trade Risk Solutions is sending ${i.contactName ?? 'the client'} at ${i.clientName} a comparison of the quotations for "${i.placementTitle}"${i.inceptionDate ? ` (cover from ${i.inceptionDate})` : ''}. A table per line, built from the figures below, sits in the middle of the email; you write only the words around it.
opening: greet ${i.contactName ?? 'them'} by name and say in one or two sentences what follows${partial ? ', and that some insurers are still pricing (name them and which options, from "pending") and an update will follow' : ''}.
differences: two to four short sentences on what sets the options apart, using only the figures and terms below: the lowest price for each option, a benefit one has and others lack, a budget it fits, a subjectivity or exclusion that matters. Name insurer and plan. Never invent a benefit. Empty string if there is nothing useful to say.
closing: ask them to reply with the insurer and option they choose, so we can confirm it with the insurer; one or two sentences.
subject: short, names the cover; no reference tag (it is added).
Lines:
${i.lines.map(l => `• ${l.label} (round ${l.roundNo}; asked: ${specLines(l.spec).join('; ') || 'spec not recorded'})
${l.quotes.map(q => `   - ${q.insurer}${q.product ? ` · ${q.product}` : ''} [${q.option}]: premium ${q.premium ?? 'not stated'}${q.perHead ? ` (${q.perHead} per head)` : ''}; limit ${q.limit ?? 'not stated'}${q.keyTerms.length ? `; includes: ${q.keyTerms.join(', ')}` : ''}${q.subjectivities.length ? `; subject to: ${q.subjectivities.join(', ')}` : ''}${q.exclusions.length ? `; excludes: ${q.exclusions.join(', ')}` : ''}`).join('\n')}
   pending: ${l.pending.join('; ') || 'none'}; declined: ${l.declined.join(', ') || 'none'}`).join('\n')}

Context (do not repeat verbatim):
${i.memory || '(nothing yet)'}

Plain text. No sign-off block. Keep figures exactly as given.
Return JSON only: { "subject": string, "opening": string, "differences": string, "closing": string }`
  const { text, error } = await callGemini({
    agent: 'placement', feature: 'placement_client_summary', model: GEMINI_DEEP, system: await withVoice(task, 'client'), json: true, temperature: 0.2, maxOutputTokens: 6_000,
    parts: [{ text: 'Write it now.' }],
  })
  if (error) console.error('[placement] client summary', error)
  const raw = parseJson<Partial<ComparisonWords>>(text)
  if (!raw?.opening) return null
  const str = (v: unknown) => typeof v === 'string' ? v.trim() : ''
  return { subject: str(raw.subject) || `Quotations — ${i.placementTitle}`, opening: str(raw.opening), differences: str(raw.differences), closing: str(raw.closing) || 'Please reply with the insurer and option you would like, and I will confirm it with the insurer.' }
}

// ── 7. Confirming the client's choice with the insurer ──────────────────────────────────────

export type ConfirmInput = {
  insurerName: string; product: string | null; contactName: string | null; clientName: string; lineLabel: string
  option: string; premium: string | null; perHead: string | null; limit: string | null; excess: string | null; validity: string | null
  subjectivities: string[]; spec: Spec; inceptionDate: string | null
}

/** The email asking the insurer to bind the option the client chose. A person checks and sends it. */
export async function draftInsurerConfirmation(i: ConfirmInput): Promise<DraftText | null> {
  const task = `Write the email a broker at Trade Risk Solutions sends to ${i.contactName ?? 'the underwriter'} at ${i.insurerName} confirming that the client ${i.clientName} accepts their quotation and asking them to bind cover.
Quotation accepted: ${i.lineLabel}${i.product ? `, ${i.product}` : ''}, option ${i.option}; premium ${i.premium ?? 'as quoted'}${i.perHead ? ` (${i.perHead} per head)` : ''}; limit ${i.limit ?? 'as quoted'}; excess ${i.excess ?? 'as quoted'}; quotation valid ${i.validity ?? 'as stated'}.
Basis: ${specLines(i.spec).join('; ') || 'as per our request'}.
${i.inceptionDate ? `Cover to start ${i.inceptionDate}.` : 'Ask them to confirm the start date with us.'}
${i.subjectivities.length ? `Their quote is subject to: ${i.subjectivities.join('; ')}. Say which we will provide, or ask what they still need.` : ''}
Ask them to confirm cover is bound, and to send the policy schedule (or cover note) and their debit note or invoice.
Short, plain, numbered only if there are several requests. Keep figures exactly as given. No sign-off block.
Return JSON only: { "subject": string, "body": string }`
  const { text, error } = await callGemini({
    agent: 'placement', feature: 'placement_bind_confirm', model: GEMINI_DEEP, system: await withVoice(task, 'client'), json: true, temperature: 0.2, maxOutputTokens: 4_000,
    parts: [{ text: 'Write it now.' }],
  })
  if (error) console.error('[placement] bind confirm', error)
  const raw = parseJson<DraftText>(text)
  if (!raw?.body) return null
  return { subject: (raw.subject ?? '').trim() || `Confirmation to bind — ${i.clientName} — ${i.lineLabel}`, body: raw.body.trim() }
}
