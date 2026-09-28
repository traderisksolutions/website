'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { ThreadListPane, CollapsedNavRail } from '@/components/engagement/ThreadListPane'
import { useEngagementNav } from '@/providers/engagement-nav-provider'
import { useNarrowViewport } from '@/hooks/useNarrowViewport'
import { useResizableRailWidth, RAIL_COLLAPSED } from '@/hooks/useResizableRailWidth'

const ENGAGEMENT_ROUTE = '/engagement'
const HAIRLINE = '#e8eaed'

function onEngagementRoute(pathname: string) {
  return pathname === ENGAGEMENT_ROUTE || pathname.startsWith(ENGAGEMENT_ROUTE + '/')
}

/** True when the navigator shows as a fixed column — ConditionalShell pushes page content
 *  right by its width (--engagement-rail-w) so nothing sits underneath. */
export function useShowEngagementRail() {
  const pathname = usePathname()
  const narrow = useNarrowViewport()
  return onEngagementRoute(pathname) && !narrow
}

/**
 * /engagement's left column on wide screens: the Unified Mail Navigator (ThreadListPane).
 * Drag-resizable (320–460px, default 380) via a handle on its right edge, persisted to
 * localStorage and shared with ConditionalShell's margin through --engagement-rail-w. Collapsed
 * (`navCollapsed` in the nav provider) it becomes a fixed 64px icon rail and writes that width
 * into the same CSS variable. Below NARROW_BREAKPOINT the page renders the navigator inline and
 * this renders nothing.
 */
export function EngagementRail() {
  const showRail = useShowEngagementRail()
  const { navCollapsed } = useEngagementNav()
  const { width, min, max, step, startDrag, nudge, setAbsolute } = useResizableRailWidth()

  // Keep --engagement-rail-w in step with the collapsed state. Declared after the hook's own
  // mount effect so this write lands last on first paint.
  useEffect(() => {
    if (!showRail) return
    document.documentElement.style.setProperty('--engagement-rail-w', `${navCollapsed ? RAIL_COLLAPSED : width}px`)
  }, [showRail, navCollapsed, width])

  if (!showRail) return null

  if (navCollapsed) {
    return (
      <aside className="fixed left-0 z-30 bg-white overflow-hidden" style={{ top: 56, bottom: 0, width: RAIL_COLLAPSED, borderRight: `1px solid ${HAIRLINE}` }} aria-label="Mail navigator, collapsed">
        <CollapsedNavRail />
      </aside>
    )
  }

  return (
    <aside className="fixed left-0 z-30 bg-white overflow-hidden" style={{ top: 56, bottom: 0, width: 'var(--engagement-rail-w, 380px)', borderRight: `1px solid ${HAIRLINE}` }} aria-label="Mail navigator">
      <div className="relative h-full">
        <ThreadListPane collapsible />
        <div role="separator" aria-orientation="vertical" aria-label="Resize navigator" aria-valuenow={width} aria-valuemin={min} aria-valuemax={max} tabIndex={0}
          onPointerDown={e => { e.preventDefault(); startDrag(e.clientX, width) }}
          onKeyDown={e => {
            if (e.key === 'ArrowLeft')       { e.preventDefault(); nudge(-step) }
            else if (e.key === 'ArrowRight') { e.preventDefault(); nudge(step) }
            else if (e.key === 'Home')       { e.preventDefault(); setAbsolute(min) }
            else if (e.key === 'End')        { e.preventDefault(); setAbsolute(max) }
          }}
          className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize z-10 flex items-center justify-center group focus-visible:outline-none">
          <div className="w-px h-full bg-transparent group-hover:bg-[#202124]/30 group-focus-visible:bg-[#202124]/60 transition-colors" />
        </div>
      </div>
    </aside>
  )
}
