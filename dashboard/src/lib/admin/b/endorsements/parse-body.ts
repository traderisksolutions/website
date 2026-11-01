/**
 * Reads staff movements out of the client's own words, without a model. Pure.
 *
 * Clients write them as short lists under a heading:
 *   "So, a total 2 staff left:"            "Add new staff as at 01 July 26:"
 *   "1. Chai Ding Han - last day 23 April 26"   "1. Muhamad Safari Bin Masnor"
 * and as single sentences: "X has resigned, last day 31 May", "Y joined us on 1 Jul",
 * "Z has legally changed her name to W". Anything the rules cannot read is left for the model
 * (agent.readMovementMail), never guessed.
 */
import { parseWrittenDate } from '@/lib/admin/b/dates'
import type { ParsedMovement } from './types'

const DATE = String.raw`(\d{1,2}(?:st|nd|rd|th)?[\s/.-](?:[A-Za-z]{3,9}|\d{1,2})(?:[\s/.-]?\d{2,4})?|\d{4}-\d{2}-\d{2}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{2,4})`
const LEAVE_HEAD = /\b(staff|employees?|members?|workers?|people|pax|persons?)\b[^\n]*\b(left|leaving|resign\w*|terminat\w*|remov\w*|delet\w*|leavers?|cessation|last day)\b|\b(left|leaving|resign\w*|terminat\w*|remov\w*|delet\w*|leavers?|deletion)\b[^\n]*\b(staff|employees?|members?|workers?|pax|names?)\b/i
const JOIN_HEAD = /\b(add\w*|new|join\w*|onboard\w*|includ\w*|addition|hire[sd]?)\b[^\n]*\b(staff|employees?|members?|workers?|hires?|joiners?|names?|pax|persons?|people)\b|\b(joiners?|new hires?|additions?)\b/i
const LEAVE_WORDS = /\b(resign\w*|last day|left (?:us|the company)|leaving|terminat\w*|cease[sd]?|cessation|remove|delete|no longer with)\b/i
const JOIN_WORDS = /\b(join(?:ed|ing|s)?(?: us)?|new (?:staff|hire|employee|joiner)|add(?:ed|ing)?|onboard\w*|commenc\w*|start(?:ed|ing|s)? (?:work|on|from))\b/i
const CHANGE_WORDS = /\b(changed? (?:her|his|their)? ?name|name change|rename|now known as|change (?:of )?plan|upgrade|downgrade|transfer)\b/i
const LIST_LINE = /^\s*(?:[-•*·]|\d{1,2}[.)]|\(\d{1,2}\)|[a-z][.)])\s*(.+)$/
const NAME = /^([A-Z][A-Za-z'’.-]+(?:\s+(?:[A-Z][A-Za-z'’.-]+|bin|binti|bte|d\/o|s\/o|a\/l|a\/p|al|van|de|der))+)/
const STOP = /^(hi|dear|hello|thank|thanks|regards|best|kind|please|kindly|pls|also|note|attached|fyi|re|fw|on|the|we|our|as|for|from|to|with|yes|no|ok|noted|total|add|new|staff|this|that|these|those|it|he|she|they|retroactive|date|policy|cover|insured|premium|period|effective|endorsement|renewal|project|purchase|order|group|company|member|employee|client)\b/i
// A person's name carries none of the trade's words; a line of cover types under "Lines to include:" is not a joiner list.
const NOUNS = /\b(date|policy|cover|coverage|premium|period|endorsement|renewal|project|order|works|plan|list|insurance|insurer|claim|invoice|note|quotation|quote|rfq|tender|package|injury|compensation|liability|cargo|marine|construction|plant|equipment|machinery|qualifications?|strength|financial|contract|duration|award|target|limit|excess|deductible|workmen|fire|property|motor|vehicle|fleet|bond|guarantee|indemnity|professional|cyber|travel|accident|medical|hospital|surgical|dental|term|life|sum|insured|schedule|certificate|wording|clause|section)\b/i

const iso = (s: string | null | undefined): string | null => (s ? parseWrittenDate(s.replace(/\s+/g, ' ')) : null)
const dayAfter = (d: string) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10) }
/** Markdown emphasis off ("*Chai Ding Han*"); a leading "* " bullet stays a bullet. */
const mdStrip = (s: string) => s.replace(/\*(?=\S)|(?<=\S)\*/g, '').replace(/_{2,}/g, ' ')
const clean = (s: string) => mdStrip(s).replace(/^\s*\*\s+/, '').replace(/\s+/g, ' ').trim()
const ENDS = /[.:;!?\-–]\s*$/

/**
 * Mail clients wrap sentences at ~72 characters, so "includes Chew Kok Mum" / "Vincent, who has
 * resigned" arrive as two lines. A line with no closing punctuation joins the next, unless either
 * is a list item or the next is blank.
 */
export function unwrap(text: string): string[] {
  const src = text.split(/\r?\n/)
  const out: string[] = []
  for (let i = 0; i < src.length; i++) {
    let line = src[i]
    while (i + 1 < src.length) {
      const next = src[i + 1]
      const cur = mdStrip(line)
      if (!cur.trim() || !next.trim() || ENDS.test(cur) || LIST_LINE.test(cur) || LIST_LINE.test(mdStrip(next)) || /^\s*(?:on .+wrote:|from:|sent:|to:|subject:)/i.test(next)) break
      line = `${line.trimEnd()} ${next.trimStart()}`
      i++
    }
    out.push(line)
  }
  return out
}

function firstDate(s: string): string | null {
  const r = new RegExp(DATE, 'i').exec(s)
  return r ? iso(r[1]) : null
}

/** The name at the start of a line, with its trailing note split off. */
function nameOf(line: string): { name: string; rest: string } | null {
  const t = clean(line).replace(/^(?:mr|ms|mrs|mdm|dr)\.?\s+/i, '')
  const m = NAME.exec(t)
  if (!m || STOP.test(m[1]) || NOUNS.test(m[1]) || m[1].split(/\s+/).length < 2 || m[1].split(/\s+/).length > 6) return null
  // A name followed by a note: "Chai Ding Han - last day 23 April 26", "Lim Ah Kow (last day 31/5)".
  const name = m[1].replace(/\s+(?:last|effective|w\.?e\.?f|wef|from|on|as|joined|resigned|left|starting|start|dob|nric|fin|who|has|have|will|is)$/i, '').trim()
  return { name, rest: t.slice(m[0].length) }
}

/** The name a sentence ends with: "please take note that my colleague, Kartini Kartini" → Kartini Kartini. */
function tailName(s: string): string | null {
  const t = clean(s).replace(/[,;:]+$/, '').trim()
  const m = /([A-Z][A-Za-z'’.-]+(?:\s+(?:[A-Z][A-Za-z'’.-]+|bin|binti|bte|d\/o|s\/o|a\/l|a\/p))+)$/.exec(t)
  if (!m || m[1].split(/\s+/).length < 2) return null
  const words = m[1].split(/\s+/)
  while (words.length > 2 && STOP.test(words[0])) words.shift()
  return STOP.test(words[0]) ? null : words.join(' ')
}

type Mode = { kind: 'join' | 'leave' | 'change'; date: string | null; quote: string }

const BARE_LEAVE = /^(leavers?|resign\w*|deletions?|terminations?|cessations?|removals?|staff (?:left|leaving))\s*[:\-–]?\s*$/i
const BARE_JOIN = /^(joiners?|additions?|new (?:hires?|staff|joiners?|members?|employees?)|new)\s*[:\-–]?\s*$/i

function headingMode(line: string): Mode | null {
  const t = clean(line)
  // A heading is short or ends in a colon; a sentence that happens to mention leavers is read as a sentence.
  if (t.length > 160 || !(t.length <= 40 || /[:\-–]\s*$/.test(t))) return null
  if (BARE_LEAVE.test(t)) return { kind: 'leave', date: null, quote: t }
  if (BARE_JOIN.test(t)) return { kind: 'join', date: null, quote: t }
  if (LEAVE_HEAD.test(t)) return { kind: 'leave', date: firstDate(t), quote: t }
  if (JOIN_HEAD.test(t)) return { kind: 'join', date: firstDate(t), quote: t }
  return null
}

export function parseMovementBody(text: string, mailDate?: string | null): ParsedMovement[] {
  const out: ParsedMovement[] = []
  const seen = new Set<string>()
  const push = (m: Omit<ParsedMovement, 'source' | 'movement_type' | 'relationship' | 'detail'> & { detail?: Record<string, unknown> }) => {
    const key = `${m.kind}|${m.name.toLowerCase()}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ ...m, relationship: 'employee', movement_type: 'member', source: 'body', detail: m.detail ?? {} })
  }
  const lines = unwrap(text)
  let mode: Mode | null = null
  let since = 0
  for (const wrapped of lines) {
    const raw = mdStrip(wrapped)
    const line = clean(wrapped)
    if (!line) { since++; if (since > 2) mode = null; continue }
    since = 0
    const head = headingMode(line)
    if (head && !LIST_LINE.test(raw)) { mode = head; continue }

    // One-sentence forms, read anywhere.
    const nameChange = /(.+?),?\s+(?:has|have)?\s*(?:legally\s+)?changed (?:her|his|their) name to\s+(.+?)(?:[.,;]|\s+kindly|\s+please|$)/i.exec(line)
    if (nameChange) {
      const from = tailName(nameChange[1]), to = nameOf(nameChange[2])
      if (from && to) { push({ kind: 'change', name: from, effective_on: null, last_day: null, quote: line, detail: { new_name: to.name, change: 'name' } }); continue }
    }
    const resigned = /^(?:.*\bincludes?\s+)?(.+?),?\s+who (?:has )?resigned/i.exec(line) ?? /^(.+?)\s+(?:has|have)\s+resigned(?:[^\n]*?(?:last day|wef|w\.e\.f\.?|effective|on)\s+(.+))?/i.exec(line)
    if (resigned) {
      const n = nameOf(resigned[1])
      if (n) { const d = resigned[2] ? firstDate(resigned[2]) : firstDate(line); const last = /last day/i.test(line) ? d : null; push({ kind: 'leave', name: n.name, effective_on: last ? dayAfter(last) : d, last_day: last, quote: line }); continue }
    }
    // "our current staff member, Jonathan Lim Zong Da, is missing from the member list" → add him.
    const missing = /(.+?),?\s+(?:is|are|was)\s+(?:still\s+)?missing from the (?:member|staff|members'?|employee)?\s*list/i.exec(line)
    if (missing) {
      const n = tailName(missing[1])
      if (n) { push({ kind: 'join', name: n, effective_on: null, last_day: null, quote: line, detail: { basis: 'missing from the list' } }); continue }
    }
    const joined = /^(.+?)\s+(?:has |have |will |is )?(?:joined|joining|joins|started|starting|commenced|commencing)(?: us| work| with us)?(?: (?:on|from|wef|w\.e\.f\.?|effective))?\s+(.+)/i.exec(line)
    if (joined && !/\bnot\b|no longer/i.test(line)) {
      const n = nameOf(joined[1])
      if (n) { push({ kind: 'join', name: n.name, effective_on: firstDate(joined[2]) ?? firstDate(line), last_day: null, quote: line }); continue }
    }

    const item = LIST_LINE.exec(raw)
    if (!item) continue
    const n = nameOf(item[1])
    if (!n) continue
    const rest = n.rest
    const dateInLine = firstDate(rest)
    const kind: 'join' | 'leave' | 'change' | null =
      CHANGE_WORDS.test(rest) ? 'change' : LEAVE_WORDS.test(rest) ? 'leave' : JOIN_WORDS.test(rest) ? 'join' : mode?.kind ?? null
    if (!kind) continue
    const last = kind === 'leave' && (/last day/i.test(rest) || (!/effective|wef|w\.e\.f/i.test(rest) && dateInLine)) ? dateInLine : null
    const effective = kind === 'leave' ? (last ? dayAfter(last) : dateInLine ?? (mode?.date ? dayAfter(mode.date) : null)) : (dateInLine ?? mode?.date ?? null)
    push({ kind, name: n.name, effective_on: effective, last_day: last, quote: `${mode ? mode.quote + ' / ' : ''}${clean(item[1])}` })
  }
  return out.map(m => ({ ...m, detail: { ...m.detail, ...(mailDate && !m.effective_on ? { reported_on: mailDate } : {}) } }))
}
