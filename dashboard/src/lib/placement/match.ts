/**
 * Which request an email belongs to, when it did not arrive on the thread the request went out
 * on. A broker sends from their own mailbox, so the insurer's reply lands in operations@ on a
 * different Gmail thread; a broker forwards an insurer's or client's email into operations@; an
 * insurer starts a fresh thread. Pure: no I/O, so every rule here is unit-testable.
 *
 * In order of trust: the Message-ID the reply answers (In-Reply-To), the [TRS-Q-0142] reference,
 * the request's subject from the same domain. A domain alone is never enough to file a reply;
 * it only names the candidates a broker chooses from.
 */

const INTERNAL_DOMAIN = 'trade-risksol.com'
const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.com.sg', 'hotmail.com', 'outlook.com', 'live.com',
  'icloud.com', 'me.com', 'msn.com', 'protonmail.com', 'aol.com', 'singnet.com.sg',
])

// ── The reference ───────────────────────────────────────────────────────────────────────────

/** "[TRS-Q-0142]", as it rides in a subject. */
export const refTag = (ref: string): string => `[TRS-${ref}]`

/** The subject with the placement's reference on the end, once. */
export function withRef(subject: string, ref: string | null | undefined): string {
  const s = subject.trim()
  if (!ref) return s
  return s.toUpperCase().includes(`TRS-${ref.toUpperCase()}`) ? s : `${s} ${refTag(ref)}`
}

/** Every reference named in the texts, as "Q-0142", first seen first. */
export function parseRefs(...texts: (string | null | undefined)[]): string[] {
  const out: string[] = []
  for (const t of texts) {
    for (const m of (t ?? '').matchAll(/\bTRS-(Q-\d{4,})\b/gi)) {
      const r = m[1].toUpperCase()
      if (!out.includes(r)) out.push(r)
    }
  }
  return out
}

/** The subject with reply and forward prefixes and references stripped, lowercased, for comparison. */
export function baseSubject(subject: string | null | undefined): string {
  let s = (subject ?? '').replace(/\[TRS-Q-\d{4,}\]/gi, ' ')
  for (;;) {
    const next = s.replace(/^\s*(re|fw|fwd|aw|tr|sv|antw)\s*(\[\d+\])?\s*:\s*/i, '')
    if (next === s) break
    s = next
  }
  return s.replace(/\s+/g, ' ').trim().toLowerCase()
}

// ── Addresses ───────────────────────────────────────────────────────────────────────────────

export const domainOf = (email: string | null | undefined): string => (email ?? '').trim().toLowerCase().split('@')[1] ?? ''
export const isInternal = (email: string | null | undefined): boolean => domainOf(email) === INTERNAL_DOMAIN
/** A domain that names one organisation. A gmail.com address says nothing about who it is. */
export const isOrgDomain = (domain: string): boolean => !!domain && !PERSONAL_DOMAINS.has(domain) && domain !== INTERNAL_DOMAIN

// ── Forwards ────────────────────────────────────────────────────────────────────────────────

export type Forwarded = { from: { email: string; name: string | null } | null; subject: string | null; sent: string | null }

const FORWARD_MARKERS = [
  /-{2,}\s*Forwarded message\s*-{2,}/i,           // Gmail
  /-{2,}\s*Original Message\s*-{2,}/i,             // Outlook plain text
  /^_{10,}\s*$/m,                                  // Outlook HTML rendered to text
  /^Begin forwarded message:/im,                   // Apple Mail
]

/**
 * The email a TRS address forwarded, read from the header block under the forward marker: the
 * first From: that is not a TRS address, with the Subject and Date (or Sent) beside it. Null when
 * the message is not a forward or no outside sender can be read.
 */
export function readForward(subject: string | null | undefined, body: string | null | undefined): Forwarded | null {
  const text = (body ?? '').replace(/\r\n/g, '\n')
  const marked = FORWARD_MARKERS.map(re => text.search(re)).filter(i => i >= 0)
  const looksForwarded = /^\s*(fw|fwd)\s*:/i.test(subject ?? '') || marked.length > 0
  if (!looksForwarded) return null
  const start = marked.length ? Math.min(...marked) : 0
  const rest = text.slice(start)
  const blocks = rest.split(/\n(?=From:)/i).filter(b => /^From:/i.test(b.trimStart()))
  for (const block of blocks) {
    const head = block.split('\n').slice(0, 8).join('\n')
    const fromLine = head.match(/^\s*From:\s*(.+)$/im)?.[1] ?? ''
    const email = fromLine.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0]?.toLowerCase() ?? null
    if (!email || isInternal(email)) continue
    const name = fromLine.replace(/<[^>]*>|\[mailto:[^\]]*\]/gi, '').replace(email, '').replace(/["']/g, '').trim() || null
    return {
      from: { email, name },
      subject: head.match(/^\s*Subject:\s*(.+)$/im)?.[1]?.trim() ?? null,
      sent: head.match(/^\s*(?:Date|Sent):\s*(.+)$/im)?.[1]?.trim() ?? null,
    }
  }
  return { from: null, subject: null, sent: null }
}

// ── Matching a reply to its requests ────────────────────────────────────────────────────────

/** An open request, with what matching needs from its placement. */
export type OpenDispatch = {
  id: string
  placement_id: string
  placement_ref: string
  line_id: string
  to_email: string
  sent_subject: string | null
  rfc822_message_id: string | null
  /** False for a request from an earlier round of its line: only a reply naming its Message-ID files there. */
  current?: boolean
}

export type MatchFacts = {
  /** Who wrote it: the sender, or for a forward the original sender. */
  party: string
  subject: string | null
  body: string | null
  inReplyTo: string | null
}

export type MatchResult =
  | { kind: 'matched'; ids: string[]; via: 'header' | 'ref' | 'subject' }
  /** strength 'subject': the email names a request, so it is quote mail; 'domain': only the insurer is known. */
  | { kind: 'ambiguous'; ids: string[]; reason: string; strength: 'subject' | 'domain' }
  | { kind: 'none' }

const normId = (s: string | null | undefined) => (s ?? '').trim().replace(/^<|>$/g, '').toLowerCase()

/**
 * The requests this email answers. A reply that matches one request also answers its siblings:
 * the same insurer asked about other lines of the same placement (one email quoting WICA and EB).
 */
export function matchDispatches(f: MatchFacts, open: OpenDispatch[]): MatchResult {
  const party = f.party.trim().toLowerCase()
  const domain = domainOf(party)
  const sameSender = (d: OpenDispatch) => {
    const to = d.to_email.trim().toLowerCase()
    return to === party || (isOrgDomain(domain) && domainOf(to) === domain)
  }
  const sameInsurer = (a: OpenDispatch, b: OpenDispatch) => {
    const x = a.to_email.trim().toLowerCase(), y = b.to_email.trim().toLowerCase()
    return x === y || (isOrgDomain(domainOf(x)) && domainOf(x) === domainOf(y))
  }
  const live = open.filter(d => d.current !== false)
  // Siblings are the same insurer's requests for the OTHER lines of the placement, never another round of the same line.
  const withSiblings = (seed: OpenDispatch[]): string[] => {
    const lines = new Set(seed.map(s => s.line_id))
    return open.filter(d => seed.includes(d) || (d.current !== false && !lines.has(d.line_id) && seed.some(s => s.placement_id === d.placement_id && sameInsurer(s, d)))).map(d => d.id)
  }

  // 1. The reply names the request's Message-ID: certain, whoever replied.
  const irt = normId(f.inReplyTo)
  if (irt) {
    const hit = open.filter(d => normId(d.rfc822_message_id) === irt)
    if (hit.length) return { kind: 'matched', ids: withSiblings(hit), via: 'header' }
  }

  const fromParty = live.filter(sameSender)

  // 2. The reference, from the insurer the request went to.
  const refs = parseRefs(f.subject, f.body)
  if (refs.length) {
    const hit = fromParty.filter(d => refs.includes(d.placement_ref.toUpperCase()))
    if (hit.length) return { kind: 'matched', ids: withSiblings(hit), via: 'ref' }
  }

  // 3. The request's own subject, from the insurer the request went to.
  const base = baseSubject(f.subject)
  if (base) {
    const hit = fromParty.filter(d => d.sent_subject && baseSubject(d.sent_subject) === base)
    const placements = new Set(hit.map(d => d.placement_id))
    if (hit.length && placements.size === 1) return { kind: 'matched', ids: withSiblings(hit), via: 'subject' }
    if (hit.length) return { kind: 'ambiguous', ids: hit.map(d => d.id), reason: 'Same subject on more than one request to this insurer', strength: 'subject' }
  }

  // 4. Only the sender's domain: a broker picks.
  if (fromParty.length) return { kind: 'ambiguous', ids: fromParty.map(d => d.id), reason: `No reference or reply header; ${fromParty.length} open request${fromParty.length === 1 ? '' : 's'} to this insurer`, strength: 'domain' }
  return { kind: 'none' }
}

// ── Tiers ───────────────────────────────────────────────────────────────────────────────────

/** "S$ 1,000,000" and "1M" and "$1m" compare equal; so do "Plan B" and "plan b". */
export function tierKey(label: string | null | undefined): string {
  let s = (label ?? '').toLowerCase().replace(/s\$|sgd|\$/g, '').replace(/\s+/g, ' ').trim()
  s = s.replace(/(\d[\d,]*(?:\.\d+)?)\s*(m|mil|million|k|thousand)?\b/g, (_m, n: string, unit: string | undefined) => {
    let v = Number(n.replace(/,/g, ''))
    const u = (unit ?? '').toLowerCase()
    if (u.startsWith('m')) v *= 1_000_000
    else if (u === 'k' || u === 'thousand') v *= 1_000
    return String(v)
  })
  return s.replace(/[^a-z0-9.]+/g, ' ').trim()
}

/** The tier a quoted label belongs to, by key. Null when it names none of them. */
export function findTier<T extends { label: string }>(label: string | null | undefined, tiers: T[]): T | null {
  const k = tierKey(label)
  if (!k) return null
  return tiers.find(t => tierKey(t.label) === k) ?? null
}

// ── Done ────────────────────────────────────────────────────────────────────────────────────

const FINISHED = new Set(['done', 'dropped', 'lost', 'declined', 'closed'])
/** A line is finished when nothing more can happen on it. */
export const lineFinished = (status: string): boolean => FINISHED.has(status)
/** The placement closes when every line on it is finished. */
export const placementFinished = (statuses: string[]): boolean => statuses.length > 0 && statuses.every(lineFinished)
