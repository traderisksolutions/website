'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  BookOpen, Mail, MessageCircle, Users,
  Bot, Table2, Settings, LogOut,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const NAV = [
  { label: 'Overview',   href: '/documentation',   icon: BookOpen },
  { label: 'Email',      href: '/inbound/email',    icon: Mail },
  { label: 'WhatsApp',   href: '/inbound/whatsapp', icon: MessageCircle },
  { label: 'Contacts',   href: '/contacts',         icon: Users },
  { label: 'Engagement', href: '/engagement',       icon: Bot },
  { label: 'Leads',      href: '/outbound/leads',   icon: Table2 },
  { label: 'Settings',   href: '/settings',         icon: Settings },
]

export default function MobileTopNav() {
  const pathname = usePathname()
  const router   = useRouter()

  function active(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  async function signOut() {
    await createClient().auth.signOut()
    router.push('/login')
  }

  return (
    <header
      className="lg:hidden"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      {/* Brand row */}
      <div
        className="glass-sidebar"
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', height: 48, borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div style={{
          width: 28, height: 28, borderRadius: 7, flexShrink: 0,
          background: 'hsl(var(--sidebar-ring))', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 0 2px var(--primary-focus-ring)',
        }}>
          <span style={{ fontSize: 9, fontWeight: 900, color: '#fff', letterSpacing: '-0.03em' }}>TRS</span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'hsl(var(--sidebar-primary))', letterSpacing: '-0.01em', flex: 1 }}>
          Trade Risk Solutions
        </span>
        <button
          onClick={signOut}
          title="Sign out"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'hsl(var(--sidebar-fg))', display: 'flex', alignItems: 'center', borderRadius: 6 }}
        >
          <LogOut size={15} strokeWidth={1.8} />
        </button>
      </div>

      {/* Nav row — horizontally scrollable */}
      <nav
        className="glass-sidebar"
        style={{
          display: 'flex', overflowX: 'auto', padding: '4px 8px 6px', gap: 2,
          scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
        } as React.CSSProperties}
      >
        {NAV.map(({ label, href, icon: Icon }) => {
          const isActive = active(href)
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 3, padding: '5px 11px', borderRadius: 8, textDecoration: 'none', flexShrink: 0,
                background: isActive ? 'hsl(var(--sidebar-accent))' : 'transparent',
                color: isActive ? 'hsl(var(--sidebar-ring))' : 'hsl(var(--sidebar-fg))',
                borderBottom: isActive ? '2px solid hsl(var(--sidebar-ring))' : '2px solid transparent',
              }}
            >
              <Icon size={15} strokeWidth={isActive ? 2.2 : 1.8} />
              <span style={{ fontSize: 10, fontWeight: isActive ? 600 : 400, whiteSpace: 'nowrap' }}>
                {label}
              </span>
            </Link>
          )
        })}
      </nav>
    </header>
  )
}
