/**
 * One label per email thread, from a fixed list. A rule sets it from who wrote, the subject, the
 * first email's own words and the files attached; a person may change it, and a person's label is
 * never overwritten. No model.
 *
 * What is read, in this order, and the first rule that matches wins:
 *   1. the subject: claim, endorsement, member movement, payment, an insurer's terms (quote
 *      received), renewal, quotation request, document. A renewal invoice is a payment, an
 *      insurer's renewal terms are a quote received.
 *   2. a subject that is not casework (a circular, an invitation, a booking, an automatic reply)
 *      stays Other, and nothing below is read.
 *   3. the first email's own words.
 *   4. the files on the thread.
 *   5. a cover named in the subject of a thread no insurer started: a quotation request.
 *
 * Pure and browser-safe. Tested in __tests__/labels.test.ts.
 */
export const LABELS = ['quotation_request', 'quote_received', 'renewal', 'claim', 'member_movement', 'endorsement', 'document', 'payment', 'other'] as const
export type Label = typeof LABELS[number]

export const LABEL_NAME: Record<Label, string> = {
  quotation_request: 'Quotation request', quote_received: 'Quote received', renewal: 'Renewal', claim: 'Claim',
  member_movement: 'Member movement', endorsement: 'Endorsement', document: 'Document', payment: 'Payment', other: 'Other',
}

export const isLabel = (v: unknown): v is Label => typeof v === 'string' && (LABELS as readonly string[]).includes(v)

/** One message of the thread, in date order. `party` is the sender's side, fixed by domain (shape.ts partyOf). */
export type LabelMessage = { party: string; attachments?: readonly string[] }
/** `opening` is the first email's own words: no history beneath (followups/rules.ts ownText). */
export type LabelInput = { subject: string | null | undefined; messages?: readonly LabelMessage[]; opening?: string | null }
export type Labelled = { label: Label; basis: string }

// A claims report is not a claim, nor is a no-claim discount.
const NOT_A_CLAIM = /no[- ]claims?( discount| declaration| bonus)?|claims? (experience|ratio|ratios|history|records?|summary|statistics|data|utili[sz]ation|free)/g
// A cover's own name is not a claim: "Work Injury Compensation", "Group Hospitalisation & Surgical".
const COVER_NAME = /work(men'?s?)? injury compensation( act)?|\bwica?\b|hospitali[sz]ation\s*(&|and)\s*surg\w+|hospitali[sz]ation (plan|insurance|cover|policy|scheme|benefits?)|(personal|group) accident|accident (&|and) health|accident (insurance|policy|plan|cover)|work(er|ers|men)?'?s? injury/g
const CLAIM = /\bclaims?\b|\bclaimants?\b|letter of guarantee|guarantee letter|\blog\b(?! ?in\b)|\bgop\b|notice of (loss|accident|claim)|\baccident\b|incident (report|involving|on|at)\b|\bhospitali[sz]ation\b|\binjur(y|ies|ed)\b|(date of|date) loss|loss date|\bdo[li]\b|\breimbursements?\b|\bdamages?\b|water (ingress|seepage)|non-reporting|\bmom ref\b|\bnpn\b|non-payment notification|loss adjusters?/
const PLATE = '[a-z]{1,3}\\d{1,4}[a-z]'
const ENDORSEMENT = new RegExp(String.raw`\bendorsements?\b|\bendt\b|\bamendments?\b|change (of|in) (address|name|occupation|vehicle|insured|sum insured|plan|limit)|^extension\b|extension of (cover|coverage|period|insurance|policy|time)|\bmonths? extension|vehicle (change|replacement)|additional (vehicles?|insured|locations?|premises)|\bde-?registration\b|financ(e|ing) company|hire purchase|increase (of|in) (sum insured|limit|cover)|(sales?|sold|transfer|disposal) (of )?${PLATE}\b|\b${PLATE} (disposal|transfer|sold)|\bsold\b.*\b${PLATE}\b`)
const MOVEMENT = /\b(additions?|deletions?|add|adding|delete|deleting|removal|terminations?|enrol\w*|joiners?|leavers?|resign\w*|headcount)\b|new (hires?|joiners?|staff|employees?|members?)\b|\bmember(ship)? (movements?|updates?|list|listing|changes?)\b|(staff|employee|members?) movements?|movements? of (staff|employees?|members?)|\bname ?lists?\b|census (update|listing)|dependa?nts? list/
const PAYMENT = /\b(invoices?|debit notes?|credit notes?|payments?|remittance|receipts?|refunds?|overdue|outstanding|billing|statements?|settlement)\b|premium (due|reminder|financing)|due premium|statement of account|\bsoa\b|reminder letter|co-?brok(ing|erage) fee|direct credit/
const QUOTE = /\bquot(e|es|ation|ations)\b|\brfq\b|\bproposals?\b|\bpricing\b|premium indication|\bterms\b|new inbound lead|\btender\b|\bplacement\b|(insurance|cover|coverage|bond|\bpl|\bpi|\bpii|\bwic|\bwica) (request|enquiry|inquiry)\b|request for (insurance|cover|coverage)/
const RENEWAL = /\brenew(al|als|ing|ed)?\b|\bexpir(y|ing|es)\b/
const DOCUMENT = /policy (documents?|schedule|wording|copy|issuance|agreement)|policy is (approved|issued)|your (insurance )?policy\b|certificates? of insurance|\bcoi\b|cover note|\be-?policy\b|\bcertificates?\b|\be-?documents?\b/
// Mail that is not about a client's cover: it stays Other whatever the body says.
const SYSTEM_NOTICE = /(services?|system|scheduled|planned) maintenance|^(automatic reply|auto-?reply|out of office|recall|accepted|declined|tentative|undeliverable)\b|auto-?acknowledg\w+|\[announcement\]|one-time passcode|\d+ items? ·/
const NOT_CASEWORK = /latest updates|\bcalculator\b|\bdrill\b|premium (tables?|rates)|\bannouncements?\b|\benhancements?\b|join us|\bitinerary\b|\bcirculars?\b|\bnewsletter\b|\bwebinars?\b|\binvitation\b|\binvited\b|\binvite\b|^(accepted|declined|tentative|cancell?ed)\s*:|\bbooking\b|discovery call|is acknowledged|\bcampaign\b|\btraining\b|\bworkshop\b|\bseminar\b|\btownhall\b|\bnetworking\b|\bforum\b|\bconference\b|\bfestival\b|\bpassword\b|\bsurvey\b(?! report)|\bcomplimentary\b|\binterview\b|\bmeet-?up\b|\bcatch-?up\b|\blunch\b|\b(e-)?meeting\b/

// The first email's own words.
const SAYS_CLAIM = /claims? (forms?|submission|notification|settlement|payment|colleagues|team|department|specialists?|processing)|(my|your|his|her|their|the|this|a|new|employee'?s?|wic|wica|ghs|gpa|fwmi|motor|medical|damage) claim\b|(submit|submitted|lodge|lodged|file|filed|register|notify|report)\w* (a |the |this |your |his |her |new )?claim\b|letter of guarantee|request(ing|ed)? (for )?(an? |the )?log\b|\bclaimants?\b|was (admitted|hospitali[sz]ed|injured|warded)|date of (accident|loss|incident)|accident involving|emergency (medical|treatment)|loss adjusters?|discharge voucher|non-payment notification/
const SAYS_ENDORSEMENT = /\bendorsement\b|\bde-?registration\b|notice of transfer|transfer of ownership|(has|have) sold\b/
const SAYS_MOVEMENT = /enrol(l)?ment (coverage )?(has been|is) confirmed|(staff|employee|member) movements?|(add|addition|delete|deletion|remove|removal|enrol|enrolment|terminate|termination)\w* (of )?(the )?(following |below |new |an? )?(employees?|staff|members?|dependa?nts?|workers?)\b/
const SAYS_PAYMENT = /debit notes?|tax invoice|(premium|renewal|rental|adjustment) invoices?|statement of account|remittance advice|credit notes?|payment (advice|reminder)|premium (due|outstanding|statement)|\boverdue\b|commission statement|e-?statements?|billing documents?/
const SAYS_QUOTE = /\bquot(e|es|ation|ations)\b|request for (a )?(quotation|terms|proposal)|proposal form|would like to (insure|enquire)|looking (for|to) (insurance|insure|cover)|(arrange|need|require) (for )?(the |an? )?(insurance|cover|coverage)\b|keen to (quote|write)|(wish|would like) to (work with you|present) /
// A request to an insurer for terms is a quotation request even when it names the expiring policy.
const ASKS_QUOTE = /request (for )?(a |an |your )?(\w+ )?(quotation|quote)\b|(wish|would like) to (work with you|present|request|invite you to quote)|keen to (quote|write)|(kindly|please|help to|assist to) quote\b|\bquote on\b|(provid\w+|give|share) (us |them |me )?(a |an |your |the )?(best )?(quotation|quote)\b|approached by|(potential|prospective) client|keen to work together|to procure\b/
const SAYS_RENEWAL = /(up|due) for renewal|renewal (notice|terms|invitation|instruction|quotation|quote|premium|documents?)|renew (the|your|our|this|their|my) |renewal of (the|your|our|their|my) |(our|your|their|the) (\w+ )?renewal\b|proceed with (the )?renewal|renewed quote|due to expire|\bexpiring\b/
// An insurer's own mail says "renewal" and "quotation" in its footers: from an insurer the words must be the point of the email.
const INSURER_SAYS_RENEWAL = /renewal (notice|terms|invitation|quotation|quote|instruction)|(up|due) for renewal|annual review/
const INSURER_SAYS_QUOTE = /pleased to (quote|offer)|(our|the|attached|enclose\w*|indicative|non-?binding) (\w+ ){0,4}(quotation|quote)\b|quotation (is|as|provided)|unable to (quote|offer)|decline to quote/
const SAYS_DOCUMENT = /(attached|enclosed|please find).{0,80}(policy (documents?|schedule|wording)|cover note|certificates?|e-?policy)/

// Files. A signature picture is not a file anyone sent.
const PICTURE = /^(image|outlook|att|noname)[\w .()-]*\.(png|jpe?g|gif|bmp)$|^noname$/
const QUOTE_FILE = /quot|proposal|terms|indication/
const CLAIM_FILE = /medical report|discharge summary|medical bill|police report|accident report/
const UNDERWRITING_FILE = /proposal[ _-]?form|(?<!due diligence |dd )questionnaire|biz ?file|biz ?profile|\bacra\b|financial statement|audit(ed)? (report|accounts)|letter of (award|acceptance)|\bloa\b|fact ?find/
const PAYMENT_FILE = /invoice|payment advice|debit note|credit note|statement of account|\bsoa\b|receipt/
const MOVEMENT_FILE = /name ?list|member(s)? ?(listing|movement)|movement|enrol/
const DOC_FILE = /polic(y|ies)|schedule|certificate|cover ?note|wording/
// A cover by name. Short forms are whole words.
const COVER = /performance bond|\bbonds?\b|professional indemnity|public liability|product liability|\bliability\b|employee benefits|group (hospital|medical|term|personal accident|insurance|business travel|health)|\bmotor\b|\bfleet\b|\bmarine\b|\bcargo\b|\bfire\b|\bproperty\b|\bcyber\b|travel insurance|contractors?'? all risks?|work injury|foreign worker|(medical|health|corporate|office|vehicle|business) insurance|\b(wica?|fwmi|pl|pi|pii|d&o|car|ear|cgl|iar|gpa|bta|ghs|gtl|eb)\b/
const INSURER = new Set(['insurer', 'tpa'])
const STARTS_WORK = new Set(['internal', 'client', 'partner'])

/** The subject as people wrote it: reply and forward prefixes and bracketed tags removed, lower case. */
export function plainSubject(subject: string | null | undefined): string {
  let s = String(subject ?? '').toLowerCase()
  for (let k = 0; k < 6; k++) { const next = s.replace(/^\s*((re|fw|fwd|回复|转发)\s*:|\[[^\]]{0,24}\])\s*/, ''); if (next === s) break; s = next }
  return s.replace(/\s+/g, ' ').trim()
}

const hit = (re: RegExp, s: string) => re.exec(s)?.[0]?.trim() ?? null
const fileNames = (messages: readonly LabelMessage[]) => messages.flatMap(m => (m.attachments ?? []).map(f => f.toLowerCase())).filter(f => !PICTURE.test(f))

export function labelOf(i: LabelInput): Labelled {
  const s = plainSubject(i.subject)
  const messages = i.messages ?? []
  const insurerFiles = fileNames(messages.filter(m => INSURER.has(m.party)))
  const otherFiles = fileNames(messages.filter(m => !INSURER.has(m.party)))
  const files = fileNames(messages)
  const says = (label: Label, word: string): Labelled => ({ label, basis: `subject: ${word}` })
  let w: string | null

  // 1. The subject.
  if ((w = hit(SYSTEM_NOTICE, s) ?? hit(SYSTEM_NOTICE, String(i.subject ?? '').toLowerCase().trim()))) return { label: 'other', basis: `not casework: ${w}` }
  if ((w = hit(CLAIM, s.replace(COVER_NAME, ' ').replace(NOT_A_CLAIM, ' ')))) return says('claim', w)
  if ((w = hit(ENDORSEMENT, s))) return says('endorsement', w)
  if ((w = hit(MOVEMENT, s))) return says('member_movement', w)
  if ((w = hit(PAYMENT, s))) return says('payment', w)
  const quote = hit(QUOTE, s)
  // An insurer's terms: a quotation thread on which an insurer sent a file, or any thread with an insurer's quotation file.
  const quoteFile = insurerFiles.find(f => QUOTE_FILE.test(f))
  if (quoteFile) return { label: 'quote_received', basis: `insurer file: ${quoteFile}` }
  if (quote && insurerFiles.length) return { label: 'quote_received', basis: `subject: ${quote}, with an insurer's file` }
  if ((w = hit(RENEWAL, s))) return says('renewal', w)
  if (quote) return says('quotation_request', quote)
  if ((w = hit(DOCUMENT, s))) return says('document', w)

  // 2. Not casework.
  if ((w = hit(NOT_CASEWORK, s))) return { label: 'other', basis: `not casework: ${w}` }
  if (messages.length > 0 && messages.every(m => m.party === 'automated')) return { label: 'other', basis: 'not casework: automated sender' }

  // 3. The first email's own words.
  const o = String(i.opening ?? '').toLowerCase().replace(/\s+/g, ' ').slice(0, 600)
  const fromInsurer = INSURER.has(messages[0]?.party ?? '')
  const wrote = (label: Label, word: string): Labelled => ({ label, basis: `first email: ${word}` })
  if (o) {
    if ((w = hit(SAYS_CLAIM, o.replace(COVER_NAME, ' ').replace(NOT_A_CLAIM, ' ')))) return wrote('claim', w)
    if ((w = hit(SAYS_ENDORSEMENT, o))) return wrote('endorsement', w)
    if ((w = hit(SAYS_MOVEMENT, o))) return wrote('member_movement', w)
    if ((w = hit(SAYS_PAYMENT, o))) return wrote('payment', w)
    if (!fromInsurer && (w = hit(ASKS_QUOTE, o))) return wrote('quotation_request', w)
    if ((w = hit(fromInsurer ? INSURER_SAYS_RENEWAL : SAYS_RENEWAL, o))) return wrote('renewal', w)
    if ((w = hit(fromInsurer ? INSURER_SAYS_QUOTE : SAYS_QUOTE, o))) return wrote(fromInsurer ? 'quote_received' : 'quotation_request', w)
    if ((w = hit(SAYS_DOCUMENT, o))) return wrote('document', w)
  }

  // 4. The files.
  const file = (label: Label, name: string): Labelled => ({ label, basis: `file: ${name}` })
  let f: string | undefined
  if ((f = files.find(n => CLAIM_FILE.test(n)))) return file('claim', f)
  if ((f = otherFiles.find(n => UNDERWRITING_FILE.test(n)))) return file('quotation_request', f)
  if ((f = files.find(n => PAYMENT_FILE.test(n)))) return file('payment', f)
  if ((f = files.find(n => MOVEMENT_FILE.test(n)))) return file('member_movement', f)
  if ((f = files.find(n => DOC_FILE.test(n)))) return file('document', f)

  // 5. A cover named on a thread TRS, a client or a partner started.
  if (STARTS_WORK.has(messages[0]?.party ?? '') && (w = hit(COVER, s))) return { label: 'quotation_request', basis: `subject names a cover: ${w}` }
  return { label: 'other', basis: 'no rule matched' }
}
