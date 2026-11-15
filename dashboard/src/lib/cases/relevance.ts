/**
 * Where a thread sits for the people working a client: Active, Back burner or Member movements.
 * Additions, deletions and endorsements are their own group whatever their age, because they are
 * consolidated at year end. Anything else is Active only while it is on an open case and its last
 * message is within 90 days; the rest is Back burner. In renewal season only Active is shown.
 *
 * Pure and browser-safe. Tested in __tests__/relevance.test.ts.
 */
import type { Label } from './labels'

export const RELEVANCE = ['active', 'back_burner', 'member_movements'] as const
export type Relevance = typeof RELEVANCE[number]
export const RELEVANCE_NAME: Record<Relevance, string> = { active: 'Active', back_burner: 'Back burner', member_movements: 'Member movements' }

export const BACK_BURNER_DAYS = 90
export const RENEWAL_SEASON_DAYS = 90

const day = (iso: string) => Date.parse(iso.slice(0, 10))
/** Whole days from `from` to `to`; negative when `to` is earlier. */
export const daysBetween = (from: string, to: string) => Math.round((day(to) - day(from)) / 86_400_000)

export type RelevanceInput = { lastMessageAt: string | null | undefined; label: Label | null | undefined; onOpenCase: boolean }

export function relevanceOf(t: RelevanceInput, today: string): Relevance {
  if (t.label === 'member_movement' || t.label === 'endorsement') return 'member_movements'
  if (!t.lastMessageAt || daysBetween(t.lastMessageAt, today) > BACK_BURNER_DAYS) return 'back_burner'
  return t.onOpenCase ? 'active' : 'back_burner'
}

export type Season = { on: boolean; basis: string | null; date: string | null }

/** Renewal season: an open renewal case, or a policy on file ending within 90 days. The nearest date is the basis. */
export function renewalSeason(i: { openRenewalCases: readonly { title: string | null; deadline?: string | null }[]; policyEnds: readonly (string | null | undefined)[] }, today: string): Season {
  const soon = i.policyEnds.filter((d): d is string => !!d && daysBetween(today, d) >= 0 && daysBetween(today, d) <= RENEWAL_SEASON_DAYS).sort()[0] ?? null
  if (soon) return { on: true, basis: 'policy ends', date: soon.slice(0, 10) }
  const c = i.openRenewalCases[0]
  if (c) return { on: true, basis: 'renewal case open', date: c.deadline?.slice(0, 10) ?? null }
  return { on: false, basis: null, date: null }
}

/**
 * What the client-wide case reader leaves out in renewal season: member movements and endorsements
 * that are on no open case. A thread on no case yet stays in, since that read is what files it.
 */
export const leftOutInSeason = (season: Season, t: RelevanceInput, today: string) => season.on && !t.onOpenCase && relevanceOf(t, today) === 'member_movements'

/** What a view lists. Renewal season hides Back burner and Member movements. */
export const shownIn = (view: 'all' | 'renewal_season', r: Relevance) => view === 'all' || r === 'active'
