'use client'

import type { ElementType } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Inbox, Users, BarChart2, FileText, Settings } from 'lucide-react'

type NavItem = {
  label:    string
  href:     string
  icon:     ElementType
  disabled?: boolean
}

type NavSection = {
  label?: string
  items:  NavItem[]
}

const NAV: NavSection[] = [
  {
    items: [
      { label: 'Inbound Leads', href: '/inbound',   icon: Inbox },
      { label: 'Contacts',      href: '/contacts',  icon: Users,    disabled: true },
      { label: 'Analytics',     href: '/analytics', icon: BarChart2, disabled: true },
      { label: 'Documents',     href: '/documents', icon: FileText, disabled: true },
    ],
  },
  {
    label: 'Settings',
    items: [
      { label: 'Settings', href: '/settings', icon: Settings, disabled: true },
    ],
  },
]

export default function Sidebar() {
  const pathname = usePathname()

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <aside
      style={{
        position:    'fixed',
        inset:       '0 auto 0 0',
        width:       'var(--sidebar-width)',
        display:     'flex',
        flexDirection: 'column',
        background:  '#0a0a0a',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        zIndex:      40,
        overflowY:   'auto',
      }}
    >
      {/* Project header */}
      <div
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:          10,
          padding:      '0 16px',
          height:       56,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink:   0,
        }}
      >
        {/* Logo mark */}
        <span
          style={{
            width:        26,
            height:       26,
            borderRadius: 6,
            background:   '#fff',
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'center',
            flexShrink:   0,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: '#000', letterSpacing: '-0.03em' }}>
            TRS
          </span>
        </span>

        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#fff', lineHeight: 1.2, letterSpacing: '-0.01em' }}>
            Trade Risk Solutions
          </p>
          <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.3 }}>
            Internal Dashboard
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '8px 8px 0' }}>
        {NAV.map((section, si) => (
          <div key={si} style={{ marginBottom: 4 }}>
            {/* Section label */}
            {section.label && (
              <p
                style={{
                  margin:        '12px 0 4px',
                  padding:       '0 8px',
                  fontSize:      11,
                  fontWeight:    500,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color:         'rgba(255,255,255,0.25)',
                }}
              >
                {section.label}
              </p>
            )}

            {/* Items */}
            {section.items.map(item => {
              const active = isActive(item.href)
              const Icon   = item.icon

              const inner = (
                <span
                  style={{
                    display:       'flex',
                    alignItems:    'center',
                    gap:           8,
                    padding:       '0 8px',
                    height:        34,
                    borderRadius:  6,
                    background:    active ? 'rgba(255,255,255,0.08)' : 'transparent',
                    color:         item.disabled
                                     ? 'rgba(255,255,255,0.22)'
                                     : active
                                       ? '#fff'
                                       : 'rgba(255,255,255,0.55)',
                    cursor:        item.disabled ? 'default' : 'pointer',
                    transition:    'background 0.12s, color 0.12s',
                    textDecoration: 'none',
                    width:         '100%',
                  }}
                  className={item.disabled ? '' : 'sb-item'}
                >
                  <Icon
                    size={15}
                    strokeWidth={active ? 2.2 : 1.8}
                    style={{ flexShrink: 0, opacity: item.disabled ? 0.4 : 1 }}
                  />
                  <span style={{ fontSize: 13, fontWeight: active ? 500 : 400, letterSpacing: '-0.01em' }}>
                    {item.label}
                  </span>
                  {item.disabled && (
                    <span
                      style={{
                        marginLeft:   'auto',
                        fontSize:     10,
                        fontWeight:   500,
                        padding:      '1px 5px',
                        borderRadius: 4,
                        background:   'rgba(255,255,255,0.07)',
                        color:        'rgba(255,255,255,0.2)',
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                      }}
                    >
                      Soon
                    </span>
                  )}
                </span>
              )

              return item.disabled ? (
                <div key={item.href}>{inner}</div>
              ) : (
                <Link key={item.href} href={item.href} style={{ display: 'block', textDecoration: 'none' }}>
                  {inner}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div
        style={{
          padding:      '12px 16px',
          borderTop:    '1px solid rgba(255,255,255,0.06)',
          flexShrink:   0,
        }}
      >
        <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.2)', letterSpacing: '-0.01em' }}>
          © 2025 Trade Risk Solutions
        </p>
      </div>
    </aside>
  )
}
