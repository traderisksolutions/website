/**
 * The renewal method: one plain-text file admins edit on /methods/renewal. Every save is a new
 * version in agent_methods. The rules (src/lib/cases/renewal.ts) read the parsed thresholds and
 * overrides from the latest version on every run; the AI agents read the whole text. What was
 * understood is shown back on the page, so a line the parser could not read is visible.
 *
 * Format: `# Heading` opens a section. Under Thresholds, `Label: value`. Under Always go to market,
 * `Clients:` and `Lines:` with comma lists. Under Insurer and market notes, one note per line:
 * `Insurer | line | hold, adjust or increase | note`. Under Lines, `Line: what to ask and check`.
 *
 * This repo is public: the default below names no client. Client lists live in the database only.
 */
import { sbTry } from '@/lib/crm/db'

export const METHOD_KEYS = ['renewal'] as const
export type MethodKey = typeof METHOD_KEYS[number]

export const DEFAULT_RENEWAL_METHOD = `# Thresholds
Hold below loss ratio: 40%
Increase above loss ratio: 60%
Exposure change that adjusts: 10%
No claims on file counts as: unknown

# Always go to market
Clients:
Lines:

# Insurer and market notes
Insurer | line | effect | note

# Lines
WICA: premium adjusts on declared wages at expiry. Ask headcount and wages by category of work.
FWMI: ask the worker list with work permit numbers. Check passes cancelled during the year for refunds.
Employee benefits: ask the member listing with dates of birth and the insurer's claims experience. Members aged 50 and over move the price.
Group personal accident: ask the headcount or units insured and the claims experience.
Professional indemnity: insurers quote only on a signed renewal proposal form. Send it at 90 days; it is due to the insurer 30 days before the end date. Ask turnover and any claims or circumstances.
D&O: as professional indemnity; ask latest audited accounts and any change in ownership.
Cyber: as professional indemnity; ask the security questionnaire.
Property: ask sums insured by item and any change of premises or stock.
Liability: ask turnover and any change of business activity.
Marine: ask annual shipments by route and value.
Motor: ask the vehicle list, drivers and the claims history for 3 years.
Construction all risks: a project cover; no renewal. An extension needs the revised completion date and an LOU of no known claims.
Bonds: no renewal. An extension needs the beneficiary's request.
Trade credit: ask the turnover estimate and the debtor ageing report.

# Considerations for drafting
State the expiring premium and the renewal premium side by side with the change in percent.
Name the reason for any change: claims, exposure, insurer rate change.
Never promise a premium before the insurer quotes.
Ask for everything missing in one email, numbered.
`

export type InsurerNote = { insurer: string; line: string; effect: 'hold' | 'adjust' | 'increase'; note: string }
export type RenewalMethod = {
  version: number | null
  text: string
  holdBelow: number
  increaseAbove: number
  exposureShift: number
  noClaimsUnknown: boolean
  marketClients: string[]
  marketLines: string[]
  insurerNotes: InsurerNote[]
  lineNotes: Record<string, string>
  /** Lines the parser could not read, shown on the page. */
  unread: string[]
}

/** `Label: value` → [label, value]; the value keeps any later colons. */
const splitLabel = (line: string): [string, string] => { const i = line.indexOf(':'); return i < 0 ? [line.trim(), ''] : [line.slice(0, i).trim(), line.slice(i + 1).trim()] }
const pct = (s: string | undefined, fallback: number) => {
  const m = s?.match(/(\d+(?:\.\d+)?)\s*%?/)
  return m ? Number(m[1]) / 100 : fallback
}
const list = (s: string | undefined) => (s ?? '').split(',').map(x => x.trim()).filter(Boolean)

/** The line family of a policy class or a method line name. */
export function lineKey(text: string | null | undefined): string | null {
  const t = String(text ?? '').toLowerCase()
  if (!t) return null
  const F: [string, RegExp][] = [
    ['fwmi', /foreign worker medical|\bfwmi\b/], ['wica', /\bwica?\b|work injury|workmen/], ['gpa', /personal accident|\bgpa\b/],
    ['eb', /employee benefit|group (medical|hospital|health|term|life)|\bghs\b|\bgtl\b|\bgmm\b|outpatient|dental/],
    ['pi', /professional indemnity|\bpii?\b|asset manager|investment management|\bimi\b/], ['do', /\bd&o\b|directors/], ['cyber', /cyber/],
    ['car', /contractor|erection|construction all|\bcar\b|\bear\b/], ['bond', /bond|guarantee/], ['trade_credit', /trade credit|credit insurance/],
    ['marine', /marine|cargo|goods.in.transit|freight/], ['motor', /motor|vehicle|fleet/], ['travel', /travel/],
    ['property', /fire|property|industrial all risk|\biar\b|office|biz ?supreme|machinery/], ['liability', /liability/],
  ]
  for (const [k, re] of F) if (re.test(t)) return k
  return null
}

/** Pure. Reads the method text; anything it cannot place is listed in `unread`. */
export function parseMethod(text: string, version: number | null = null): RenewalMethod {
  const m: RenewalMethod = { version, text, holdBelow: 0.4, increaseAbove: 0.6, exposureShift: 0.1, noClaimsUnknown: true, marketClients: [], marketLines: [], insurerNotes: [], lineNotes: {}, unread: [] }
  let section = ''
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('# ')) { section = line.slice(2).trim().toLowerCase(); continue }
    if (section.startsWith('threshold')) {
      const [k, v] = splitLabel(line)
      const key = (k ?? '').toLowerCase()
      if (key.startsWith('hold below')) m.holdBelow = pct(v, m.holdBelow)
      else if (key.startsWith('increase above')) m.increaseAbove = pct(v, m.increaseAbove)
      else if (key.startsWith('exposure change')) m.exposureShift = pct(v, m.exposureShift)
      else if (key.startsWith('no claims on file')) m.noClaimsUnknown = !/clean|nil|none/i.test(v ?? '')
      else m.unread.push(line)
    } else if (section.startsWith('always go to market')) {
      const [k, v] = splitLabel(line)
      if (/^clients?$/i.test(k ?? '')) m.marketClients.push(...list(v))
      else if (/^lines?$/i.test(k ?? '')) m.marketLines.push(...list(v).map(l => lineKey(l) ?? l.toLowerCase()))
      else m.unread.push(line)
    } else if (section.startsWith('insurer')) {
      const parts = line.split('|').map(s => s.trim())
      if (parts.length < 3 || /^insurer$/i.test(parts[0])) { if (!/^insurer$/i.test(parts[0])) m.unread.push(line); continue }
      const effect = parts[2].toLowerCase()
      if (effect !== 'hold' && effect !== 'adjust' && effect !== 'increase') { m.unread.push(line); continue }
      m.insurerNotes.push({ insurer: parts[0], line: lineKey(parts[1]) ?? parts[1].toLowerCase(), effect, note: parts.slice(3).join(' | ') })
    } else if (section.startsWith('lines')) {
      const [k, v] = splitLabel(line)
      const key = lineKey(k)
      if (key && v) m.lineNotes[key] = v
      else m.unread.push(line)
    }
  }
  return m
}

let cache: { at: number; method: RenewalMethod } | null = null

/** The latest renewal method, read fresh each minute; the default when none is saved or the table is missing. */
export async function renewalMethod(): Promise<RenewalMethod> {
  if (cache && Date.now() - cache.at < 60_000) return cache.method
  const [row] = await sbTry<{ version: number; text: string }[]>(`agent_methods?key=eq.renewal&select=version,text&order=version.desc&limit=1`, [])
  const method = parseMethod(row?.text ?? DEFAULT_RENEWAL_METHOD, row?.version ?? null)
  cache = { at: Date.now(), method }
  return method
}

export function clearMethodCache() { cache = null }
