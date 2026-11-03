/**
 * A movement is acted on only when it is confirmed and dated. Pure; tested in
 * src/lib/admin/b/endorsements/__tests__/date-gate.test.ts.
 *
 * Clients write ahead: "heads up, we are hiring ABC next month" and, weeks later, "ABC joined on
 * 3 Nov". The first is held (status 'pending', no member added, nothing to the insurer); the
 * second carries the date, so the held movement is released into the batch with it.
 *
 *   hold  no date: a joiner without a first day, a leaver without a last day or effective date,
 *         a plan or category change without an effective date (a name change needs no date)
 *   hold  a date, but the words say it is not settled: heads up, tentative, TBC, not confirmed,
 *         pending the offer, potential hire, hiring or recruiting
 *   act   otherwise, a future date included ("ABC will join on 1 Dec" is endorsed from 1 Dec)
 */
import type { ParsedMovement } from './types'

export type HoldReason = 'no_date' | 'tentative'
export type Gate = { act: true } | { act: false; reason: HoldReason; cue: string | null }

/** Words that make a reported movement a forecast, whatever date it carries. */
export const TENTATIVE_CUES: RegExp[] = [
  /\bheads?[\s-]?up\b/i,
  /\b(?:tentative(?:ly)?|provisional(?:ly)?|tbc|tba|to be (?:confirmed|advised|finali[sz]ed))\b/i,
  /\b(?:not (?:yet )?(?:confirmed|finali[sz]ed|fixed)|yet to (?:be )?(?:confirm|finali[sz]|fix)\w*|unconfirmed)\b/i,
  /\b(?:pending|subject to|awaiting)\s+(?:the\s+|his\s+|her\s+|their\s+)?(?:offer|acceptance|confirmation|approval|signing|work pass|ep|s ?pass|work permit)\b/i,
  /\b(?:potential|prospective|possible|likely|expected)\s+(?:new\s+)?(?:hires?|joiners?|candidates?|staff|employees?|leavers?|resignations?)\b/i,
  /\b(?:we are|we're|currently|still)\s+(?:hiring|recruiting|interviewing|looking for)\b/i,
  /\b(?:plan(?:ning)?|intend(?:ing)?|looking|hoping)\s+to\s+(?:hire|add|onboard|bring (?:in|on))\b/i,
  /\b(?:may|might|could)\s+(?:be\s+)?(?:join\w*|leav\w*|resign\w*|start\w*|hire\w*)\b/i,
]

/** The first tentative cue in the text, as written; null when none. */
export function tentativeCue(text: string | null | undefined): string | null {
  const t = text ?? ''
  for (const re of TENTATIVE_CUES) { const m = re.exec(t); if (m) return m[0] }
  return null
}

/** Whether the movement carries the date the insurer needs. */
export function hasDate(m: Pick<ParsedMovement, 'kind' | 'effective_on' | 'last_day' | 'detail'>): boolean {
  if (m.kind === 'change' && (m.detail?.change === 'name' || typeof m.detail?.new_name === 'string')) return true
  if (m.kind === 'leave') return !!(m.last_day || m.effective_on)
  return !!m.effective_on
}

/**
 * Act or hold. The cue is looked for in the movement's own words first, then in the mail's opening
 * (the part before the first list item or name), so "Heads up:" over a list holds the whole list.
 * A model read that marks the person tentative holds too.
 */
export function dateGate(m: Pick<ParsedMovement, 'kind' | 'effective_on' | 'last_day' | 'detail' | 'quote'>, mailOpening = ''): Gate {
  const cue = tentativeCue(m.quote) ?? tentativeCue(mailOpening) ?? (m.detail?.tentative === true ? 'read as tentative' : null)
  if (cue) return { act: false, reason: 'tentative', cue }
  if (!hasDate(m)) return { act: false, reason: 'no_date', cue: null }
  return { act: true }
}

/** The mail text a "Heads up" over a whole list sits in: subject plus the lines before the first list item. */
export function mailOpening(subject: string | null | undefined, body: string | null | undefined): string {
  const lines = (body ?? '').split(/\r?\n/)
  const first = lines.findIndex(l => /^\s*(?:[-•*·]|\d{1,2}[.)]|\(\d{1,2}\))\s+\S/.test(l))
  return `${subject ?? ''}\n${(first < 0 ? lines.slice(0, 6) : lines.slice(0, first)).join('\n')}`.slice(0, 1200)
}

export const HOLD_TEXT: Record<HoldReason, string> = {
  no_date: 'held: no effective date given',
  tentative: 'held: heads-up, not confirmed',
}
