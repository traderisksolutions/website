'use client'

/**
 * The trail: the pages a person clicked through, in this tab, so Back goes to where they came
 * from and the breadcrumbs show the way back. Each page pushes itself on mount; reaching a page
 * already on the trail cuts the trail back to it (a loop does not grow it). Session storage, one
 * tab, at most eight steps; nothing of it reaches the server.
 *
 * A link opens in a new tab (NewTabLinks), and a new tab starts with an empty session: the trail
 * travels with the link in its hash (`#t=…`), is read once on arrival and stripped, so the
 * quotation opened from a thread still shows "← the thread" in its own tab.
 */
import { useEffect, useState } from 'react'

export type Crumb = { label: string; href: string }
const KEY = 'trs:trail'
const HASH_KEY = 't'

export function readTrail(): Crumb[] {
  adoptHashTrail()
  try { const v = JSON.parse(sessionStorage.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v.filter(c => c && typeof c.href === 'string' && typeof c.label === 'string') : [] } catch { return [] }
}

function writeTrail(trail: Crumb[]) {
  try { sessionStorage.setItem(KEY, JSON.stringify(trail)) } catch { /* private window */ }
}

/** Pure: the trail after arriving at `c`. */
export function trailAfter(trail: Crumb[], c: Crumb): Crumb[] {
  const i = trail.findIndex(x => x.href === c.href)
  return (i >= 0 ? trail.slice(0, i) : trail).concat(c).slice(-8)
}

export function pushCrumb(c: Crumb): Crumb[] {
  const next = trailAfter(readTrail(), c)
  writeTrail(next)
  return next
}

/** The trail as a hash fragment for a link that opens elsewhere. Pure. */
export function encodeTrail(trail: Crumb[]): string {
  try { return `${HASH_KEY}=${encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(trail.slice(-8))))))}` } catch { return '' }
}

/** The trail a hash fragment carries, or null when it carries none. Pure. */
export function decodeTrail(hash: string): Crumb[] | null {
  const m = String(hash ?? '').replace(/^#/, '').match(new RegExp(`(?:^|&)${HASH_KEY}=([^&]+)`))
  if (!m) return null
  try {
    const v = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1])))))
    return Array.isArray(v) ? v.filter(c => c && typeof c.href === 'string' && typeof c.label === 'string').slice(-8) : null
  } catch { return null }
}

/** The URL with the trail that leads to it, for a new tab. Pure. */
export function withTrail(href: string, trail: Crumb[]): string {
  const t = encodeTrail(trail)
  if (!t) return href
  const [base, hash = ''] = href.split('#')
  return `${base}#${hash ? `${hash}&` : ''}${t}`
}

/** On arrival in a new tab: the trail in the hash becomes this tab's, and the hash is cleared. */
function adoptHashTrail() {
  if (typeof window === 'undefined') return
  const trail = decodeTrail(window.location.hash)
  if (!trail) return
  writeTrail(trail)
  const rest = window.location.hash.replace(/^#/, '').split('&').filter(p => !p.startsWith(`${HASH_KEY}=`)).join('&')
  try { window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}${rest ? `#${rest}` : ''}`) } catch { /* leave it */ }
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
