'use client'

/**
 * The trail: the pages a person clicked through, in this tab, so Back goes to where they came
 * from and the breadcrumbs show the way back. Each page pushes itself on mount; reaching a page
 * already on the trail cuts the trail back to it (a loop does not grow it). Session storage, one
 * tab, at most eight steps; nothing of it reaches the server.
 */
import { useEffect, useState } from 'react'

export type Crumb = { label: string; href: string }
const KEY = 'trs:trail'

export function readTrail(): Crumb[] {
  try { const v = JSON.parse(sessionStorage.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v.filter(c => c && typeof c.href === 'string' && typeof c.label === 'string') : [] } catch { return [] }
}

/** Pure: the trail after arriving at `c`. */
export function trailAfter(trail: Crumb[], c: Crumb): Crumb[] {
  const i = trail.findIndex(x => x.href === c.href)
  return (i >= 0 ? trail.slice(0, i) : trail).concat(c).slice(-8)
}

export function pushCrumb(c: Crumb): Crumb[] {
  const next = trailAfter(readTrail(), c)
  try { sessionStorage.setItem(KEY, JSON.stringify(next)) } catch { /* private window */ }
  return next
}

/**
 * Registers this page on the trail and returns the steps before it, and the one Back goes to:
 * the previous step on the trail, else the page's own parent.
 */
export function useTrail(current: Crumb | null, fallback: Crumb): { before: Crumb[]; back: Crumb } {
  const [before, setBefore] = useState<Crumb[]>([])
  useEffect(() => {
    if (!current) return
    const next = pushCrumb(current)
    setBefore(next.slice(0, -1))
  }, [current?.href, current?.label]) // eslint-disable-line react-hooks/exhaustive-deps
  return { before, back: before.at(-1) ?? fallback }
}
