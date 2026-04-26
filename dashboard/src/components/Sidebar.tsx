'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { SIDEBAR_NAV } from '@/lib/nav-config'
import type { NavItem, NavSection } from '@/lib/nav-config'

export default function Sidebar() {
  const pathname = usePathname()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ inbound: true })

  function toggle(id: string) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <aside
      className="fixed inset-y-0 left-0 flex flex-col z-40"
      style={{
        width:          'var(--sidebar-width)',
        background:     'rgba(255,255,255,0.72)',
        backdropFilter: 'blur(28px) saturate(200%)',
        WebkitBackdropFilter: 'blur(28px) saturate(200%)',
        borderRight:    '1px solid rgba(200,200,204,0.45)',
        boxShadow:      '2px 0 24px rgba(0,0,0,0.06), inset -1px 0 0 rgba(255,255,255,0.8)',
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-2.5 px-5 h-14 shrink-0"
        style={{ borderBottom: '1px solid rgba(200,200,204,0.35)' }}
      >
        <span className="font-bold text-lg tracking-tight leading-none" style={{ color: '#18181b', fontFamily: 'var(--font-heading)' }}>TRS</span>
        <span
          className="text-xs font-medium px-1.5 py-0.5 rounded"
          style={{ background: 'rgba(0,0,0,0.07)', color: '#555' }}
        >
          Dashboard
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        {SIDEBAR_NAV.map((section: NavSection, si: number) => (
          <div key={section.id} className={si > 0 ? 'mt-1' : ''}>
            {/* Section label */}
            <div className="flex items-center gap-2 px-3 pt-3 pb-1.5">
              <span
                className="text-[10px] font-semibold tracking-widest uppercase"
                style={{ color: 'rgba(0,0,0,0.35)' }}
              >
                {section.label}
              </span>
              <div className="flex-1 h-px" style={{ background: 'rgba(0,0,0,0.08)' }} />
            </div>

            {/* Items */}
            {section.items.map((item: NavItem) => {
              const active  = isActive(item.href)
              const hasKids = !!item.children?.length
              const open    = !!expanded[item.id]
              const Icon    = item.icon

              return (
                <div key={item.id}>
                  <div
                    className="flex items-center justify-between rounded-lg px-3 py-2 cursor-pointer select-none"
                    style={{
                      background: active ? 'rgba(0,0,0,0.06)' : 'transparent',
                      color:      active ? '#111' : '#444',
                    }}
                    onClick={() => { if (hasKids) toggle(item.id) }}
                  >
                    <Link
                      href={item.href}
                      className="flex items-center gap-2.5 flex-1 min-w-0"
                      onClick={e => hasKids && e.preventDefault()}
                      style={{ color: 'inherit', textDecoration: 'none' }}
                    >
                      <Icon size={15} strokeWidth={active ? 2.2 : 1.8} className="shrink-0" />
                      <span className="text-[13px] font-medium truncate">{item.label}</span>
                    </Link>

                    {hasKids && (
                      <ChevronDown
                        size={13}
                        strokeWidth={2}
                        className="shrink-0 transition-transform duration-200"
                        style={{
                          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                          color: 'rgba(0,0,0,0.3)',
                        }}
                      />
                    )}
                  </div>

                  {/* Sub-items */}
                  {hasKids && (
                    <div className={`sidebar-sub ${open ? 'open' : ''}`}>
                      <div className="pl-4 pb-1">
                        {item.children!.map(child => {
                          const childActive = pathname === child.href
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              className="flex items-center gap-2 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors"
                              style={{
                                color:          childActive ? '#111' : '#666',
                                background:     childActive ? 'rgba(0,0,0,0.06)' : 'transparent',
                                textDecoration: 'none',
                              }}
                            >
                              <span
                                className="w-1 h-1 rounded-full shrink-0"
                                style={{ background: childActive ? '#111' : 'rgba(0,0,0,0.25)' }}
                              />
                              {child.label}
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div
        className="px-4 py-3 shrink-0"
        style={{ borderTop: '1px solid rgba(200,200,204,0.35)' }}
      >
        <p className="text-[11px]" style={{ color: 'rgba(0,0,0,0.35)' }}>
          Trade Risk Solutions
        </p>
      </div>
    </aside>
  )
}
