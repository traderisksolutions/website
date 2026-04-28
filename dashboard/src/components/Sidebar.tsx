'use client'

import type { ElementType } from 'react'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Inbox, Users, BarChart2, FileText,
  Settings, Search, ChevronRight,
} from 'lucide-react'

async function fetchNewCount(): Promise<number> {
  try {
    const res = await fetch('/api/leads', { cache: 'no-store' })
    if (!res.ok) return 0
    const data: { status: string }[] = await res.json()
    return data.filter(l => l.status === 'new').length
  } catch { return 0 }
}

type NavItem = {
  label:    string
  href:     string
  icon:     ElementType
  disabled?: boolean
  badge?:   'newCount'         // slot to inject live count
  chevron?: boolean
}

type NavSection = { items: NavItem[] }

const NAV: NavSection[] = [
  {
    items: [
      { label: 'Inbound Leads', href: '/inbound',   icon: Inbox,     badge: 'newCount' },
    ],
  },
  {
    items: [
      { label: 'Contacts',      href: '/contacts',  icon: Users,     disabled: true },
      { label: 'Analytics',     href: '/analytics', icon: BarChart2, disabled: true },
      { label: 'Documents',     href: '/documents', icon: FileText,  disabled: true },
    ],
  },
  {
    items: [
      { label: 'Settings',      href: '/settings',  icon: Settings,  disabled: true, chevron: true },
    ],
  },
]

export default function Sidebar() {
  const pathname  = usePathname()
  const [newCount, setNewCount] = useState(0)

  useEffect(() => {
    fetchNewCount().then(setNewCount)
    const t = setInterval(() => fetchNewCount().then(setNewCount), 30_000)
    return () => clearInterval(t)
  }, [])

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <aside style={{
      position:      'fixed',
      inset:         '0 auto 0 0',
      width:         'var(--sidebar-width)',
      display:       'flex',
      flexDirection: 'column',
      background:    '#fff',
      borderRight:   '1px solid #e5e5e5',
      zIndex:        40,
      overflowY:     'auto',
    }}>

      {/* ── Account header ─────────────────────────────── */}
      <div style={{
        display:      'flex',
        alignItems:   'center',
        gap:          10,
        padding:      '0 12px',
        height:       52,
        borderBottom: '1px solid #e5e5e5',
        flexShrink:   0,
      }}>
        <span style={{
          width: 26, height: 26, borderRadius: '50%',
          background: '#000',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>TRS</span>
        </span>

        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#111', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
            Trade Risk Solutions
          </p>
        </div>

        <span style={{
          fontSize: 11, fontWeight: 500,
          padding: '2px 7px', borderRadius: 5,
          background: '#f4f4f5', color: '#555',
          border: '1px solid #e5e5e5',
          flexShrink: 0,
        }}>
          Internal
        </span>
      </div>

      {/* ── Search bar ─────────────────────────────────── */}
      <div style={{ padding: '10px 10px 4px', flexShrink: 0 }}>
        <div style={{
          display:      'flex',
          alignItems:   'center',
          gap:          6,
          background:   '#f4f4f5',
          borderRadius: 7,
          padding:      '0 10px',
          height:       34,
          border:       '1px solid transparent',
        }}>
          <Search size={13} style={{ color: '#999', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: '#999', flex: 1 }}>Find...</span>
          <kbd style={{
            fontSize: 11, color: '#aaa',
            background: '#e8e8e8', borderRadius: 4,
            padding: '1px 5px', fontFamily: 'inherit',
          }}>F</kbd>
        </div>
      </div>

      {/* ── Nav ────────────────────────────────────────── */}
      <nav style={{ flex: 1, padding: '4px 8px 8px' }}>
        {NAV.map((section, si) => (
          <div key={si}>
            {/* Section divider (skip first) */}
            {si > 0 && (
              <div style={{
                height: 1, background: '#e5e5e5',
                margin: '6px 4px',
              }} />
            )}

            {section.items.map(item => {
              const active   = isActive(item.href)
              const Icon     = item.icon
              const count    = item.badge === 'newCount' ? newCount : 0
              const showBadge = count > 0

              const row = (
                <span
                  className={item.disabled ? '' : 'sb-row'}
                  style={{
                    display:       'flex',
                    alignItems:    'center',
                    gap:           9,
                    padding:       '0 10px',
                    height:        36,
                    borderRadius:  6,
                    background:    active ? '#f0f0f0' : 'transparent',
                    color:         item.disabled ? '#bbb' : active ? '#111' : '#444',
                    cursor:        item.disabled ? 'default' : 'pointer',
                    textDecoration: 'none',
                    width:         '100%',
                    transition:    'background 0.1s, color 0.1s',
                  }}
                >
                  <Icon
                    size={15}
                    strokeWidth={active ? 2.2 : 1.8}
                    style={{ flexShrink: 0, color: item.disabled ? '#ccc' : active ? '#111' : '#666' }}
                  />

                  <span style={{
                    fontSize:     13,
                    fontWeight:   active ? 500 : 400,
                    flex:         1,
                    letterSpacing: '-0.01em',
                    lineHeight:   1,
                  }}>
                    {item.label}
                  </span>

                  {/* New-lead notification bubble */}
                  {showBadge && (
                    <span style={{
                      minWidth:     18,
                      height:       18,
                      borderRadius: 9,
                      background:   '#111',
                      color:        '#fff',
                      fontSize:     11,
                      fontWeight:   600,
                      display:      'flex',
                      alignItems:   'center',
                      justifyContent: 'center',
                      padding:      '0 5px',
                      letterSpacing: 0,
                      flexShrink:   0,
                    }}>
                      {count > 99 ? '99+' : count}
                    </span>
                  )}

                  {item.chevron && !item.disabled && (
                    <ChevronRight size={13} strokeWidth={2} style={{ color: '#aaa', flexShrink: 0 }} />
                  )}
                </span>
              )

              return item.disabled ? (
                <div key={item.href}>{row}</div>
              ) : (
                <Link key={item.href} href={item.href} style={{ display: 'block', textDecoration: 'none' }}>
                  {row}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* ── Footer ─────────────────────────────────────── */}
      <div style={{
        padding:   '10px 16px',
        borderTop: '1px solid #e5e5e5',
        flexShrink: 0,
      }}>
        <p style={{ margin: 0, fontSize: 11, color: '#aaa', letterSpacing: '-0.01em' }}>
          © 2025 Trade Risk Solutions
        </p>
      </div>
    </aside>
  )
}
