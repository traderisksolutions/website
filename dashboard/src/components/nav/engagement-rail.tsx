'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { EngagementFolderNav } from '@/components/engagement/EngagementFolderNav'
import { useNarrowViewport } from '@/hooks/useNarrowViewport'

const ENGAGEMENT_ROUTE = '/engagement'
export const ENGAGEMENT_RAIL_WIDTH = 340

function onEngagementRoute(pathname: string) {
  return pathname === ENGAGEMENT_ROUTE || pathname.startsWith(ENGAGEMENT_ROUTE + '/')
}

/** True when the engagement conversation list is showing as a rail (see EngagementRail below) —
 *  ConditionalShell uses this to push page content right by ENGAGEMENT_RAIL_WIDTH so it doesn't
 *  sit underneath the fixed rail. */
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
 * (EaListPanel), so this renders nothing.
 */
export function EngagementRail() {
  const showRail = useShowEngagementRail()
  if (!showRail) return null

  return (
    <aside
      className="fixed left-0 flex flex-col z-30 glass-sidebar border-r border-[--border-subtle] overflow-hidden"
      style={{ top: 56, bottom: 0, width: ENGAGEMENT_RAIL_WIDTH }}
    >
      <Link
        href="/"
        className="flex-shrink-0 flex items-center gap-1.5 h-7 px-2.5 mx-2 mt-2 mb-2 rounded-md text-[11.5px] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors no-underline"
      >
        <ArrowLeft size={12} strokeWidth={2} /> Dashboard
      </Link>
      <EngagementFolderNav />
    </aside>
  )
}
