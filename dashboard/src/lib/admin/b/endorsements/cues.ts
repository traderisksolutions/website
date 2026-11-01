/**
 * Minds change. These are the pure rules that read a change of mind out of a client's or an
 * insurer's words and decide what it does to the movements on file. No I/O; tested on their own.
 *
 *   client   withdraw      "ignore my last email", "disregard", "cancel my request"
 *            cancel        "X is staying", "cancel the deletion of X", "not leaving after all"
 *            change        "instead of 1 Nov, 15 Nov", "change to plan 2", "the correct date is"
 *            contradiction two instructions for one person that do not agree (found by comparing,
 *                          not by words): the later stands, the earlier is kept as superseded
 *   insurer  query         "please provide DOB", "pending documents", "kindly furnish", "unable to process"
 *            reject        "unable to add/cover X", "declined", "not eligible"
 *            reissue       "revised", "re-issued", "amended", "supersedes", "replaces our note"
 *            partial       "the remaining", "pending the other", "1 of 3", "balance to follow"
 */
import type { MovementKind } from '@/lib/policies/types'

export type ClientIntent = 'withdraw' | 'cancel' | 'change' | 'none'
export type InsurerIntent = 'query' | 'reject' | 'reissue' | 'partial' | 'none'

/** The words each intent is read from. Listed, so a person can see why the agent read a change of mind. */
export const CLIENT_CUES: Record<Exclude<ClientIntent, 'none'>, RegExp[]> = {
  withdraw: [
    /\b(?:please\s+)?(?:ignore|disregard|discard|scrap|withdraw|cancel|hold off(?: on)?|do not (?:proceed|process|action))\s+(?:my|our|the|this|that)?\s*(?:last|previous|earlier|prior)?\s*(?:e-?mail|mail|message|request|instruction|submission|list)\b/i,
    /\b(?:on hold|put (?:it|this) on hold|hold (?:it|this|the (?:request|changes?)))\b/i,
    /\bsent (?:you )?(?:the wrong|an incorrect) (?:list|file|sheet|e-?mail)\b/i,
  ],
  cancel: [
    /\b(?:cancel|withdraw|reverse|retract|revoke|void)\s+(?:the\s+)?(?:deletion|removal|termination|addition|inclusion|join(?:ing)?|change|movement|endorsement|request)\b/i,
    /\b(?:is|are|will be)\s+(?:staying|remaining|retained|not leaving|no longer leaving|not resigning)\b/i,
    /\b(?:not leaving|not resigning|no longer resigning|rescind(?:ed|s)? (?:his|her|their) resignation|withdr[ae]w(?:n|s)? (?:his|her|their) resignation)\b/i,
    /\b(?:do not|don't|please do not|no need to)\s+(?:add|include|delete|remove|terminate|process)\b/i,
    /\bnot (?:joining|coming on board|starting) (?:us|after all|anymore|any more)\b/i,
  ],
  change: [
    /\binstead of\b/i,
    /\b(?:change|amend|correct|revise|update)\s+(?:the\s+)?(?:effective\s+date|date|last day|start date|plan|category|name|spelling|dob|date of birth|passport|nric|fin)\b/i,
    /\b(?:the\s+)?(?:correct|right|actual|revised|new|amended)\s+(?:effective\s+date|date|last day|start date|plan|spelling|name|dob)\s+(?:is|should be|will be)\b/i,
    /\b(?:should be|should have been|ought to be)\s+\d{1,2}[\s/.-]/i,
    /\b(?:typo|error|mistake|wrongly|incorrectly)\b.*\b(?:date|name|plan|spelling)\b/i,
    /\bchange (?:him|her|them|it)? ?to\b/i,
  ],
}

export const INSURER_CUES: Record<Exclude<InsurerIntent, 'none'>, RegExp[]> = {
  // A request is a query only when the same sentence says what is wanted: "please confirm" alone is how insurers end any mail.
  query: [
    /\b(?:please|kindly|pls)\s+(?:provide|furnish|submit|send|advise|confirm|clarify|share)\b[^.?!\n]{0,120}\b(?:dob|date of birth|passport|nric|fin\b|work permit|medical|declaration|form|proof|supporting|inception date|effective date|commencement date|last day|member|staff|employee|dependant|dependent|plan|category|salary|occupation|nationality|gender|age)\b/i,
    /\b(?:pending|awaiting|require|required|need|missing)\s+(?:the\s+)?(?:documents?|information|details|dob|date of birth|passport|nric|fin|work permit|medical|declaration|form|proof|supporting)\b/i,
    /\b(?:unable to|cannot|can't)\s+(?:process|proceed|effect|action)\b[^.?!\n]{0,80}\b(?:without|until|pending|as)\b/i,
    /\b(?:incomplete|insufficient)\s+(?:information|details|documents?)\b/i,
    /\bwhat is (?:the|his|her|their)\s+(?:dob|date of birth|effective date|plan|category)\b/i,
  ],
  reject: [
    /\b(?:unable|not able|decline[ds]?|refuse[ds]?|regret(?:s|ted)?)\s+(?:to\s+)?(?:add|include|cover|accept|insure|enrol|extend)\b/i,
    /\b(?:not eligible|ineligible|does not (?:meet|qualify)|outside (?:the )?(?:age|eligibility)|exceeds? (?:the )?(?:age|limit))\b/i,
    /\b(?:rejected|declined|not accepted)\b/i,
  ],
  reissue: [
    /\b(?:revised|re-?issued|amended|corrected|replacement|updated)\s+(?:tax\s+)?(?:invoice|debit note|credit note|endorsement|note)\b/i,
    /\b(?:supersedes?|replaces?|in place of|in lieu of|cancels? and replaces?)\b.*\b(?:invoice|note|endorsement)\b/i,
    /\b(?:please|kindly)\s+(?:disregard|ignore)\s+(?:the\s+)?(?:earlier|previous|prior|our last)\s+(?:invoice|note|endorsement)\b/i,
  ],
  partial: [
    /\b(?:the\s+)?(?:remaining|balance|other|rest of the)\s+(?:member|staff|employee|person|name|movement|item|endorsement)s?\b/i,
    /\b\d\s+(?:out\s+)?of\s+\d\b/i,
    /\b(?:to follow|will follow|separately|in a separate (?:note|invoice|endorsement))\b/i,
    /\bpending\s+(?:the\s+)?(?:other|remaining)\b/i,
  ],
}

const firstHit = (cues: RegExp[], text: string): string | null => {
  for (const re of cues) { const m = re.exec(text); if (m) return m[0].slice(0, 120) }
  return null
}

/** The client's own words, without quoted history. */
export const ownText = (body: string | null | undefined) => (body ?? '').split(/\n(?:On .{10,120} wrote:|From: .+|-{3,} ?Original Message|_{10,})/)[0]

/** What a client's mail does to earlier instructions. Withdraw outranks cancel outranks change. */
export function detectClientIntent(subject: string | null | undefined, body: string | null | undefined): { intent: ClientIntent; cue: string | null } {
  const text = `${subject ?? ''}\n${ownText(body)}`
  for (const intent of ['withdraw', 'cancel', 'change'] as const) {
    const cue = firstHit(CLIENT_CUES[intent], text)
    if (cue) return { intent, cue }
  }
  return { intent: 'none', cue: null }
}

/** What an insurer's mail does. Reissue and reject outrank a query; partial is read beside any of them. */
export function detectInsurerIntent(subject: string | null | undefined, body: string | null | undefined): { intent: InsurerIntent; cue: string | null; partial: boolean } {
  const text = `${subject ?? ''}\n${ownText(body)}`
  const partial = !!firstHit(INSURER_CUES.partial, text)
  for (const intent of ['reissue', 'reject', 'query'] as const) {
    const cue = firstHit(INSURER_CUES[intent], text)
    if (cue) return { intent, cue, partial }
  }
  return { intent: partial ? 'partial' : 'none', cue: partial ? firstHit(INSURER_CUES.partial, text) : null, partial }
}

/** The sentences of an insurer's query that say what is wanted, for the request to the client. */
export function askedItems(body: string | null | undefined): string[] {
  const text = ownText(body).replace(/\s+/g, ' ')
  const sentences = text.split(/(?<=[.?!])\s+|\n+|;\s+/).map(s => s.trim()).filter(Boolean)
  const asked = sentences.filter(s => INSURER_CUES.query.some(re => re.test(s)) || /\b(?:dob|date of birth|passport|nric|fin|work permit|medical|declaration|form|proof)\b/i.test(s))
  return Array.from(new Set(asked.map(s => s.slice(0, 240)))).slice(0, 8)
}

// ── Reconciling a client's new instruction with what is on file ─────────────────────────────

export type OnFile = { id: string; kind: MovementKind; member_name: string; effective_on: string | null; last_day: string | null; status: string; batch_id: string | null; version: number | null; transaction_id?: string | null }
export type Incoming = { kind: MovementKind; name: string; effective_on: string | null; last_day: string | null; detail: Record<string, unknown> }

export type Action =
  | { do: 'cancel'; movement: OnFile; reason: 'client withdrew' | 'client cancelled' }
  | { do: 'supersede'; movement: OnFile; with: Incoming; reason: 'client changed' | 'later instruction' }
  | { do: 'reverse'; movement: OnFile; reason: 'client cancelled after billing' }
  | { do: 'new'; with: Incoming }

export const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const same = (a: string, b: string) => { const x = normName(a), y = normName(b); return x === y || (x.length >= 6 && (x.includes(y) || y.includes(x))) }
const live = (m: OnFile) => m.status !== 'cancelled' && m.status !== 'settled'
const beforeInsurer = (m: OnFile) => m.status === 'reported'
const afterNote = (m: OnFile) => m.status === 'noted' || m.status === 'billed'

/**
 * The plan for a client mail, as actions on the movements on file. Pure.
 *   withdraw  → every movement the same thread reported and not yet noted is cancelled; sent ones
 *               are cancelled too (the amendment to the insurer is drafted from the cancellations).
 *   cancel    → the named movements are cancelled (reversed when the insurer has already noted them).
 *   change    → the named movements are superseded by the new version.
 *   otherwise → a name already on file with a different kind or date: the later instruction wins,
 *               the earlier is superseded; the same instruction again is dropped; new names are new.
 */
export function planClientAmendment(intent: ClientIntent, incoming: Incoming[], onFile: OnFile[], threadId: string | null, reportedThreadOf: (m: OnFile) => string | null): Action[] {
  const actions: Action[] = []
  const mine = onFile.filter(live)
  if (intent === 'withdraw') {
    const target = mine.filter(m => !afterNote(m) && (!threadId || reportedThreadOf(m) === threadId))
    for (const m of target) actions.push({ do: 'cancel', movement: m, reason: 'client withdrew' })
    return actions
  }
  const used = new Set<string>()
  for (const inc of incoming) {
    const hits = mine.filter(m => same(m.member_name, inc.name) && !used.has(m.id))
    if (intent === 'cancel') {
      // "Ahmad is staying": the leave on file is cancelled; a mail that only names people cancels whatever is on file for them. A name with nothing on file is a new instruction.
      if (!hits.length) { actions.push({ do: 'new', with: inc }); continue }
      for (const m of hits) { used.add(m.id); actions.push(afterNote(m) ? { do: 'reverse', movement: m, reason: 'client cancelled after billing' } : { do: 'cancel', movement: m, reason: 'client cancelled' }) }
      continue
    }
    const sameKind = hits.find(m => m.kind === inc.kind)
    if (sameKind) {
      used.add(sameKind.id)
      const differs = (inc.effective_on && inc.effective_on !== sameKind.effective_on) || (inc.last_day && inc.last_day !== sameKind.last_day) || Object.keys(inc.detail).some(k => ['plan', 'category', 'new_name', 'dob'].includes(k) && inc.detail[k] != null)
      if (!differs) continue   // the same instruction again
      actions.push(afterNote(sameKind) ? { do: 'reverse', movement: sameKind, reason: 'client cancelled after billing' } : { do: 'supersede', movement: sameKind, with: inc, reason: intent === 'change' ? 'client changed' : 'later instruction' })
      if (afterNote(sameKind)) actions.push({ do: 'new', with: inc })
      continue
    }
    const other = hits[0]
    if (other && other.kind !== inc.kind && !(other.kind === 'join' && inc.kind === 'leave')) {
      // A leave for someone with a pending join, or a join for someone with a pending leave: the later instruction stands.
      used.add(other.id)
      actions.push(afterNote(other) ? { do: 'reverse', movement: other, reason: 'client cancelled after billing' } : { do: 'supersede', movement: other, with: inc, reason: 'later instruction' })
      if (afterNote(other)) actions.push({ do: 'new', with: inc })
      continue
    }
    actions.push({ do: 'new', with: inc })
  }
  return actions
}

/** True when a plan touches a movement the insurer already has (sent or later): an amendment must go to the insurer. */
export const needsAmendment = (actions: Action[]) => actions.some(a => a.do !== 'new' && !beforeInsurer(a.movement))

// ── Re-issued notes and corrections ─────────────────────────────────────────────────────────

/**
 * A corrective TRS note when the insurer re-issues: the signed difference between the latest and
 * the earlier insurer figure (both signed, credits negative). Zero means nothing to correct.
 */
export function correctionAmount(previousSigned: number, latestSigned: number): { kind: 'debit' | 'credit'; amount: number } | null {
  const diff = Math.round((latestSigned - previousSigned) * 100) / 100
  if (diff === 0) return null
  return { kind: diff > 0 ? 'debit' : 'credit', amount: Math.abs(diff) }
}

/** The line in the chase when the insurer noted some of a batch: "1 of 3 still unnoted". */
export function partialLine(total: number, remaining: number): string | null {
  if (remaining <= 0 || remaining >= total) return null
  return `${remaining} of ${total} still unnoted`
}
