'use client'

import { usePathname } from 'next/navigation'
import { TopNavbar } from '@/components/nav/top-navbar'
import { EngagementRail, ENGAGEMENT_RAIL_WIDTH, useShowEngagementRail } from '@/components/nav/engagement-rail'
import { ChatDockProvider } from '@/providers/chat-dock-provider'
import { FloatingChatDock } from '@/components/chat/floating-chat-dock'
import { EngagementNavProvider } from '@/providers/engagement-nav-provider'

function MainContent({ children }: { children: React.ReactNode }) {
  // /engagement renders its conversation list as a fixed left rail (see EngagementRail) instead
  // of a nav dropdown — push content right so it doesn't sit underneath that rail.
  const showEngagementRail = useShowEngagementRail()
  return (
    <div
      className="main-content min-h-[calc(100vh/var(--ui-zoom))] flex flex-col"
      style={{ background: 'hsl(var(--background))', marginLeft: showEngagementRail ? ENGAGEMENT_RAIL_WIDTH : 0 }}
    >
      {children}
    </div>
  )
}

export default function ConditionalShell({ children }: { children: React.ReactNode }) {
  const pathname   = usePathname()
  const isAuthPage = pathname === '/login' || pathname.startsWith('/auth/')

  if (isAuthPage) return <>{children}</>

  // Ask Opus is a per-case Nexus assistant — mount it ONLY on Nexus (not dashboard
  // wide). The dock itself hides until a specific case is open.
  const onNexus = pathname.startsWith('/nexus')

  return (
    // EngagementNavProvider wraps TopNavbar/EngagementRail + children (siblings, not
    // parent/child) so EngagementRail can render the Engagement folder-nav from state
    // /engagement/page.tsx pushes into it — mounted app-wide (cheap, no data fetching) rather
    // than gated by pathname so it never has to special-case "no provider mounted".
    <EngagementNavProvider>
      <TopNavbar />
      <EngagementRail />
      <MainContent>{children}</MainContent>
      {onNexus && (
        <ChatDockProvider>
          <FloatingChatDock />
        </ChatDockProvider>
      )}
    </EngagementNavProvider>
  )
}
