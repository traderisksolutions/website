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
      className="fixed inset-y-0 left-0 flex flex-col z-40 sidebar-glass"
      style={{
        width:      'var(--sidebar-width)',
        background: 'var(--sidebar-bg)',
        borderRight:'1px solid var(--sidebar-border)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 h-14 shrink-0"
           style={{ borderBottom: '1px solid var(--sidebar-border)' }}>
        <span className="text-white font-bold text-lg tracking-tight leading-none">TRS</span>
        <span className="text-xs font-medium px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.55)' }}>
          Dashboard
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        {SIDEBAR_NAV.map((section: NavSection, si: number) => (
          <div key={section.id} className={si > 0 ? 'mt-1' : ''}>
            {/* Section separator */}
            <div className="flex items-center gap-2 px-3 pt-4 pb-1.5">
              <span className="text-[10px] font-semibold tracking-widest uppercase"
                    style={{ color: 'var(--sidebar-label)' }}>
                {section.label}
              </span>
              <div className="flex-1 h-px" style={{ background: 'var(--sidebar-border)' }} />
            </div>

            {/* Items */}
            {section.items.map((item: NavItem) => {
              const active   = isActive(item.href)
              const hasKids  = !!item.children?.length
              const open     = !!expanded[item.id]
              const Icon     = item.icon

              return (
                <div key={item.id}>
                  {/* Row */}
                  <div
                    className="flex items-center justify-between rounded-lg px-3 py-2 cursor-pointer select-none group"
                    style={{
                      background: active ? 'var(--sidebar-item-active)' : 'transparent',
                      color:      active ? 'var(--sidebar-text-active)' : 'var(--sidebar-text)',
                    }}
                    onClick={() => {
                      if (hasKids) toggle(item.id)
                    }}
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
                          color: 'var(--sidebar-label)',
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
                                color:      childActive ? 'var(--sidebar-text-active)' : 'var(--sidebar-text)',
                                background: childActive ? 'var(--sidebar-item-active)' : 'transparent',
                                textDecoration: 'none',
                              }}
                            >
                              <span className="w-1 h-1 rounded-full shrink-0"
                                    style={{ background: childActive ? '#fff' : 'var(--sidebar-label)' }} />
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
      <div className="px-4 py-3 shrink-0"
           style={{ borderTop: '1px solid var(--sidebar-border)' }}>
        <p className="text-[11px]" style={{ color: 'var(--sidebar-label)' }}>
          Trade Risk Solutions
        </p>
      </div>
    </aside>
  )
}
