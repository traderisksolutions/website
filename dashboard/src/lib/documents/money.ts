/**
 * The money in a document, read by rule from its text: an insurer's debit or credit note, a
 * schedule or renewal notice's terms, a claim letter's settlement. Pure; no I/O. Every figure
 * comes with the line it was read from, so a person can check it.
 *
 * The text is whatever the attachment parser kept (pdf-parse, or a model's transcription with
 * markdown tables), so the readers tolerate `**bold**`, `*****` padding, `<br>` and table pipes.
 * A field the document does not state stays null; nothing is guessed.
 */

export type MoneyField = { value: number; line: string }
export type DateField = { value: string; line: string }

export type InsurerNoteRead = {
  kind: 'debit' | 'credit'
  /** The client's tax invoice, or the intermediary's commission copy of the same transaction. */
  copy: 'client' | 'intermediary'
  /** TRS's own debit and credit notes are already in debit_notes; the store skips them. */
  issuer: 'insurer' | 'trs'
  note_no: string | null
  policy_no: string | null
  insurer: string | null
  issued_on: string | null
  effective_on: string | null
  period_start: string | null
  period_end: string | null
  currency: string
  /** Premium before GST. */
  gross: MoneyField | null
  gst: MoneyField | null
  /** The figure the note asks for or refunds, GST included. */
  total: MoneyField | null
  commission: MoneyField | null
  headcount: number | null
  /** Per-plan or per-item lines: "GHSM Group Hospital & Surgical Plan 474.66". */
  items: { label: string; amount: number }[]
  endorsement: boolean
  confidence: 'high' | 'medium' | 'low'
}

export type ScheduleRead = {
  policy_no: string | null
  insurer: string | null
  period_start: string | null
  period_end: string | null
  currency: string
  gross: MoneyField | null
  gst: MoneyField | null
  total: MoneyField | null
  sum_insured: MoneyField | null
  excess: MoneyField | null
  headcount: number | null
  /** Gross premium per head, when the schedule states both. */
  rate_per_head: number | null
  /** WICA: the wages the premium is rated on. */
  wages: MoneyField | null
  /** Renewal notices carry the insurer's invited terms, not a bill. */
  renewal_terms: boolean
  confidence: 'high' | 'medium' | 'low'
}

export type ClaimSettlementRead = {
  claim_no: string | null
  policy_no: string | null
  decision: 'approved' | 'paid' | 'declined' | null
  amount: MoneyField | null
  event_date: string | null
  letter_date: string | null
  claimant: string | null
  confidence: 'high' | 'medium' | 'low'
}

const MONTHS: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', sept: '09', oct: '10', nov: '11', dec: '12' }
const DATE_RE = /(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})|(\d{1,2})[ \-]([A-Za-z]{3,9})[ ,\-]*(\d{2,4})|([A-Za-z]{3,9}) (\d{1,2}), (\d{4})/
const DATE_G = new RegExp(DATE_RE.source, 'g')
const AMOUNT_RE = /\(?-?\s*(?:S\$|SGD|USD|MYR|RM|\$)?\s*(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+\.\d{2})\s*-?\)?/
const AMOUNT_G = new RegExp(AMOUNT_RE.source, 'g')

/** Markdown and padding out, one field per line. */
export function normaliseMoneyText(t: string): string {
  return (t ?? '')
    .replace(/\r/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\*\*/g, '')
    .replace(/\*{3,}/g, ' ')
    .replace(/\|/g, ' | ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
}

/** "28/10/2026", "28 Oct 2026", "28-OCT-2026", "Jun 19, 2026" → "2026-10-28". Day-first throughout. */
export function parseDate(s: string | null | undefined): string | null {
  if (!s) return null
  const m = DATE_RE.exec(s)
  if (!m) return null
  let d: string, mo: string, y: string
  if (m[1]) { d = m[1]; mo = m[2]; y = m[3] }
  else if (m[4]) { d = m[4]; mo = MONTHS[m[5].toLowerCase().slice(0, 4)] ?? MONTHS[m[5].toLowerCase().slice(0, 3)] ?? ''; y = m[6] }
  else { d = m[8]; mo = MONTHS[m[7].toLowerCase().slice(0, 3)] ?? ''; y = m[9] }
  if (!mo) return null
  if (y.length === 2) y = `20${y}`
  const dd = d.padStart(2, '0'), mm = String(Number(mo)).padStart(2, '0')
  if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return null
  // Date.parse rolls 31 February into March; the month must survive the round trip.
  const t = Date.UTC(Number(y), Number(mm) - 1, Number(dd))
  if (Number.isNaN(t) || new Date(t).getUTCMonth() !== Number(mm) - 1) return null
  return `${y}-${mm}-${dd}`
}

/** "1,118.53-", "(381.50)", "-$ (125.96)" are negative; "SGD 3,357.20" is 3357.2. */
export function parseAmount(s: string | null | undefined): number | null {
  if (!s) return null
  const m = AMOUNT_RE.exec(s)
  if (!m) return null
  const n = Number(m[1].replace(/,/g, ''))
  if (!Number.isFinite(n)) return null
  const raw = m[0]
  const negative = /\(/.test(raw) || /^\s*-/.test(raw) || /-\s*\)?\s*$/.test(raw) || /-\s*\$?\s*\(/.test(s.slice(Math.max(0, m.index - 4), m.index + 2))
  return negative ? -n : n
}

/** The text one trimmed line at a time, without markdown table rules ("| :--- | :--- |"). */
const lines = (t: string) => t.split('\n').map(l => l.trim()).filter(l => l && !/^[\s|:-]+$/.test(l))
const r2 = (n: number) => Math.round(n * 100) / 100

/** The last amount on a line: "GST : 9.00 277.20" is the GST, not the rate. */
function lastAmount(s: string): number | null {
  const all = s.match(AMOUNT_G) ?? []
  for (let i = all.length - 1; i >= 0; i--) { const a = parseAmount(all[i]); if (a != null) return a }
  return null
}

/**
 * A table written as a header row and a value row ("| Class of Policy: | Policy No.: | Debit Note |"
 * over "| Shopcare | SI26Q02946 | DN26130622 |"): the cell under the label.
 */
function cellBelow(ls: string[], i: number, label: RegExp): string | null {
  const cells = ls[i].split('|').map(c => c.trim())
  if (cells.length < 3) return null
  const col = cells.findIndex(c => label.test(c))
  const next = ls[i + 1]?.split('|').map(c => c.trim())
  if (col < 0 || !next || next.length <= col) return null
  const v = next[col]
  return v && !label.test(v) ? v : null
}

/**
 * The amount on the first line whose label matches: the last figure on that line, or the line
 * after it when the label sits alone, or the cell below it in a header-over-values table.
 * `skip` rejects lines such as "GST Regn No."
 */
/**
 * The figure in the cells after a label: the first cell holding an amount, except a rate cell
 * ("| GST | 9.00 | 10.40 |", "| Commission : | 15.00 | 3,159.00 |") when a figure follows it.
 * Within a cell the last figure counts ("GST : 9.00 277.20").
 */
function amountInCells(own: string): number | null {
  const cells = own.split('|').map(c => c.trim()).filter(Boolean)
  const found = cells.map(c => lastAmount(c))
  for (let i = 0; i < found.length; i++) {
    const a = found[i]
    if (a == null) continue
    const rate = Math.abs(a) <= 100 && /\.00\b/.test(cells[i]) && found.slice(i + 1).some(x => x != null)
    if (rate) continue
    return a
  }
  return null
}

function amountAfter(ls: string[], label: RegExp, skip?: RegExp): MoneyField | null {
  for (let i = 0; i < ls.length; i++) {
    const l = ls[i]
    if (!label.test(l) || (skip && skip.test(l))) continue
    const own = l.slice(l.search(label)).replace(label, '')
    const a = amountInCells(own)
    if (a != null) return { value: a, line: l }
    const below = cellBelow(ls, i, label)
    if (below) { const c = parseAmount(below); if (c != null) return { value: c, line: `${l} ${ls[i + 1]}` } }
    const next = ls[i + 1]
    if (next && !/[A-Za-z]{4,}/.test(next.replace(/SGD|USD|S\$|MYR/g, ''))) {
      const b = lastAmount(next)
      if (b != null) return { value: b, line: `${l} ${next}` }
    }
  }
  return null
}

function textAfter(ls: string[], label: RegExp, value: RegExp, accept: (v: string) => boolean = () => true): { value: string; line: string } | null {
  const take = (s: string): string | null => { const m = value.exec(s); return m && m.index === 0 && accept(m[0].trim()) ? m[0].trim() : null }
  for (let i = 0; i < ls.length; i++) {
    const l = ls[i]
    const at = l.search(label)
    if (at < 0) continue
    const rest = l.slice(at).replace(label, '').replace(/^[\s:.|]+/, '')
    const same = take(rest)
    if (same) return { value: same, line: l }
    const below = cellBelow(ls, i, label)
    if (below) { const c = take(below); if (c) return { value: c, line: `${l} ${ls[i + 1]}` } }
    const next = ls[i + 1]
    if (next) { const n = take(next.replace(/^[\s:.|]+/, '')); if (n) return { value: n, line: `${l} ${next}` } }
  }
  return null
}

const POLICY_VALUE = /[A-Z0-9][A-Z0-9-]*(?:\s*\/\s*[A-Z0-9-]+)*(?:\s*\/\s*[A-Z0-9-]+)*/
const POLICY_LABEL = /\b(?:policy (?:no|number|#)\.?|renewal notice no\.?|policy\/ci\/account no\.?|reference no\.?)/i

/** The policy number as written, with "SD26F02212 / R01" kept whole. */
export function findPolicyNoInText(t: string): string | null {
  const ls = lines(t)
  const hit = textAfter(ls, POLICY_LABEL, POLICY_VALUE, v => /\d{4,}/.test(v) && v.length <= 40)
  return hit ? hit.value.replace(/\s*\/\s*/g, '/').trim() : null
}

/** Period of insurance "From 01/09/2026 to 31/08/2027" or "FROM 08 AUG 2026 TO 07 AUG 2027", across lines. */
export function findPeriod(t: string): { start: string; end: string } | null {
  const flat = t.replace(/\n/g, ' ')
  const D = `(?:${DATE_RE.source})`
  // Between the two dates: an optional time ("17 Jul 2026 00:00"), table pipes, "to", "-" or "–".
  const gap = `(?:\\s*\\d{2}:\\d{2})?[\\s|]*(?:to|-|–)\\s*:?\\s*`
  const re = new RegExp(`period(?: of insurance)?(?: \\(if renewed\\))?\\s*(?:\\(both dates inclusive\\))?\\s*[:|]*\\s*(?:from)?\\s*:?\\s*(?<a>${D})${gap}(?<b>${D})`, 'i')
  const m = re.exec(flat)
  if (m?.groups) { const a = parseDate(m.groups.a), b = parseDate(m.groups.b); if (a && b && a < b) return { start: a, end: b } }
  const m2 = new RegExp(`from\\s*:?\\s*(?<a>${D})${gap}(?<b>${D})`, 'i').exec(flat)
  if (m2?.groups) { const a = parseDate(m2.groups.a), b = parseDate(m2.groups.b); if (a && b && a < b) return { start: a, end: b } }
  // A header-over-values table puts the dates a row below the label: the first "date to date" a year apart.
  const pair = new RegExp(`(?<a>${D})${gap}(?<b>${D})`, 'gi')
  for (let m3 = pair.exec(flat); m3; m3 = pair.exec(flat)) {
    const a = parseDate(m3.groups!.a), b = parseDate(m3.groups!.b)
    if (!a || !b || a >= b) continue
    const days = (Date.parse(b) - Date.parse(a)) / 86_400_000
    if (days >= 300 && days <= 400) return { start: a, end: b }
  }
  return null
}

function dateAfter(ls: string[], label: RegExp): string | null {
  for (let i = 0; i < ls.length; i++) {
    const l = ls[i]
    const at = l.search(label)
    if (at < 0) continue
    const d = parseDate(l.slice(at).replace(label, ''))
    if (d) return d
    const below = cellBelow(ls, i, label)
    if (below) { const c = parseDate(below); if (c) return c }
    const next = ls[i + 1]
    if (next && next.length < 30) { const e = parseDate(next); if (e) return e }
  }
  return null
}

const ISSUE_DATE = /\bdate of issue\b|\bdate issued\b|(?<!event |effective |due |accident |loss |incident |start |end |expiry |value |application |export |payment |receipt )\bdate\s*[:|]|^date\s+(?=\d)/i

const INSURERS: [RegExp, string][] = [
  [/great eastern general/i, 'Great Eastern General Insurance Limited'],
  [/\bqbe\b/i, 'QBE Insurance (Singapore) Pte Ltd'],
  [/liberty (?:pte|insurance|international)/i, 'Liberty Pte. Limited'],
  [/\bincome insurance|income centre|\bincome\b.*made yours|insuring with income|income\.com\.sg/i, 'Income Insurance Limited'],
  [/\bAIA\b/, 'AIA Singapore Private Limited'],
  [/allianz insurance singapore/i, 'Allianz Insurance Singapore Pte. Ltd.'],
  [/\bchubb\b/i, 'Chubb Insurance Singapore Limited'],
  [/\becics\b/i, 'ECICS Limited'],
  [/eq insurance/i, 'EQ Insurance Company Limited'],
  [/tokio marine/i, 'Tokio Marine Insurance Singapore Ltd.'],
  [/berkshire hathaway/i, 'Berkshire Hathaway Specialty Insurance Company'],
  [/msig/i, 'MSIG Insurance (Singapore) Pte. Ltd.'],
  [/\bsinglife\b/i, 'Singlife'],
  [/\bcigna\b/i, 'Cigna Healthcare'],
  [/china taiping/i, 'China Taiping Insurance (Singapore) Pte. Ltd.'],
]
export function findInsurerName(t: string): string | null {
  const head = t.slice(0, 1500)
  for (const [re, name] of INSURERS) if (re.test(head)) return name
  for (const [re, name] of INSURERS) if (re.test(t)) return name
  return null
}

const currencyOf = (t: string) => /\bUSD\b|US\$/.test(t) && !/\bSGD\b|S\$/.test(t) ? 'USD' : /\bMYR\b|\bRM\s?\d/.test(t) && !/\bSGD\b|S\$/.test(t) ? 'MYR' : 'SGD'

const GST_LABEL = /\bgst\b(?!\s*(?:reg|regn|registration|no\b|exempt|\(exempt))/i
const GST_SKIP = /reg(?:istration|n)?\.?\s*no|exempt/i
const TOTAL_LABEL = /\b(?:total amount due|total due|total premium payable|total premium|total refund|amount payable|balance due|total amount payable|total receipt amount|est total due(?: sgd)?|premium payable \(including gst\))\b/i
const GROSS_LABEL = /(?<!net\s)(?<!total\s)\b(?:gross premium|est renewal premium(?: \(sgd\)| \(sgd\))?|annual premium|refund premium|sub-?total|premium)\b(?!\s*(?:payment|warranty|adjust|per head|rate|payable))/i
const COMMISSION_LABEL = /\b(?:commission payable|commission refund|comm\.? ?\(\d+(?:\.\d+)?%\)|commission\b(?!\s*(?:tax|details)))/i

/** An insurer's debit or credit note. Null when the text has neither a total nor a premium. */
export function readInsurerNote(text: string): InsurerNoteRead | null {
  const t = normaliseMoneyText(text)
  const ls = lines(t)
  if (ls.length < 4) return null
  const total = amountAfter(ls, TOTAL_LABEL)
  const gst = amountAfter(ls, GST_LABEL, GST_SKIP)
  let gross = amountAfter(ls, /\bgross premium\b/i) ?? amountAfter(ls, /\best renewal premium\b/i) ?? amountAfter(ls, /\brefund premium\b/i) ?? amountAfter(ls, /\bsub-?total\b/i) ?? amountAfter(ls, GROSS_LABEL)
  const trs = /trade risk solutions\s*\n?\s*co\.? reg(?:istration)? no\.? 202022795H/i.test(t) || /^\s*trade risk solutions\s*$/im.test(t.slice(0, 200))
  const intermediary = /intermediary copy|debit note for producer|commission details|buyer created tax invoice|for the account of\s*:?\s*trade risk|commission statement/i.test(t)
    || /\bname\s*:?\s*\|?\s*trade risk solutions/i.test(t)
  // A commission statement carries no premium the client pays; it is kept for its commission figure.
  if (!total && !gross && !(intermediary && amountAfter(ls, COMMISSION_LABEL))) return null
  // On the intermediary's copy "CREDIT NOTE" is about the commission, not the client's premium.
  const refund = /\btotal refund\b|\brefund premium\b|\bpremium refunded\b|no payment is required|commission refund/i.test(t)
  const credit = refund || (!intermediary && /\bcredit note\b/i.test(t)) || (total?.value ?? gross?.value ?? 0) < 0
  if (gross && total && gst && Math.abs(Math.abs(total.value) - (Math.abs(gross.value) + Math.abs(gst.value))) > 1) {
    // The labels disagree: the total less GST is the premium the insurer charges.
    gross = { value: r2(Math.abs(total.value) - Math.abs(gst.value)), line: `${total.line} less ${gst.line}` }
  }
  if (!gross && total && gst) gross = { value: r2(Math.abs(total.value) - Math.abs(gst.value)), line: `${total.line} less ${gst.line}` }
  const sign = credit ? -1 : 1
  const abs = (f: MoneyField | null): MoneyField | null => f ? { value: sign * Math.abs(f.value), line: f.line } : null
  const items: { label: string; amount: number }[] = []
  for (const l of ls) {
    const m = /^\|?\s*([A-Z]{2,5}\d?\s+[A-Za-z&' ]{6,60}?)\s*[:|]?\s*(\(?-?\s*[\d,]+\.\d{2}\s*-?\)?)\s*\|?$/.exec(l)
    if (m && !/total|gst|premium\b/i.test(m[1])) { const a = parseAmount(m[2]); if (a != null) items.push({ label: m[1].trim(), amount: sign * Math.abs(a) }) }
  }
  const noteNo = textAfter(ls, /\b(?:document no\.?|tax invoice (?:number|no\.?)|debit note no\.?|credit note no\.?|invoice no\.?|receipt no\.?)\b/i, /[A-Z]{1,3} ?\d{5,}|[A-Z0-9][A-Z0-9\/-]{3,}/)
    ?? textAfter(ls, /\bdebit note\b(?!\s*(?:for|no))/i, /[A-Z]{2}\d{6,}/)
  const txn = textAfter(ls, /\btransaction no\.?\b/i, /\d{1,4}/)
  const policyNo = findPolicyNoInText(t)
  const period = findPeriod(t)
  const headcount = /headcount\s*:?\s*(\d{1,5})/i.exec(t)
  const commission = amountAfter(ls, COMMISSION_LABEL)
  const confidence: InsurerNoteRead['confidence'] = total && policyNo && (period || noteNo) ? 'high' : total || gross ? 'medium' : 'low'
  return {
    kind: credit ? 'credit' : 'debit', copy: intermediary ? 'intermediary' : 'client', issuer: trs ? 'trs' : 'insurer',
    note_no: noteNo?.value.replace(/\s+/g, '') ?? (txn && policyNo ? `${policyNo}#${txn.value}` : null),
    policy_no: policyNo, insurer: findInsurerName(t),
    issued_on: dateAfter(ls, ISSUE_DATE), effective_on: dateAfter(ls, /\beffective date\b/i),
    period_start: period?.start ?? null, period_end: period?.end ?? null, currency: currencyOf(t),
    gross: abs(gross), gst: abs(gst), total: abs(total),
    commission: commission ? { value: Math.abs(commission.value), line: commission.line } : null,
    headcount: headcount ? Number(headcount[1]) : null, items,
    endorsement: /\bendorsement\b|\bendt\b|staff (?:resign|termination|addition)|member movement/i.test(t) || /-E\d{3}\b|\/E\d{2}\b/.test(policyNo ?? ''),
    confidence,
  }
}

/** A schedule, cover note or renewal notice: the terms, not a bill. Null when no premium or sum insured is stated. */
export function readScheduleTerms(text: string): ScheduleRead | null {
  const t = normaliseMoneyText(text)
  const ls = lines(t)
  if (ls.length < 4) return null
  const gross = amountAfter(ls, /\bgross premium\b/i) ?? amountAfter(ls, /\best renewal premium\b/i) ?? amountAfter(ls, /^premium\s*[:|]/i) ?? amountAfter(ls, /\bannual premium\b/i)
  const gst = amountAfter(ls, GST_LABEL, GST_SKIP)
  const total = amountAfter(ls, TOTAL_LABEL)
  const sumInsured = amountAfter(ls, /\btotal sum insured\b/i) ?? amountAfter(ls, /\bsum insured\b(?!\s*\/)/i) ?? amountAfter(ls, /\blimit of (?:liability|indemnity)\b/i)
  if (!gross && !total && !sumInsured) return null
  const excessM = /excess[^\n]{0,80}?(?:S\$|SGD|\$)\s*([\d,]+(?:\.\d{2})?)|first (?:S\$|SGD|\$)\s*([\d,]+(?:\.\d{2})?)/i.exec(t)
  const excess = excessM ? { value: Number((excessM[1] ?? excessM[2]).replace(/,/g, '')), line: excessM[0].slice(0, 120) } : null
  const headcount = /headcount\s*:?\s*(\d{1,5})/i.exec(t)
  const wages = amountAfter(ls, /total salaries|wages and other earnings|estimated annual wages|annual wages/i)
  const period = findPeriod(t)
  const g = gross ? Math.abs(gross.value) : total && gst ? Math.abs(total.value) - Math.abs(gst.value) : null
  const heads = headcount ? Number(headcount[1]) : null
  return {
    policy_no: findPolicyNoInText(t), insurer: findInsurerName(t),
    period_start: period?.start ?? null, period_end: period?.end ?? null, currency: currencyOf(t),
    gross: gross ? { value: Math.abs(gross.value), line: gross.line } : g != null && total ? { value: g, line: total.line } : null,
    gst: gst ? { value: Math.abs(gst.value), line: gst.line } : null, total: total ? { value: Math.abs(total.value), line: total.line } : null,
    sum_insured: sumInsured ? { value: Math.abs(sumInsured.value), line: sumInsured.line } : null, excess, headcount: heads,
    rate_per_head: g != null && heads ? Math.round(g / heads * 100) / 100 : null, wages: wages ? { value: Math.abs(wages.value), line: wages.line } : null,
    renewal_terms: /renewal notice|renewal instruction|est renewal premium|due for renewal|invite you for the upcoming renewal/i.test(t),
    confidence: (gross || total) && period ? 'high' : gross || total || sumInsured ? 'medium' : 'low',
  }
}

/** An insurer's claim letter: what was decided and paid. Null when no claim is mentioned. */
export function readClaimSettlement(text: string): ClaimSettlementRead | null {
  const t = normaliseMoneyText(text)
  const ls = lines(t)
  if (!/\bclaim/i.test(t)) return null
  const claimNo = textAfter(ls, /\bclaim (?:no|number|ref(?:erence)?)\.?\b/i, /[A-Z0-9][A-Z0-9 \/-]{2,30}/)
  const decision: ClaimSettlementRead['decision'] = /we have made payment|payment (?:has been|was) made|paid to|has been paid|settled on/i.test(t) ? 'paid'
    : /approved your claim|claim (?:has been|is) approved|pleased to inform|admit(?:ted)? (?:the|your) claim|offer of settlement/i.test(t) ? 'approved'
    : /\b(?:decline|repudiat|not payable|unable to admit|reject(?:ed)? your claim|no liability)/i.test(t) ? 'declined' : null
  const amount = amountAfter(ls, /\b(?:total (?:amount )?(?:payable|paid|approved|settled)|settlement amount|amount (?:payable|paid|approved|settled)|benefit payable|net payable|we have paid|sum of)\b/i)
  if (!claimNo && !decision && !amount) return null
  const claimant = textAfter(ls, /\b(?:life assured|claimant|insured person|name of (?:claimant|employee|insured person)|employee name)\b/i, /[A-Z][A-Za-z' .-]{2,60}/)
  return {
    claim_no: claimNo?.value.trim() ?? null, policy_no: findPolicyNoInText(t), decision, amount,
    event_date: dateAfter(ls, /\bevent date\b|\bdate of (?:accident|loss|event|incident)\b|\baccident date\b/i),
    letter_date: dateAfter(ls, ISSUE_DATE) ?? (parseDate(ls.slice(0, 25).find(l => DATE_RE.test(l) && l.length < 40) ?? null)),
    claimant: claimant?.value ?? null,
    confidence: decision && amount && claimNo ? 'high' : decision || amount ? 'medium' : 'low',
  }
}

/**
 * The tokens that identify a policy number across an insurer's variants: "2026-A5614771-HFW-R001",
 * "A5614771" and "HFW_A5614771_…" share A5614771; "SD26F02212 / R01" and "SD26F02212/FIC/R1/E0"
 * share SD26F02212. Renewal and endorsement suffixes (R001, E00, T00001) are not identities.
 */
export function policyTokens(n: string | null | undefined): string[] {
  if (!n) return []
  return (n.toUpperCase().match(/[A-Z]*\d[A-Z0-9]*/g) ?? [])
    .filter(x => (x.match(/\d/g) ?? []).length >= 5 && !/^[RET]\d{2,5}$/.test(x) && !/^(?:19|20)\d{2}$/.test(x))
}

export function samePolicyNumber(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = policyTokens(a), tb = new Set(policyTokens(b))
  return ta.some(x => tb.has(x))
}

/**
 * A looser identity for a record typed with a slip ("SDL26L01920" on file, "SD26L01920" on the
 * note): the digits of each token, when there are at least seven of them. For a second pass only.
 */
export function policyDigits(n: string | null | undefined): string[] {
  return policyTokens(n).map(t => t.replace(/[^0-9]/g, '')).filter(d => d.length >= 7)
}
export function nearlySamePolicyNumber(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = policyDigits(a), db = new Set(policyDigits(b))
  return da.some(x => db.has(x))
}
