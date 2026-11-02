/**
 * What intake reads off a message without a model: references, subject core, the kind of
 * sender, out-of-office replies, claim language, UENs. Pure.
 */

/** A reference reduced to letters and digits, upper case: "QZX-4821 K" → "QZX4821K". */
export const refKey = (s: string | null | undefined) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

const DATE_LIKE = /^(19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}$|^\d{1,2}[-/.]\d{1,2}[-/.](19|20)\d{2}$/
const PHONE_LIKE = /^(\+?65)?[689]\d{7}$/

/**
 * Tokens that could be a policy, claim or insurer reference: six or more characters, at least
 * three digits, not a date or a Singapore phone number. Matching against what is on file is the
 * caller's job; this only proposes.
 */
export function referenceTokens(text: string | null | undefined, max = 40): string[] {
  const out = new Set<string>()
  for (const m of String(text ?? '').matchAll(/(?<![\w@.])[A-Z0-9][A-Z0-9/-]{4,30}[A-Z0-9](?![\w@])/gi)) {
    const raw = m[0]
    if (DATE_LIKE.test(raw)) continue
    const key = refKey(raw)
    if (key.length < 6 || (key.match(/\d/g) ?? []).length < 3) continue
    if (PHONE_LIKE.test(key)) continue
    if (/^\d+$/.test(key) && key.length < 7) continue
    out.add(key)
    if (out.size >= max) break
  }
  return Array.from(out)
}

/** References on file that appear in the text. `onFile` maps refKey → anything. */
export function findReferences<T>(text: string, onFile: Map<string, T>): { key: string; value: T }[] {
  const hits = new Map<string, T>()
  const tokens = referenceTokens(text, 200)
  for (const t of tokens) {
    const v = onFile.get(t)
    if (v !== undefined) { hits.set(t, v); continue }
    // "Policy No.: 2026-F1234567-BFP/01" — the reference on file inside a longer token.
    if (t.length >= 10) for (const [k, val] of onFile) if (k.length >= 8 && t.includes(k)) hits.set(k, val)
  }
  return Array.from(hits, ([key, value]) => ({ key, value }))
}

const SUBJECT_PREFIX = /^\s*((re|fw|fwd|aw|wg|tr|sv|vs|rv|答复|回复|转发)\s*(\[\d+\])?\s*[:：]\s*|\[(external|ext|eksternal)\]\s*|\((trs|external)\)\s*)+/i
const STOP = new Set(['the', 'and', 'for', 'of', 'to', 'a', 'an', 'in', 'on', 'with', 'pte', 'ltd', 'limited', 'private', 'sdn', 'bhd', 'inc', 'llp', 'co', 'please', 'urgent', 'trs', 'dear', 'request', 're', 'fw', 'fwd'])

/** The words of a subject that say what it is about, with reply and forward prefixes gone. */
export function subjectCore(subject: string | null | undefined): string[] {
  let s = String(subject ?? '')
  for (let k = 0; k < 6; k++) { const n = s.replace(SUBJECT_PREFIX, ''); if (n === s) break; s = n }
  return Array.from(new Set(s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter(w => w.length >= 2 && !STOP.has(w))))
}

/** Words every insurance subject uses. Two subjects sharing only these are not about one matter. */
const GENERIC = new Set(('renewal renew renewed claim claims quotation quote quotes policy policies insurance insurer employee employees benefit benefits ' +
  'group ghs gtl gpa gp sp gci gmm wic wica fwmi fwb mcare plan plans premium premiums debit credit note notes dn cn member members list ' +
  'documents document movement movements addition additions removal deletion query enquiry inquiry new business staff sum insured cover ' +
  'coverage update follow up request reminder outstanding payment invoice invoices billing office medical hospitalisation hospital life ' +
  'term critical illness personal accident travel property fire liability marine motor 2024 2025 2026 2027 jan feb mar apr may jun jul aug ' +
  'sep sept oct nov dec january february march april june july august september october november december ' +
  'qbe aia singlife income zurich liberty allianz chubb msig axa tokio hl assurance great eastern etiqa sompo eq ntuc prudential raffles health').split(' '))

/** The words of a subject that say which matter it is: names, places, numbers. */
const FUNCTION_WORDS = new Set(('that this these those has have had was were is are be been being will would shall should can could may ' +
  'not no yes our your their his her its they them we you from into onto over under about after before between during until ' +
  'than then also only just all any each per via under status date dated pending further action notice period last step next ' +
  'team please kindly thanks thank regards dear hi hello attn attention ref reference number nos').split(' '))

/**
 * The words of a subject that say which matter it is: names, places, items. Not reference
 * numbers (a policy number is matched on its own), not function words, not insurance vocabulary.
 */
export const distinctive = (words: string[]) => words.filter(w => w.length >= 3 && !GENERIC.has(w) && !FUNCTION_WORDS.has(w) && (w.match(/\d/g) ?? []).length < 3 && !/^\d+$/.test(w))

export function overlap(a: string[] | Set<string>, b: string[] | Set<string>): number {
  const A = new Set(a), B = new Set(b)
  if (!A.size || !B.size) return 0
  let n = 0
  for (const x of A) if (B.has(x)) n++
  return n / Math.min(A.size, B.size)
}

export function isOutOfOffice(subject: string | null | undefined, body: string | null | undefined): boolean {
  const s = String(subject ?? ''), b = String(body ?? '').slice(0, 400)
  return /out of (the )?office|automatic reply|auto(matic)?[- ]?reply|autoreply|自动回复|balasan otomatis|abwesenheit/i.test(s)
    || /\b(i am|i'm|i will be) (currently )?(out of (the )?office|on (annual |medical )?leave|away from (the )?office)\b/i.test(b)
}

/** Calendar traffic and marketing: filed, never a case. */
export function isBulkMail(subject: string | null | undefined, body: string | null | undefined, attachments: string[] = []): boolean {
  const s = String(subject ?? ''), b = String(body ?? '')
  if (/^(invitation|updated invitation|accepted|declined|tentatively accepted|canceled event|cancelled event|new event)\b.*@/i.test(s) || attachments.some(a => /\.ics$/i.test(a))) return true
  if (/\b(newsletter|webinar|e-?invite|special offer|promo(tion)?s?)\b/i.test(s) && /unsubscribe|view (this|in) (email|browser)|manage (your )?preferences/i.test(b)) return true
  return /unsubscribe/i.test(b.slice(-1500)) && /view (this|in) (email|browser)|manage (your )?(email )?preferences|you are receiving this/i.test(b)
}

/** Claim language. The subject alone is strong; the body needs two separate signals. */
export function isClaimLike(subject: string | null | undefined, body: string | null | undefined): boolean {
  const strong = /\bclaims?\b|\bclaimant\b|notification of (loss|accident|incident)|\bWICA\b.*\b(accident|injur)|\baccident\b|\bincident report\b|\bloss adjust/i
  if (strong.test(String(subject ?? ''))) return true
  const words = [/\bclaims? (form|no\.?|number|ref)/i, /\baccident\b/i, /\binjur(y|ed|ies)\b/i, /\bmedical (leave|certificate|report)\b/i, /\bhospitali[sz]/i, /\bdamaged?\b/i, /\btheft\b|\bstolen\b/i, /\bcollision\b/i, /\bdate of (loss|accident|incident)\b/i, /\badjuster\b|\bsurveyor\b/i, /\bsubrogat/i, /\bleak(ed|ing|age)?\b|\bflood(ed|ing)?\b|\bburst\b|\bfire\b/i, /\brepair (quote|quotation|cost|invoice)/i, /\bpolice report\b/i, /\bbroken\b|\bcracked\b/i]
  const b = String(body ?? '').slice(0, 6000)
  return words.filter(w => w.test(b)).length >= 2
}

/** Singapore UENs: 8 or 9 digits plus a letter, or the T/S/R entity form (T08LL1234A). */
export function uensIn(text: string | null | undefined): string[] {
  return Array.from(new Set((String(text ?? '').toUpperCase().match(/\b(\d{8,9}[A-Z]|[TSR]\d{2}[A-Z]{2}\d{4}[A-Z])\b/g) ?? [])))
}

export type SenderKind = 'internal' | 'automated' | 'insurer' | 'client'

export function senderKind(from: string, opts: { isInternal: (e: string) => boolean; isAutomated: (e: string) => boolean; insurerDomains: Set<string> }): SenderKind {
  const e = from.toLowerCase()
  if (opts.isInternal(e)) return 'internal'
  if (opts.isAutomated(e)) return 'automated'
  const d = e.split('@')[1] ?? ''
  if (opts.insurerDomains.has(d) || Array.from(opts.insurerDomains).some(x => d.endsWith(`.${x}`))) return 'insurer'
  return 'client'
}
