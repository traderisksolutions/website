'use client'

import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'

// Renders the sidebar + content margin only on authenticated pages.
// Login page gets a clean full-screen layout.
export default function ConditionalShell({ children }: { children: React.ReactNode }) {
  const pathname  = usePathname()
  const isAuthPage = pathname === '/login' || pathname.startsWith('/auth/')

  if (isAuthPage) return <>{children}</>

  return (
    <>
      <Sidebar />
      <div
        className="min-h-screen flex flex-col"
        style={{ marginLeft: 'var(--sidebar-width)', background: 'hsl(var(--background))' }}
      >
        {children}
      </div>
    </>
  )
}
