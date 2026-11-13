/**
 * The fact catalogue: the only keys a business's facts are kept under (13 Nov 2026). A model reads
 * an email into these keys or into nothing; the cleaner refuses any other key, the way Nexus
 * refuses a party outside trs/insurer/client. One spelling per fact, so a newer value supersedes
 * the older one (planFacts) and a question finds it.
 *
 * A key has at most one slot:
 *   {person}  an email address on the message (sender, recipient or written in it), lower case
 *   {ref}     a policy, claim, quotation or endorsement number written in the email (letters and
 *             digits, upper case), or a line of cover by its slug ("wica", "group_health")
 * Values are typed: money, number and percent must carry a figure; a role is one of ROLES.
 *
 * Pure; tested in src/__tests__/fact-catalogue.test.ts.
 */
import { PRODUCT_LINES } from '@/lib/product-lines'
import { refKey } from '@/lib/admin/a/signals'

export type FactType = 'text' | 'money' | 'number' | 'percent' | 'date' | 'role' | 'phone'
export type Reader = 'client' | 'insurer' | 'records'
export type CatalogueEntry = { key: string; topic: string; label: string; type: FactType; read: Reader[] }

export const ROLES = ['hr', 'claims', 'finance', 'decision_maker', 'operations', 'other'] as const

export const CATALOGUE: CatalogueEntry[] = [
  // The business
  { key: 'business.name', topic: 'business', label: 'Registered name', type: 'text', read: ['client', 'records'] },
  { key: 'business.uen', topic: 'business', label: 'UEN', type: 'text', read: ['client', 'records'] },
  { key: 'business.activity', topic: 'business', label: 'What the business does', type: 'text', read: ['client'] },
  { key: 'business.address', topic: 'business', label: 'Address', type: 'text', read: ['client'] },
  { key: 'business.website', topic: 'business', label: 'Website', type: 'text', read: ['client'] },
  { key: 'business.phone', topic: 'business', label: 'Main phone', type: 'phone', read: ['client'] },
  { key: 'business.related_entity', topic: 'business', label: 'Related or former entity', type: 'text', read: ['client'] },
  { key: 'business.turnover', topic: 'business', label: 'Turnover', type: 'money', read: ['client'] },
  { key: 'business.sites', topic: 'business', label: 'Sites and projects', type: 'text', read: ['client'] },
  { key: 'business.fleet', topic: 'business', label: 'Vehicles', type: 'number', read: ['client'] },
  // Members
  { key: 'members.headcount', topic: 'members', label: 'Employees', type: 'number', read: ['client'] },
  { key: 'members.foreign_workers', topic: 'members', label: 'Foreign workers', type: 'number', read: ['client'] },
  { key: 'members.movements', topic: 'members', label: 'How joiners and leavers are sent', type: 'text', read: ['client'] },
  // People
  { key: 'contact.{person}.name', topic: 'contact', label: 'Name', type: 'text', read: ['client', 'records'] },
  { key: 'contact.{person}.role', topic: 'contact', label: 'Handles', type: 'role', read: ['client'] },
  { key: 'contact.{person}.title', topic: 'contact', label: 'Job title', type: 'text', read: ['client'] },
  { key: 'contact.{person}.phone', topic: 'contact', label: 'Phone', type: 'phone', read: ['client'] },
  { key: 'contact.{person}.status', topic: 'contact', label: 'Status', type: 'text', read: ['client', 'records'] },
  { key: 'contact.{person}.acts_for', topic: 'contact', label: 'Acts for', type: 'text', read: ['records'] },
  // What they require and how they work
  { key: 'requirement.{ref}.cover', topic: 'requirement', label: 'Cover required', type: 'text', read: ['client'] },
  { key: 'requirement.deadline', topic: 'requirement', label: 'Recurring deadline', type: 'text', read: ['client'] },
  { key: 'preference.channel', topic: 'preference', label: 'Preferred channel', type: 'text', read: ['client'] },
  { key: 'preference.insurer', topic: 'preference', label: 'Insurer preference', type: 'text', read: ['client'] },
  { key: 'preference.note', topic: 'preference', label: 'How they like to work', type: 'text', read: ['client'] },
  { key: 'claims.procedure', topic: 'claims_handling', label: 'Claims procedure', type: 'text', read: ['client'] },
  { key: 'billing.terms', topic: 'billing', label: 'Payment terms', type: 'text', read: ['client'] },
  { key: 'billing.payment_method', topic: 'billing', label: 'Payment method', type: 'text', read: ['client'] },
  { key: 'billing.address', topic: 'billing', label: 'Billing address', type: 'text', read: ['client'] },
  // From the insurer
  { key: 'terms.{ref}.premium', topic: 'terms', label: 'Premium', type: 'money', read: ['insurer'] },
  { key: 'terms.{ref}.renewal_change', topic: 'terms', label: 'Renewal change', type: 'percent', read: ['insurer'] },
  { key: 'terms.{ref}.sum_insured', topic: 'terms', label: 'Sum insured or limit', type: 'money', read: ['insurer'] },
  { key: 'terms.{ref}.excess', topic: 'terms', label: 'Excess or deductible', type: 'money', read: ['insurer'] },
  { key: 'terms.{ref}.condition', topic: 'terms', label: 'Condition or exclusion', type: 'text', read: ['insurer'] },
  { key: 'terms.{ref}.declined', topic: 'terms', label: 'Declined, and why', type: 'text', read: ['insurer'] },
  { key: 'terms.{ref}.valid_until', topic: 'terms', label: 'Quote valid until', type: 'date', read: ['insurer'] },
  { key: 'endorsement.{ref}.change', topic: 'endorsement', label: 'Endorsement made', type: 'text', read: ['insurer'] },
  { key: 'endorsement.{ref}.premium', topic: 'endorsement', label: 'Endorsement premium', type: 'money', read: ['insurer'] },
  { key: 'claim.{ref}.status', topic: 'claim', label: 'Claim status', type: 'text', read: ['insurer'] },
  { key: 'claim.{ref}.amount_paid', topic: 'claim', label: 'Amount paid', type: 'money', read: ['insurer'] },
  { key: 'claim.{ref}.reason', topic: 'claim', label: 'Decision reason', type: 'text', read: ['insurer'] },
  // From records (written by code)
  { key: 'policy.{ref}.number', topic: 'cover', label: 'Policy number', type: 'text', read: ['records'] },
  { key: 'policy.{ref}.insurer', topic: 'cover', label: 'Insurer', type: 'text', read: ['records'] },
  { key: 'policy.{ref}.class', topic: 'cover', label: 'Class', type: 'text', read: ['records'] },
  { key: 'policy.{ref}.period', topic: 'cover', label: 'Period', type: 'text', read: ['records'] },
  { key: 'policy.{ref}.status', topic: 'cover', label: 'Status', type: 'text', read: ['records'] },
  { key: 'policy.{ref}.premium', topic: 'cover', label: 'Premium', type: 'money', read: ['records'] },
  { key: 'policy.{ref}.insured', topic: 'cover', label: 'Insured as', type: 'text', read: ['records'] },
  { key: 'business.parent', topic: 'business', label: 'Parent company', type: 'text', read: ['records'] },
  { key: 'business.relation', topic: 'business', label: 'Relation to the group', type: 'text', read: ['records'] },
]

const SLUGS = new Set(PRODUCT_LINES.map(p => p.slug))
const byPattern = new Map(CATALOGUE.map(e => [e.key, e]))
const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/

/** The catalogue entry a concrete key belongs to, and its slot value; null when the key is not in it. */
export function entryOf(key: string): { entry: CatalogueEntry; slot: string | null } | null {
  const k = key.trim()
  const direct = byPattern.get(k)
  if (direct && !direct.key.includes('{')) return { entry: direct, slot: null }
  for (const e of CATALOGUE) {
    if (!e.key.includes('{')) continue
    const [head, tail] = e.key.split(/\{(?:person|ref)\}/)
    if (k.startsWith(head) && k.endsWith(tail) && k.length > head.length + tail.length) return { entry: e, slot: k.slice(head.length, k.length - tail.length) }
  }
  return null
}

/** A typed value, cleaned; null when it does not fit its type. */
export function cleanValue(type: FactType, v: string): string | null {
  const s = v.replace(/\s+/g, ' ').trim().slice(0, 300)
  if (!s) return null
  if (type === 'money' || type === 'number' || type === 'percent') return /\d/.test(s) ? s : null
  if (type === 'role') { const r = s.toLowerCase().replace(/[\s-]+/g, '_'); return (ROLES as readonly string[]).includes(r) ? r : null }
  if (type === 'phone') return /\d{6,}/.test(s.replace(/[\s()+-]/g, '')) ? s : null
  if (type === 'date') return /\d/.test(s) ? s : null
  return s
}

export type ReadFact = { topic: string; key: string; value: string; quote: string }

/**
 * Pure: the model's facts that the catalogue and the email both bear out.
 *   - the key is a catalogue key that this reader may write;
 *   - {person} is an address on the message; {ref} is a number written in the email or a line slug;
 *   - the value fits its type; the quote is in the email, word for word (whitespace aside).
 * At most 25 facts.
 */
export function cleanFacts(raw: unknown, text: string, reader: Exclude<Reader, 'records'>, addresses: string[]): ReadFact[] {
  const flat = text.replace(/\s+/g, ' ').toLowerCase()
  const refsInText = new Set((text.toUpperCase().match(/[A-Z0-9][A-Z0-9/\-.]{3,}[A-Z0-9]/g) ?? []).map(refKey).filter(r => r.length >= 5 && /\d/.test(r)))
  const known = new Set(addresses.map(a => a.toLowerCase()))
  for (const m of text.toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) ?? []) known.add(m)
  const list = Array.isArray((raw as { facts?: unknown })?.facts) ? (raw as { facts: Record<string, unknown>[] }).facts : []
  const out: ReadFact[] = []
  const seen = new Set<string>()
  for (const f of list) {
    if (!f || typeof f.key !== 'string' || typeof f.value !== 'string' || typeof f.quote !== 'string') continue
    let key = f.key.trim()
    const hit = entryOf(key)
    if (!hit || !hit.entry.read.includes(reader)) continue
    if (hit.slot != null) {
      const slot = hit.entry.key.includes('{person}') ? hit.slot.toLowerCase() : SLUGS.has(hit.slot.toLowerCase()) ? hit.slot.toLowerCase() : refKey(hit.slot)
      if (hit.entry.key.includes('{person}') ? !EMAIL.test(slot) || !known.has(slot) : !(SLUGS.has(slot) || refsInText.has(slot))) continue
      key = hit.entry.key.replace(/\{(?:person|ref)\}/, slot)
    }
    const value = cleanValue(hit.entry.type, f.value)
    const quote = f.quote.replace(/\s+/g, ' ').trim().slice(0, 240)
    if (!value || quote.length < 6 || !flat.includes(quote.toLowerCase())) continue
    if (seen.has(`${key}|${value.toLowerCase()}`)) continue
    seen.add(`${key}|${value.toLowerCase()}`)
    out.push({ topic: hit.entry.topic, key, value, quote })
    if (out.length >= 25) break
  }
  return out
}

/** The keys a reader may write, as the prompt lists them. */
export function catalogueFor(reader: Exclude<Reader, 'records'>): string {
  return CATALOGUE.filter(e => e.read.includes(reader)).map(e => `${e.key} (${e.type === 'role' ? `one of ${ROLES.join('|')}` : e.type}) — ${e.label}`).join('\n')
}

/** The slugs a {ref} may take when the email names a line of cover but no number. */
export const LINE_SLUGS = [...SLUGS]
