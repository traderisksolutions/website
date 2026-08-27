'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { EngagementFolderNav } from '@/components/engagement/EngagementFolderNav'
import { useNarrowViewport } from '@/hooks/useNarrowViewport'
import { useResizableRailWidth, RAIL_ICON_THRESHOLD } from '@/hooks/useResizableRailWidth'
import { cn } from '@/lib/utils'

const ENGAGEMENT_ROUTE = '/engagement'

function onEngagementRoute(pathname: string) {
  return pathname === ENGAGEMENT_ROUTE || pathname.startsWith(ENGAGEMENT_ROUTE + '/')
}

/** True when the engagement conversation list is showing as a rail (see EngagementRail below) —
 *  ConditionalShell uses this to push page content right by the rail's current width (the
 *  --engagement-rail-w CSS var) so it doesn't sit underneath the fixed rail. */
export function useShowEngagementRail() {
  const pathname = usePathname()
  const narrow = useNarrowViewport()
  return onEngagementRoute(pathname) && !narrow
}

/**
 * /engagement is a list+detail page: EngagementFolderNav (its conversation list, fed via
 * EngagementNavProvider) needs a persistent left column on wide screens — engagement/page.tsx's
 * own "isDesktop" branch (see useNarrowViewport) assumes this column exists and renders only the
 * thread view itself, not a list. It used to live inside the old rail Sidebar (see git history);
 * now that the primary nav is a top bar with no vertical rail, it gets its own fixed column below
 * the navbar instead, using the exact same NARROW_BREAKPOINT so the two can't disagree about
 * which layout is showing. Below that breakpoint engagement/page.tsx renders its own inline list
 * (EaListPanel, not resizable — dragging is a desktop-only affordance here), so this renders
 * nothing.
 *
 * Width is drag-resizable (64–520px, default 340) via a handle on the right edge, persisted to
 * localStorage and shared with ConditionalShell's MainContent margin through the
 * --engagement-rail-w CSS custom property — see useResizableRailWidth. Below
 * RAIL_ICON_THRESHOLD it collapses to an icon-only rail (avatar circles, no text) rather than
 * cramming full rows into an unusably narrow column.
 */
export function EngagementRail() {
  const showRail = useShowEngagementRail()
  const { width, min, max, step, startDrag, nudge, setAbsolute } = useResizableRailWidth()
  if (!showRail) return null

  const iconOnly = width < RAIL_ICON_THRESHOLD

  return (
    <aside
      className="fixed left-0 flex flex-col z-30 glass-sidebar border-r border-[--border-subtle] overflow-hidden"
      style={{ top: 56, bottom: 0, width: 'var(--engagement-rail-w, 340px)' }}
    >
      <Link
        href="/"
        title="Dashboard"
        className={cn(
          'flex-shrink-0 flex items-center gap-1.5 h-7 rounded-md text-[11.5px] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors no-underline',
          iconOnly ? 'justify-center w-7 mx-auto mt-2 mb-2' : 'px-2.5 mx-2 mt-2 mb-2',
        )}
      >
        <ArrowLeft size={12} strokeWidth={2} /> {!iconOnly && 'Dashboard'}
      </Link>
      <EngagementFolderNav iconOnly={iconOnly} />

      {/* Drag handle — the aside's own `fixed` positioning already establishes the containing
          block for this absolute child, so it tracks the rail's right edge as it resizes. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize conversation list"
        aria-valuenow={width}
        aria-valuemin={min}
        aria-valuemax={max}
        tabIndex={0}
        onPointerDown={e => { e.preventDefault(); startDrag(e.clientX, width) }}
        onKeyDown={e => {
          if (e.key === 'ArrowLeft')       { e.preventDefault(); nudge(-step) }
          else if (e.key === 'ArrowRight') { e.preventDefault(); nudge(step) }
          else if (e.key === 'Home')       { e.preventDefault(); setAbsolute(min) }
          else if (e.key === 'End')        { e.preventDefault(); setAbsolute(max) }
        }}
        className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize z-10 flex items-center justify-center group focus-visible:outline-none"
      >
        <div className="w-px h-full bg-transparent group-hover:bg-primary/40 group-focus-visible:bg-primary/60 transition-colors" />
      </div>
    </aside>
  )
}
