/**
 * One label per email thread, from a fixed list. A rule sets it from who wrote, the subject and
 * the files attached; a person may change it, and a person's label is never overwritten. No model.
 * The first rule that matches wins, in the order below: a renewal invoice is a payment, an
 * insurer's renewal terms are a quote received.
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
export type LabelInput = { subject: string | null | undefined; messages?: readonly LabelMessage[] }
export type Labelled = { label: Label; basis: string }

const CLAIM = /\bclaims?\b(?!\s+(experience|ratio|ratios|history|records?|summary|statistics|data|utili[sz]ation))|letter of guarantee|\blog request\b|notice of (loss|accident|claim)|incident report|\bhospitali[sz]ation\b|\binjur(y|ies|ed)\b/
// A cover's own name is not a claim: "Work Injury Compensation", "Group Hospitalisation & Surgical".
const COVER_NAME = /work(men'?s?)? injury compensation( act)?|\bwica?\b|hospitali[sz]ation\s*(&|and)\s*surg\w+|hospitali[sz]ation (plan|insurance|cover|policy|scheme|benefits?)|personal accident/g
const ENDORSEMENT = /\bendorsements?\b|\bendt\b|\bamendments?\b|change of (address|name|occupation|vehicle|insured)|extension of (cover|period)|vehicle (change|replacement)/
const MOVEMENT = /\b(additions?|deletions?|add|adding|delete|deleting|removal|terminations?|enrol\w*|joiners?|leavers?|resign\w*|headcount)\b|new (hires?|joiners?|staff|employees?|members?)\b|\bmember(ship)? (movements?|updates?|list|changes?)\b|census update/
const PAYMENT = /\b(invoices?|debit notes?|credit notes?|payments?|remittance|receipts?|refunds?|overdue)\b|premium (due|outstanding|reminder)|outstanding premium|statement of account|\bsoa\b/
const QUOTE = /\bquot(e|es|ation|ations)\b|\brfq\b|\bproposals?\b|\bpricing\b|premium indication|\bterms\b/
const RENEWAL = /\brenew(al|als|ing|ed)?\b|\bexpir(y|ing|es)\b/
const DOCUMENT = /policy (documents?|schedule|wording|copy|issuance)|certificates? of insurance|\bcoi\b|cover note|\be-?policy\b|\bcertificates?\b/
const DOC_FILE = /polic(y|ies)|schedule|certificate|cover ?note|wording/
const QUOTE_FILE = /quot|proposal|terms|indication/
const INSURER = new Set(['insurer', 'tpa'])

/** The subject as people wrote it: reply and forward prefixes and bracketed tags removed, lower case. */
export function plainSubject(subject: string | null | undefined): string {
  let s = String(subject ?? '').toLowerCase()
  for (let k = 0; k < 6; k++) { const next = s.replace(/^\s*((re|fw|fwd|回复|转发)\s*:|\[[^\]]{0,24}\])\s*/, ''); if (next === s) break; s = next }
  return s.replace(/\s+/g, ' ').trim()
}

const hit = (re: RegExp, s: string) => re.exec(s)?.[0]?.trim() ?? null

export function labelOf(i: LabelInput): Labelled {
  const s = plainSubject(i.subject)
  const messages = i.messages ?? []
  const insurerFiles = messages.filter(m => INSURER.has(m.party)).flatMap(m => (m.attachments ?? []).map(f => f.toLowerCase()))
  const files = messages.flatMap(m => (m.attachments ?? []).map(f => f.toLowerCase()))
  const says = (label: Label, word: string): Labelled => ({ label, basis: `subject: ${word}` })
  let w: string | null
  if ((w = hit(CLAIM, s.replace(COVER_NAME, ' ')))) return says('claim', w)
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
  const docFile = files.find(f => DOC_FILE.test(f))
  if (docFile) return { label: 'document', basis: `file: ${docFile}` }
  return { label: 'other', basis: 'no rule matched' }
}
