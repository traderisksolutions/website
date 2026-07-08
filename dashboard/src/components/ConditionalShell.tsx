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

  // The provider + dock live here (not in a page) so they stay mounted across
  // route changes — only `children` swap on navigation.
  return (
    <ChatDockProvider>
      <Sidebar />
      <MobileTopNav />
      <div
        className="main-content min-h-[calc(100vh/var(--ui-zoom))] flex flex-col"
        style={{ background: 'hsl(var(--background))' }}
      >
        {children}
      </div>
      <FloatingChatDock />
    </ChatDockProvider>
  )
}
