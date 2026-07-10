'use client'

import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'
import MobileTopNav from './MobileTopNav'
import { ChatDockProvider } from '@/providers/chat-dock-provider'
import { FloatingChatDock } from '@/components/chat/floating-chat-dock'

export default function ConditionalShell({ children }: { children: React.ReactNode }) {
  const pathname   = usePathname()
  const isAuthPage = pathname === '/login' || pathname.startsWith('/auth/')

  if (isAuthPage) return <>{children}</>

  // Ask Opus is a per-case Nexus assistant — mount it ONLY on Nexus (not dashboard
  // wide). The dock itself hides until a specific case is open.
  const onNexus = pathname.startsWith('/nexus')

  return (
    <>
      <Sidebar />
      <MobileTopNav />
      <div
        className="main-content min-h-[calc(100vh/var(--ui-zoom))] flex flex-col"
        style={{ background: 'hsl(var(--background))' }}
      >
        {children}
      </div>
      {onNexus && (
        <ChatDockProvider>
          <FloatingChatDock />
        </ChatDockProvider>
      )}
    </>
  )
}
