'use client'

import { useEffect, useState } from 'react'

/**
 * Single source of truth for the "not enough room for a labeled rail + list + detail" breakpoint
 * — Sidebar.tsx auto-collapses to icons below this width, and any list+detail page (currently
 * just /engagement) needs to agree with that exact threshold, or the two can disagree at some
 * width (e.g. Sidebar hides its list-detail nav while the page still renders the wide desktop
 * layout that nav was supposed to control).
 */
export const NARROW_BREAKPOINT = 1280

export function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${NARROW_BREAKPOINT - 1}px)`)
    const update = () => setNarrow(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return narrow
}
