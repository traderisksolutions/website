/**
 * Pure rules for the Today list: which group an open item sits in, and when "Come back later"
 * brings it back. No I/O, so they are tested on their own (rules.test.ts).
 */

export type TodayGroup = 'send' | 'decide' | 'act' | 'read' | 'later' | 'none'
export type LaterChoice = 'afternoon' | 'tomorrow' | 'monday' | 'client_reply' | 'insurer_reply'

export const LATER_CHOICES: LaterChoice[] = ['afternoon', 'tomorrow', 'monday', 'client_reply', 'insurer_reply']
export const LATER_LABEL: Record<LaterChoice, string> = {
  afternoon: 'This afternoon', tomorrow: 'Tomorrow 09:00', monday: 'Monday 09:00',
  client_reply: 'When the client replies', insurer_reply: 'When the insurer replies',
}

export type GroupInput = {
  status: string
  needs_human: string | null
  has_draft: boolean
  last_activity_at: string | null
  later_until: string | null
  later_when: string | null
  seen_at: string | null       // the latest "seen" by anyone on this item
}

const READ_WINDOW_DAYS = 7

/** True while "Come back later" holds the item off the list. */
export function isLater(i: Pick<GroupInput, 'later_until' | 'later_when' | 'last_activity_at'>, now: Date): boolean {
  if (!i.later_until) return false
  // "When they reply": later_until holds the moment it was set; any newer mail brings it back.
  if (i.later_when) return !(i.last_activity_at && Date.parse(i.last_activity_at) > Date.parse(i.later_until))
  return Date.parse(i.later_until) > now.getTime()
}

/** Which group an open item belongs to. A decision outranks a draft; a draft outranks work to do. */
export function groupOf(i: GroupInput, now: Date): TodayGroup {
  if (i.status === 'done') return 'none'
  if (isLater(i, now)) return 'later'
  if (i.needs_human) return 'decide'
  if (i.has_draft) return 'send'
  if (i.status === 'trs_to_act' || i.status === 'stalled') return 'act'
  // Waiting on someone: on the list only when something new arrived that nobody has read.
  const last = i.last_activity_at ? Date.parse(i.last_activity_at) : 0
  const recent = last > now.getTime() - READ_WINDOW_DAYS * 86_400_000
  const unseen = !i.seen_at || Date.parse(i.seen_at) < last
  return recent && unseen ? 'read' : 'none'
}

/** Singapore wall-clock time (UTC+8, no DST) as a UTC Date. */
function sgt(y: number, m: number, d: number, h: number): Date {
  return new Date(Date.UTC(y, m, d, h - 8, 0, 0))
}

/** The later_until / later_when a choice writes. */
export function laterFor(choice: LaterChoice, now: Date): { later_until: string; later_when: string | null } {
  const local = new Date(now.getTime() + 8 * 3_600_000)
  const y = local.getUTCFullYear(), m = local.getUTCMonth(), d = local.getUTCDate(), h = local.getUTCHours()
  switch (choice) {
    case 'afternoon': {
      const at = h < 14 ? sgt(y, m, d, 14) : new Date(now.getTime() + 3 * 3_600_000)
      return { later_until: at.toISOString(), later_when: null }
    }
    case 'tomorrow': return { later_until: sgt(y, m, d + 1, 9).toISOString(), later_when: null }
    case 'monday': {
      const dow = local.getUTCDay()               // 0 Sunday … 6 Saturday
      const ahead = ((8 - dow) % 7) || 7          // the next Monday, never today
      return { later_until: sgt(y, m, d + ahead, 9).toISOString(), later_when: null }
    }
    case 'client_reply':
    case 'insurer_reply':
      return { later_until: now.toISOString(), later_when: choice }
  }
}

/** The bridge on the home map a case type belongs to. */
export type Bridge = 'rfq' | 'claims' | 'endorsements' | 'other'
export function bridgeOf(caseType: string): Bridge {
  if (caseType === 'new_quote' || caseType === 'renewal') return 'rfq'
  if (caseType === 'claim') return 'claims'
  if (caseType === 'endorsement' || caseType === 'member_movement') return 'endorsements'
  return 'other'
}
