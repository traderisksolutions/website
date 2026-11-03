/**
 * What an inbound email on a case asks TRS to pass on. Pure: subject, the message's own words,
 * its attachments and which side sent it, in; one intent and the cues that fired, out. The
 * relay agent decides the onward email from the intent; a model is consulted only when nothing
 * here fires (relay/agent.ts), so every rule below is one a person can read and argue with.
 *
 * Scored on 2 Nov 2026 against 2,163 real inbound messages (relay scoring in the build notes):
 * the order of the rules matters more than any one pattern, and the words below a reply's
 * "On … wrote:" line must be cut first or an old instruction re-fires on a one-line thanks.
 */
import { classifyByName, isNoise } from '@/lib/documents/taxonomy'
import { isClaimLike } from '@/lib/admin/a/signals'

/** Which side of TRS wrote. Partner brokers and TPAs sit on the market side for relay purposes. */
export type RelaySide = 'client' | 'market'

export type RelayIntent =
  // client → TRS
  | 'quote_request' | 'claim_notify' | 'change_request' | 'cover_question' | 'document_request'
  | 'docs_provided' | 'instruction' | 'client_chase' | 'thanks'
  // market → TRS
  | 'quote_received' | 'decline' | 'documents_received' | 'insurer_note' | 'claim_decision'
  | 'market_question' | 'market_ack' | 'market_chase'
  | 'none'

export type Confidence = 'high' | 'medium' | 'low'

export type IntentInput = {
  side: RelaySide
  subject: string | null
  /** The message's own words, quoted history removed (ownWords). */
  text: string
  /** Attachment file names, images included; noise is dropped here. */
  files: string[]
  caseType: string | null
}

export type IntentResult = { intent: RelayIntent; confidence: Confidence; cues: string[]; docTypes: string[]; words: number }

/**
 * A reply's own words: everything above the first quoted-history marker, with ">"-prefixed lines
 * dropped. Mail clients vary; the markers below are the ones seen in TRS's mailbox.
 */
export function ownWords(text: string | null | undefined): string {
  const lines = String(text ?? '').split(/\r?\n/)
  const out: string[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (/^>/.test(line)) continue
    if (/^on .{5,160}wrote:?\s*$/i.test(line) || /^-{2,}\s*original message\s*-{2,}$/i.test(line) || /^-{3,}\s*forwarded message\s*-{3,}$/i.test(line)
      || /^from:\s.+@.+/i.test(line) || /^(?:de|von|da)\s*:\s.+@.+/i.test(line) || /^.{2,40}\s+于.{4,40}写道[:：]\s*$/.test(line) || /^\d{4}年\d{1,2}月\d{1,2}日.{0,40}写道[:：]?\s*$/.test(line)
      || /^(?:sent from my|get outlook for)/i.test(line)) break
    out.push(raw)
  }
  return out.join('\n').trim()
}

const QUOTE_DOCS = new Set(['quotation', 'renewal_notice'])
const COVER_DOCS = new Set(['cover_note', 'policy_schedule', 'certificate', 'policy_wording', 'benefit_summary', 'bond'])
const BILLING_DOCS = new Set(['insurer_debit_note', 'credit_note', 'payment_advice', 'endorsement'])
const MEMBER_DOCS = new Set(['member_movement', 'member_list'])
const PLACEMENT_DOCS = new Set(['proposal_form', 'contract_requirements', 'company_documents', 'claims_history', 'survey'])

export function docTypesOf(files: string[]): string[] {
  return Array.from(new Set(files.filter(f => f && !isNoise(f)).map(f => classifyByName(f) ?? (/\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(f) ? null : 'other')).filter((t): t is string => !!t)))
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length
const MONEY = /(?:S\$|SGD|USD|US\$|RM|\$)\s?\d[\d,]*(?:\.\d+)?/i
const ASK = /\b(please|kindly|could you|can you|would you|appreciate if|we (?:need|require|would like|are looking)|i (?:need|would like)|let us have|let me have|send (?:us|me|over))\b/i
const QUESTION = /\?|\b(is (?:it|this|that|he|she|the \w+) covered|does (?:the|our|this) polic|can we claim|what (?:is|are|does|would)|how (?:much|many|does|do)|are we covered|will (?:the|this) (?:policy|cover)|any (?:cover|coverage) for|(?:please|kindly) (?:advise|clarify|confirm)\b|wondering if)\b/i
const BULK = /\b(unsubscribe|view (?:this )?(?:email )?in (?:your )?browser|dear (?:partners?|subcontractors|valued (?:partner|client)s?|brokers?|business partners?)|new enhancements?|webinar|newsletter|promotion|campaign|e-?invitation|register now)\b/i
const INSTRUCTION = /\b(please proceed|proceed with (?:the |this |your |our )?(?:quot|policy|cover|renewal|option|plan|placement|insurance|binding|issuance|[A-Z][a-z]+ (?:quot|terms|offer))|go ahead|confirm(?:ed)? (?:to )?(?:proceed|accept|bind|renew)|we (?:accept|confirm|agree)|accept(?:ed)? the (?:quot(?:e|ation)|terms|offer)|agreeable to|agree to proceed|bind (?:the )?(?:cover|policy)|incept|place the (?:cover|policy)|signed (?:copy|form|proposal|version|moa) (?:is )?attached|duly signed|take up the (?:quot|offer|policy)|hold off|please hold|put (?:this |it )?on hold|do not proceed|please withdraw|cancel the claim|withdraw the claim|will not be proceeding|not (?:be )?proceed(?:ing)? with|decided not to|no longer (?:require|need|wish)|please send (?:the |this |below )?(?:email|note|letter) to|please (?:send|forward) (?:this|the below|the attached) to)\b/i
const CHASE = /\b(expedite|urgent(?:ly)?|so far|follow-up on|update on the|how (?:things are|is it) progressing|any (?:news|response|reply)|if any (?:company|insurer) (?:is )?able|follow(?:ing)? up on|may i follow up|wish to follow up|any update|status (?:of|on) (?:the|this|my|our)|advise (?:any |the )?status|gentle reminder|still waiting|haven'?t heard|not heard back|awaiting your (?:reply|response|update)|it has been \d+ (?:days|weeks))\b/i

/** Lines like "1. Description of equipment" or "- Site fencing": an insurer listing what it needs. */
export function listedAsks(text: string): string[] {
  const out: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:\d{1,2}[.)]|[-•*–])\s+(.{6,140})$/.exec(line)
    if (m && !/^(?:regards|thanks|best|tel|fax|mobile|email|www\.)/i.test(m[1])) out.push(m[1].trim())
  }
  return out.slice(0, 12)
}

/** "Before we proceed", "once … we will proceed", "if … proceed": a condition, not an instruction. */
const CONDITIONAL_PROCEED = /\b(before (?:we|i|you) (?:can )?proceed|once [^.\n]{0,80}(?:we|i) (?:will|can) proceed|if [^.\n]{0,60}proceed|prior to proceeding)\b/i

export function detectIntent(i: IntentInput): IntentResult {
  const subject = String(i.subject ?? '')
  const isReply = /^\s*(re|aw|回复|答复)\s*:/i.test(subject)
  const text = String(i.text ?? '')
  const both = `${subject}\n${text}`
  const n = words(text)
  const docs = docTypesOf(i.files)
  const has = (set: Set<string>) => docs.some(d => set.has(d))
  const cues: string[] = []
  const hit = (name: string, re: RegExp, on: string = both) => { const ok = re.test(on); if (ok) cues.push(name); return ok }
  const done = (intent: RelayIntent, confidence: Confidence): IntentResult => ({ intent, confidence, cues, docTypes: docs, words: n })

  // Bulk mail is not a relay: a newsletter, a product blast, a circular to all partners or subcontractors.
  if (BULK.test(both) || (text.match(/[\u{1F300}-\u{1FAFF}☀-➿]/gu) ?? []).length >= 3) { cues.push('bulk mail'); return done('none', 'high') }

  if (i.side === 'market') {
    const short = n <= 60
    const claimy = /\bclaims?\b/i.test(subject) || i.caseType === 'claim'
    const asks = listedAsks(text)
    const ack = /\b(noted(?: with thanks)?|well received|received with thanks|thank you for (?:your|the) (?:email|update|instruction|submission)|we will (?:revert|get back|update|proceed|look into|review)|will revert|acknowledge(?: receipt| the)?|in order|proceed(?:ing)? accordingly|to update accordingly|will proceed with|we have received (?:the|your)|once we have the quotation ready|e-?documents will|will proceed to|proceed to issue|we will be in touch|will liaise with you|has been (?:successfully )?registered|commence(?:d|s)? (?:the )?review|preparing our|will be sent to you|please proceed|we confirm agreement|agreed? to (?:grant|extend))\b/i
    const askPhrase = /\b(please (?:advise|provide|furnish|confirm|clarify|let us know|share|send|assist|re-?send)|kindly (?:advise|provide|furnish|confirm|clarify|share|assist|try|re-?send)|can you please|could you (?:please )?(?:advise|provide|confirm|share|help|re-?send)|we (?:need|require|would need|would appreciate)|additional information|further information|arrange for the|appreciate receiving)\b/i
    if (hit('we acknowledge', /\bwe acknowledge\b/i, text.slice(0, 240))) return done('market_ack', 'high')
    if (hit('acknowledgement', /\backnowledge(?:ment)?\b/i, `${subject}\n${text.slice(0, 160)}`) && !askPhrase.test(text)) return done('market_ack', 'high')
    if (short && !QUESTION.test(text) && !MONEY.test(text) && !docs.length && hit('ack phrase', ack, text)) return done('market_ack', 'high')
    if (hit('quotation attached', /\b(quot(?:e|ation)|indication|indicative|terms|slips?|rate)\b[^.\n]{0,80}\b(attached|append(?:ed)?|enclosed|herewith)\b|\b(attached|append(?:ed)?|enclosed)\b[^.\n]{0,40}\b(quot(?:e|ation)|indication|terms|slips?)\b|\brate\s*:\s*\d/i, text)) return done('quote_received', 'high')
    const DECISION = /\b(claim (?:is|has been|was) (?:approved|accepted|rejected|declined|repudiated|closed|paid|settled)|approv(?:e|ed|al) (?:of |for )?(?:the |this |your )?claim|declin(?:e|ed) (?:the |this |your )?claim|repudiat|offer (?:of|to settle)|settle the (?:matter|claim)|prepared to settle|settlement (?:amount|offer|sum|of S?\$|has been|is|will be)|(?:not )?payable|ex[- ]gratia|discharge voucher|without prejudice|admit(?:ted)? liability|liability is (?:not )?(?:admitted|accepted)|within the (?:policy )?excess|falls? within the excess|regret(?:fully)? (?:that|to inform))\b/i
    if (claimy && hit('claim decision', DECISION, text)) return done('claim_decision', 'high')
    const BILLING = /\b(debit notes?|credit notes?|tax invoices?|endorsement (?:no\.?|number|is|has been|attached|issued|processed|done|on|for)|attached endorsement|premium (?:adjustment|refund)|\bDN\s?\d|\bCN\s?\d|policy (?:has been |is )?(?:amended|updated|endorsed)|has been amended)\b/i
    if (has(BILLING_DOCS) || hit('billing subject', BILLING, subject)) { if (has(BILLING_DOCS)) cues.push(`doc:${docs.filter(d => BILLING_DOCS.has(d)).join(',')}`); return done('insurer_note', 'high') }
    if (!claimy && hit('decline phrase', /\b(not keen|not be keen|would(?:n'?t| not) be keen|unable to (?:quote|offer|provide|support|consider)|regret(?:fully|tably)?(?: to inform)?|decline(?:d)? to quote|no appetite|not (?:within|in) our appetite|not in a position to|will not be (?:able|providing|offering)|unable to accommodate|outside (?:our|the) appetite)\b/i, text)) return done('decline', 'high')
    if (has(QUOTE_DOCS)) { cues.push('doc:quotation'); return done('quote_received', 'high') }
    if (hit('billing nouns', /\b(debit notes?|credit notes?|tax invoices?|endorsement document|\bDN\s?\d|\bCN\s?\d)\b/i, text)) return done('insurer_note', 'high')
    if (hit('quote words + money', /\b(quot(?:e|ation)|indication|terms|premium|rate)\b/i) && MONEY.test(text)) { cues.push('money'); return done('quote_received', 'high') }
    if (asks.length >= 2) { cues.push(`${asks.length} listed items`); return done('market_question', 'high') }
    if (has(COVER_DOCS) && hit('attached phrase', /\b(please find (?:the )?attached|attached (?:is|are|herewith|please find)|enclosed|herewith)\b/i)) { cues.push(`doc:${docs.filter(d => COVER_DOCS.has(d)).join(',')}`); return done('documents_received', 'high') }
    if (has(COVER_DOCS)) { cues.push(`doc:${docs.filter(d => COVER_DOCS.has(d)).join(',')}`); return done('documents_received', 'medium') }
    if (hit('policy documents named', /\b(?:(?:enclosed|attached)(?: please find)? (?:the |our |your )?(?:renewal )?polic(?:y|ies)(?: documents?| schedules?| contracts?)?|polic(?:y|ies) (?:documents?|schedules?|contracts?)? ?(?:as )?attached|please refer to the attached polic(?:y|ies)|cover note (?:is )?attached|certificate (?:is )?attached)\b/i, text)) return done('documents_received', 'high')
    if (hit('chase phrase', /\b(please (?:help to |kindly )?follow up|kindly follow up|look forward to your update|any update|gentle reminder|awaiting your (?:reply|response|update)|still (?:waiting|pending))\b/i, text)) return done('market_chase', 'high')
    if (hit('ask phrase', askPhrase, text) || hit('question mark', /\?/, text)) { if (asks.length) cues.push(`${asks.length} listed items`); return done('market_question', 'medium') }
    if (hit('billing words', BILLING, text)) return done('insurer_note', 'medium')
    if (hit('quote words', /\b(quot(?:e|ation)|indication|our terms|renewal terms|premium)\b/i, text) && !short) return done('quote_received', 'low')
    if (short && hit('ack phrase (loose)', ack, text)) return done('market_ack', 'medium')
    return done('none', 'low')
  }

  // client side
  const askVerb = ASK.test(text)
  const claimLike = isClaimLike(subject, text)
  // Instructions first: "please proceed with the quotation" is an instruction, not a quote request, and not a thanks.
  if (!CONDITIONAL_PROCEED.test(text) && hit('instruction', INSTRUCTION, text)) return done('instruction', 'high')
  if (n <= 18 && !QUESTION.test(text) && !askVerb && !docs.length && !CHASE.test(text) && hit('thanks', /\b(thank(?:s| you)|noted|received|well received|ok(?:ay)?|great|appreciate(?:d)?|perfect|sure)\b/i, text)) return done('thanks', 'high')
  if (!docs.length && n <= 150 && hit('chase phrase', CHASE, text)) return done('client_chase', 'high')
  // A tender or RFQ in the subject is a quote request even when the tender text talks of fire and injury.
  const quoteWords = /\b(quot(?:e|ation)s?|rfq|request for (?:proposal|quotation)|best (?:price|rate|terms|premium)|renewal (?:terms|quote|quotation|premium)|renew(?:al)?|proposal|indication|how much|premium for|tender|insurance for|cover for|looking for (?:a |an )?(?:policy|insurance|cover)|would like to (?:insure|get|obtain|take up))\b/i
  if (!isReply && hit('rfq in subject', /\b(rfq|request for (?:proposal|quotation)|quotation|tender|enquiry|inquiry)\b/i, subject) && !/\bclaims?\b/i.test(subject)) return done('quote_request', 'high')
  if (claimLike && i.caseType !== 'claim') { cues.push('claim language'); return done('claim_notify', /\bclaims?\b/i.test(subject) ? 'high' : 'medium') }
  if (hit('document request', /\b(copy of (?:the |our )?(?:policy|certificate|schedule|wording|cover note|endorsement)|send (?:us|me|over) (?:the |a |our )?(?:policy|certificate|schedule|cert|wording|cover note)|certificate of (?:insurance|currency)|\bcoi\b|insurance certificate|policy (?:document|schedule|wording|copy|contract)s? (?:please|for|to)|soft ?copy of)\b/i, text) && (askVerb || QUESTION.test(text))) return done('document_request', 'high')
  const quoteAsk = quoteWords.test(isReply ? text : both) && askVerb && /\bquot/i.test(text) && !has(MEMBER_DOCS)
  const changeAsk = askVerb || /\b(effective|w\.?e\.?f\.?|with effect|from \d{1,2}[ /.-]|member list|name list|resigned|missing from|no longer with)\b/i.test(text)
  if (!quoteAsk && (has(MEMBER_DOCS) || (changeAsk && hit('change words', /\b(add(?:ition|ing)? (?:of )?(?:new )?(?:staff|employee|member|vehicle|driver|name)|delet(?:e|ion) (?:of )?(?:staff|employee|member|vehicle|driver|name|the following)|remov(?:e|al) (?:of )?(?:staff|employee|member|vehicle|driver|name|the following)|resign(?:ed|ation)?|new (?:staff|employee|hire|joiner)s?|joiner|leaver|left the company|last day (?:of (?:service|work|employment))?|cancel(?:lation)? (?:of |the )?(?:policy|cover)|change of (?:name|address|vehicle|plate|sum insured|insured)|update (?:the |our )?(?:name|address|vehicle|sum insured|headcount)|increase (?:the |in )?(?:sum insured|limit|headcount)|decrease (?:the |in )?(?:sum insured|limit|headcount)|endorse(?:ment)?|staff movement|movement list)\b/i, text)))) { if (has(MEMBER_DOCS)) cues.push('doc:member list'); return done('change_request', has(MEMBER_DOCS) ? 'high' : 'medium') }
  if (has(PLACEMENT_DOCS) && quoteWords.test(both)) { cues.push('doc:placement + quote words'); return done('quote_request', 'high') }
  const strongQuote = /\b(quot(?:e|ation)s?|rfq|request for (?:proposal|quotation)|best (?:price|rate|terms|premium)|renewal (?:terms|quote|quotation|premium)|indication|how much|premium for|tender|insurance for|cover for|looking for (?:a |an )?(?:policy|insurance|cover)|would like to (?:insure|get|obtain|take up))\b/i
  if (/\?/.test(text) && !strongQuote.test(text) && hit('cover question', QUESTION, text) && hit('cover words', /\b(cover(?:ed|age|s)?|claim(?:able)?|excess|deductible|limit|polic(?:y|ies)|insured|insurer|premium|rate|plan|renew|includ(?:e|ed)|exclud(?:e|ed)|benefit|entitled|reimburse|terms|offer|recommend)\b/i)) return done('cover_question', 'high')
  if (hit('quote words', quoteWords, isReply ? text : both) && (askVerb || /\b(expir(?:e|es|ing|y)|due for renewal|new business)\b/i.test(both))) { cues.push(askVerb ? 'ask verb' : 'expiry'); return done('quote_request', 'high') }
  if (hit('cover question', QUESTION, text) && hit('cover words', /\b(cover(?:ed|age|s)?|claim(?:able)?|excess|deductible|limit|polic(?:y|ies)|insured|insurer|premium|rate|renew|includ(?:e|ed)|exclud(?:e|ed)|benefit|entitled|reimburse|terms|offer)\b/i)) return done('cover_question', /\?/.test(text) ? 'high' : 'medium')
  if (hit('listed asks', /\?/, text) && listedAsks(text).length >= 2) return done('cover_question', 'medium')
  if (docs.length && hit('attached phrase', /\b(please find (?:the |some )?(?:attached|documents attached)|attached (?:is|are|herewith|please find|the)|enclosed|here (?:is|are) the|as attached|attaching)\b/i, text)) { cues.push(`doc:${docs.join(',')}`); return done('docs_provided', 'high') }
  if (docs.length) { cues.push(`doc:${docs.join(',')}`); return done('docs_provided', 'medium') }
  if (hit('attached phrase, no file on record', /\b(please find (?:the |some |our )?(?:\w+ ){0,3}attached|attached (?:is|are|herewith|please find|the|for your)|enclosed|as attached|attaching)\b/i, text)) return done('docs_provided', 'low')
  if (hit('chase phrase (loose)', CHASE, text)) return done('client_chase', 'medium')
  if (hit('quote words (loose)', quoteWords, text)) return done('quote_request', 'low')
  if (QUESTION.test(text) && /\?/.test(text)) { cues.push('question'); return done('cover_question', 'low') }
  return done('none', 'low')
}

/** Lines a client's words point at, by vocabulary. First match wins; null when nothing names a line. */
export function detectLine(text: string, hint: string | null = null): string | null {
  if (hint) return hint
  const t = text.toLowerCase()
  const table: [RegExp, string][] = [
    [/\b(wica|work injury|workmen'?s? comp)\b/, 'wica'],
    [/\b(foreign worker medical|fwmi|fw medical|mom medical)\b/, 'foreign_worker_medical'],
    [/\b(security bond|fw bond|foreign worker bond)\b/, 'foreign_worker_bond'],
    [/\b(ghs|gtl|gpa|gmm|gci|group (?:hospital|health|medical|term|personal accident|dental|life)|employee benefits?|\beb\b|medical (?:insurance|plan|benefits?)|hospitalisation|hospitalization|dental|outpatient)\b/, 'group_health'],
    [/\b(business travel|group travel|travel insurance)\b/, 'group_travel'],
    [/\b(keyman|key man|key person)\b/, 'keyman'],
    [/\b(motor|vehicle|fleet|lorry|lorries|van|truck|car insurance|plate|comprehensive cover for)\b/, 'commercial_vehicle'],
    [/\b(contractors?'? all risks?|\bcar\b(?= polic| insur| cover| quot| and)|erection all risks?|\bear\b|construction|piling|project (?:insurance|policy))\b/, 'construction_car'],
    [/\b(machinery breakdown|boiler|pressure vessel)\b/, 'machinery_breakdown'],
    [/\b(electronic equipment|\beei\b)\b/, 'electronic_equipment'],
    [/\b(professional indemnity|\bpi\b|\bpii\b|errors? (?:and|&) omissions|e&o)\b/, 'professional_indemnity'],
    [/\b(directors?(?: and| &)? officers|d&o|d & o|management liability)\b/, 'do'],
    [/\b(investment management|\bimi\b)\b/, 'imi'],
    [/\b(cyber)\b/, 'cyber'],
    [/\b(medical malpractice|clinic (?:insurance|cover))\b/, 'medical_malpractice'],
    [/\b(environmental|pollution)\b/, 'environmental_liability'],
    [/\b(public liability|general liability|\bgcl\b|\bpl\b|third party liability|products? liability)\b/, 'general_liability'],
    [/\b(fire|property (?:all risks?|insurance|cover|damage)|\biar\b|industrial all risks?|burglary|office (?:package|insurance|contents)|business interruption)\b/, 'iar_fire'],
    [/\b(marine cargo|cargo|shipment|transit|goods in transit)\b/, 'marine_cargo'],
    [/\b(stock throughput)\b/, 'stock_throughput'],
    [/\b(performance bond|surety|guarantee|bond(?: wording| format| for)|bid bond|tender bond)\b/, 'surety_bonds'],
    [/\b(trade credit|credit insurance|receivables)\b/, 'trade_credit'],
  ]
  for (const [re, slug] of table) if (re.test(t)) return slug
  return null
}
