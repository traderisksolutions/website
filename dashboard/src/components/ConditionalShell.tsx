'use client'

import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'
import MobileTopNav from './MobileTopNav'

export default function ConditionalShell({ children }: { children: React.ReactNode }) {
  const pathname   = usePathname()
  const isAuthPage = pathname === '/login' || pathname.startsWith('/auth/')

  if (isAuthPage) return <>{children}</>

  return (
    <>
      <Sidebar />
      <MobileTopNav />
      <div
        className="main-content min-h-screen flex flex-col"
        style={{ background: 'hsl(var(--background))' }}
      >
        {children}
      </div>
    </>
  )
}
