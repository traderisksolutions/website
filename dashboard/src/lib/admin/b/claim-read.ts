/**
 * Reading a claim out of its mail, without a model. Pure, so every rule is tested.
 *
 * Each reader returns a value only when the words are in the mail, with the quote it came from.
 * Nothing is estimated: an amount nobody wrote stays empty, a stage nobody signalled stays where
 * it was. The model, when credit allows, can add to this; it cannot overrule it.
 */
import { parseWrittenDate } from './dates'

export const CLAIM_CLASSES = ['wica', 'ghs', 'gpa', 'motor', 'property', 'liability', 'marine', 'travel', 'other'] as const
export type ClaimClass = typeof CLAIM_CLASSES[number]
export const CLAIM_STAGES = ['notified', 'documents_pending', 'with_insurer', 'adjuster', 'offer', 'settled', 'declined', 'withdrawn'] as const
export type ClaimStage = typeof CLAIM_STAGES[number]

export type MailLine = {
  /** 'trs' when a TRS address sent it, 'insurer' when an insurer's domain did, else 'client'. */
  side: 'trs' | 'insurer' | 'client'
  sent_at: string | null
  text: string
  /** Rebuilt from a forward or quoted history: read for facts, never counted as received. */
  rebuilt?: boolean
  /** A TRS message with an insurer address on To or Cc. */
  toInsurer?: boolean
}

export type Found<T> = { value: T; quote: string } | null

const CLASS_WORDS: [ClaimClass, RegExp][] = [
  ['wica', /\b(wica|work ?injury|wic\b|workmen'?s comp|work injury compensation)/i],
  ['ghs', /\b(ghs|group hospital|hospitali[sz]ation|group health|inpatient)/i],
  ['gpa', /\b(gpa|group personal accident|personal accident)/i],
  ['motor', /\b(motor|vehicle|van|lorry|car|fleet|commercial vehicle)\b/i],
  ['marine', /\b(marine|cargo|hull|bill of lading)/i],
  ['travel', /\b(travel insurance|business travel|trip)/i],
  ['liability', /\b(public liability|product liability|liability|professional indemnity|\bPI\b|D&O)/i],
  ['property', /\b(fire|property|all risks?|iar|burglary|office package|shop ?keeper|machinery)/i],
]

/** The class from the policy on file first, then the mail's own words. */
export function claimClass(policyClass: string | null | undefined, text = ''): ClaimClass {
  for (const src of [policyClass ?? '', text]) {
    if (!src) continue
    // Contractors' all risk is written "CAR" in capitals; read case-sensitively so a car is not one.
    if (/\bCAR\b/.test(src) || /contractors'? all risks?/i.test(src)) return 'property'
    for (const [c, re] of CLASS_WORDS) if (re.test(src)) return c
  }
  return 'other'
}

const around = (text: string, i: number, len: number) => text.slice(Math.max(0, i - 40), Math.min(text.length, i + len + 40)).replace(/\s+/g, ' ').trim().slice(0, 200)

/** The insurer's own claim reference: a token with a digit after "claim no", "claim ref", "our ref". */
export function findInsurerRef(text: string, exclude: string[] = []): Found<string> {
  const ex = new Set(exclude.map(e => e.toLowerCase()))
  const re = /\b(?:claim\s*(?:no\.?|number|ref(?:erence)?\.?(?:\s*no\.?)?|#)|our\s*ref(?:erence)?\.?|claim)\s*[:\-–]?\s*([A-Z]{0,4}\d[A-Z0-9/\-.]{4,29}|[A-Z0-9][A-Z0-9/\-.]{4,29})/gi
  for (const m of text.matchAll(re)) {
    const v = m[1].replace(/[.\-/]+$/, '')
    if (!/\d/.test(v) || ex.has(v.toLowerCase()) || parseWrittenDate(v) || /^\d{4}$/.test(v)) continue
    return { value: v, quote: around(text, m.index ?? 0, m[0].length) }
  }
  return null
}

/** A policy number, only one TRS already holds for this client. Never read a new one from mail. */
export function findPolicyNumber(text: string, known: string[]): Found<string> {
  const flat = text.toLowerCase()
  for (const k of known.filter(k => k && k.length >= 5).sort((a, b) => b.length - a.length)) {
    const i = flat.indexOf(k.toLowerCase())
    if (i >= 0) return { value: k, quote: around(text, i, k.length) }
  }
  return null
}

const AMOUNT = /(?:S\$|SGD|US\$|USD|\$)\s?([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/gi

function amountNear(text: string, words: RegExp): Found<number> {
  for (const m of text.matchAll(AMOUNT)) {
    const i = m.index ?? 0
    const window = text.slice(Math.max(0, i - 80), i + m[0].length + 30)
    if (!words.test(window) || /\b(limit|sum insured|deductible|excess|premium|up to)\b/i.test(window)) continue
    const v = Number(m[1].replace(/,/g, ''))
    if (Number.isFinite(v) && v >= 50 && v < 100_000_000) return { value: v, quote: around(text, i, m[0].length) }
  }
  return null
}

export const findClaimedAmount = (text: string) => amountNear(text, /\b(claim(?:ed|ing)? amount|amount claimed|total claim|claiming|claim of|claim for|loss amount|quantum)\b/i)
export const findSettledAmount = (text: string) => amountNear(text, /\b(settle(?:d|ment)?|payable|approved (?:amount|sum)|offer(?:ed)?|discharge voucher|payment of)\b/i)

/** The date of loss as written after "date of loss / incident / accident" or "occurred on". */
export function findLossDate(text: string): Found<string> {
  const re = /\b(?:date of (?:loss|incident|accident|injury)|(?:loss|incident|accident) date|occurred on|happened on)\s*[:\-–]?\s*(?:on\s+)?([0-9]{1,4}[/.\- ][0-9a-z]{1,9}[/.\- ,]+[0-9]{2,4}|[a-z]{3,9}\.? [0-9]{1,2},? [0-9]{4})/gi
  for (const m of text.matchAll(re)) {
    const iso = parseWrittenDate(m[1])
    if (iso) return { value: iso, quote: around(text, m.index ?? 0, m[0].length) }
  }
  return null
}

/** The injured worker, patient or claimant, when the mail names one after a label. */
export function findClaimant(text: string): Found<string> {
  const re = /\b(?:claimant|injured (?:worker|person|employee)|insured person|patient|employee name|name of (?:employee|claimant|injured))\s*[:\-–]\s*([A-Z][A-Za-z'.\- ]{2,60}?)(?=\s*(?:\n|,|;|\(|$| nric| fin| ic\b| dob| age))/gi
  for (const m of text.matchAll(re)) {
    const v = m[1].trim()
    if (/^[A-Z]/.test(v) && v.split(' ').length <= 6) return { value: v, quote: around(text, m.index ?? 0, m[0].length) }
  }
  return null
}

const STAGE_RULES: { stage: ClaimStage; side: MailLine['side'][]; re: RegExp }[] = [
  { stage: 'withdrawn', side: ['client', 'trs'], re: /\b(withdraw(?:n|ing)? (?:the |our |this )?claim|not (?:proceed|pursue)(?:ing)? with the claim)\b/i },
  { stage: 'declined', side: ['insurer', 'trs'], re: /\b(repudiat\w*|claim (?:is |has been )?(?:declined|rejected)|unable to (?:accept|admit) (?:the |this )?claim|not covered under)\b/i },
  { stage: 'settled', side: ['insurer', 'trs', 'client'], re: /\b(claim (?:has been |is )?settled|payment (?:has been|was) (?:made|released|credited)|cheque (?:has been )?(?:issued|sent)|we have (?:received|got) the (?:payment|cheque))\b/i },
  { stage: 'offer', side: ['insurer', 'trs'], re: /\b(discharge (?:voucher|form)|settlement offer|offer(?:ed)? (?:to settle|a settlement|an amount)|letter of offer|notice of assessment)\b/i },
  { stage: 'adjuster', side: ['insurer', 'trs', 'client'], re: /\b(loss adjuster|adjusters?\b|surveyor|site (?:visit|inspection)|appointed .{0,30}adjust)/i },
  { stage: 'documents_pending', side: ['insurer', 'trs'], re: /\b(please (?:provide|submit|send|furnish)|kindly (?:provide|submit|send|furnish|forward)|outstanding documents?|(?:the )?following documents?|documents? (?:required|needed))\b/i },
  { stage: 'with_insurer', side: ['trs'], re: /\b(submitted (?:the )?claim|(?:attached|enclosed|please find) .{0,40}claim (?:form|documents|submission)|notify(?:ing)? (?:you )?of (?:a|the) claim|claim notification)\b/i },
]

/** Rank of a stage; a claim moves forward unless the mail says it closed or reopened. */
const RANK: Record<ClaimStage, number> = { notified: 0, documents_pending: 1, with_insurer: 2, adjuster: 3, offer: 4, settled: 5, declined: 5, withdrawn: 5 }

/**
 * The stage the newest signalling message sets. Messages are read oldest to newest; a later
 * documents request after submission puts the claim back to documents_pending. Rebuilt
 * messages count, since they are what happened, but only for stage, not for who TRS waits on.
 */
export function inferStage(lines: MailLine[], current: ClaimStage = 'notified'): { stage: ClaimStage; quote: string | null } {
  let stage = current, quote: string | null = null
  const sorted = [...lines].sort((a, b) => String(a.sent_at ?? '').localeCompare(String(b.sent_at ?? '')))
  for (const l of sorted) {
    for (const r of STAGE_RULES) {
      if (!r.side.includes(l.side)) continue
      const m = r.re.exec(l.text)
      if (!m) continue
      // Once closed, only an explicit close of another kind changes it.
      if (RANK[stage] === 5 && RANK[r.stage] !== 5) break
      if (r.stage === 'documents_pending' || RANK[r.stage] >= RANK[stage] || RANK[r.stage] === 5) {
        stage = r.stage; quote = around(l.text, m.index, m[0].length)
      }
      break
    }
  }
  return { stage, quote }
}

/** Who the claim waits on: the side that has not answered the last message of the other side. */
export function waitingOn(lines: MailLine[], stage: ClaimStage): 'client' | 'insurer' | 'trs' | null {
  if (RANK[stage] === 5) return null
  const live = lines.filter(l => !l.rebuilt).sort((a, b) => String(a.sent_at ?? '').localeCompare(String(b.sent_at ?? '')))
  const last = live[live.length - 1]
  if (!last) return 'trs'
  if (last.side !== 'trs') return 'trs'
  // TRS spoke last: it waits on whoever it wrote to.
  return last.toInsurer ? 'insurer' : 'client'
}

/**
 * The documents insurers usually ask for, per class. A starting checklist, not a rule of any
 * insurer: the insurer's own request, when the mail has one, is what counts, and staff can tick
 * any item off. `match` finds the item in a file name or the mail.
 */
export const CHECKLIST: Record<ClaimClass, { item: string; match: RegExp }[]> = {
  wica: [
    { item: 'Incident report', match: /incident report|accident report|iReport/i },
    { item: 'Medical certificates', match: /\bMC\b|medical cert|medical leave/i },
    { item: 'Medical bills', match: /medical (?:bill|invoice|receipt)|hospital (?:bill|invoice)|clinic (?:bill|receipt)|\bbills?\b/i },
    { item: 'Salary records', match: /payslip|salary|pay ?slip|wages?/i },
  ],
  ghs: [
    { item: 'Claim form', match: /claim form/i },
    { item: 'Itemised hospital bill', match: /hospital bill|itemi[sz]ed|final bill|tax invoice/i },
    { item: 'Discharge summary or medical report', match: /discharge summary|medical report|memo/i },
  ],
  gpa: [
    { item: 'Claim form', match: /claim form/i },
    { item: 'Medical report', match: /medical report|doctor'?s report/i },
    { item: 'Medical bills', match: /medical (?:bill|receipt)|\bbills?\b|receipts?/i },
  ],
  motor: [
    { item: 'Accident report', match: /accident report|GIA report|\bGIA\b/i },
    { item: 'Photos', match: /photo|\.jpe?g|\.png|\.heic/i },
    { item: 'Repair estimate', match: /estimate|quotation|repair/i },
    { item: 'Driving licence', match: /licen[cs]e/i },
  ],
  property: [
    { item: 'Claim form', match: /claim form/i },
    { item: 'Photos', match: /photo|\.jpe?g|\.png|\.heic/i },
    { item: 'Invoices or repair estimates', match: /invoice|estimate|quotation/i },
    { item: 'Police or incident report', match: /police report|incident report/i },
  ],
  liability: [
    { item: "Third party's claim letter", match: /letter of demand|claim letter|lawyer'?s letter|demand/i },
    { item: 'Incident report', match: /incident report/i },
    { item: 'Photos', match: /photo|\.jpe?g|\.png/i },
  ],
  marine: [
    { item: 'Bill of lading', match: /bill of lading|\bB\/?L\b/i },
    { item: 'Commercial invoice', match: /commercial invoice|invoice/i },
    { item: 'Packing list', match: /packing list/i },
    { item: 'Survey report', match: /survey/i },
  ],
  travel: [
    { item: 'Claim form', match: /claim form/i },
    { item: 'Receipts', match: /receipt/i },
    { item: 'Travel itinerary or boarding pass', match: /itinerary|boarding pass|e-?ticket/i },
  ],
  other: [
    { item: 'Claim form', match: /claim form/i },
  ],
}

export type DocState = { item: string; received: boolean; source: string | null }

/** The checklist ticked against the files held and the mail. Files count; a mention alone does not. */
export function documentState(cls: ClaimClass, files: string[]): DocState[] {
  return CHECKLIST[cls].map(c => {
    const f = files.find(n => c.match.test(n))
    return { item: c.item, received: !!f, source: f ?? null }
  })
}

/** Gaps: checklist items with no file, plus files the mail names but TRS never received. */
export function claimGaps(docs: DocState[], namedButMissing: string[], cls: ClaimClass): { item: string; basis: string }[] {
  const out = docs.filter(d => !d.received).map(d => ({ item: d.item, basis: `usual ${cls.toUpperCase()} claim document` }))
  for (const n of namedButMissing) if (!out.some(o => o.item === n)) out.push({ item: n, basis: 'named in a forwarded or quoted email; TRS does not hold it' })
  return out
}
