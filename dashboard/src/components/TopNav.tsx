'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronDown, Menu, X } from 'lucide-react'
import type { NavTrigger, NavLink } from '@/lib/nav-config'

interface TopNavProps {
  items: NavTrigger[]
  title?: string
}

export default function TopNav({ items, title }: TopNavProps) {
  const pathname = usePathname()
  const router   = useRouter()
  const [open, setOpen]         = useState<number | null>(null)
  const [mobileOpen, setMobile] = useState(false)
  const triggerRefs = useRef<(HTMLButtonElement | null)[]>([])
  const panelRef    = useRef<HTMLDivElement>(null)
  const leaveTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* Close on outside click */
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(null)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  /* Close on route change */
  useEffect(() => { setOpen(null); setMobile(false) }, [pathname])

  const openPanel  = useCallback((i: number) => { if (leaveTimer.current) clearTimeout(leaveTimer.current); setOpen(i) }, [])
  const closePanel = useCallback(() => {
    leaveTimer.current = setTimeout(() => setOpen(null), 120)
  }, [])

  /* Keyboard navigation */
  function onTriggerKey(e: React.KeyboardEvent, idx: number) {
    const hasPanel = !!items[idx].groups?.length
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault()
        triggerRefs.current[(idx + 1) % items.length]?.focus()
        break
      case 'ArrowLeft':
        e.preventDefault()
        triggerRefs.current[(idx - 1 + items.length) % items.length]?.focus()
        break
      case 'ArrowDown':
        e.preventDefault()
        if (hasPanel) {
          setOpen(idx)
          const first = panelRef.current?.querySelector<HTMLAnchorElement>('a')
          setTimeout(() => first?.focus(), 50)
        }
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (hasPanel) setOpen(prev => prev === idx ? null : idx)
        else if (items[idx].href) router.push(items[idx].href!)
        break
      case 'Escape':
        setOpen(null)
        triggerRefs.current[idx]?.focus()
        break
    }
  }

  function onPanelKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(null)
      if (open !== null) triggerRefs.current[open]?.focus()
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const links = Array.from(panelRef.current?.querySelectorAll<HTMLAnchorElement>('a') ?? [])
      const idx   = links.indexOf(document.activeElement as HTMLAnchorElement)
      const next  = e.key === 'ArrowDown' ? idx + 1 : idx - 1
      links[Math.max(0, Math.min(next, links.length - 1))]?.focus()
    }
  }

  function isActive(item: NavTrigger) {
    if (item.href && pathname === item.href) return true
    return item.groups?.some(g => g.items.some(l => pathname === l.href)) ?? false
  }

  return (
    <>
      {/* Bar */}
      <header
        className="sticky top-0 z-30 flex items-center px-6 gap-6 topnav-glass"
        style={{
          height:       'var(--topnav-height)',
          background:   'var(--topnav-bg)',
          borderBottom: '1px solid var(--topnav-border)',
        }}
        ref={panelRef}
      >
        {/* Page title */}
        {title && (
          <span className="text-sm font-semibold text-gray-800 mr-2 shrink-0">{title}</span>
        )}

        {/* Desktop links */}
        <nav className="hidden md:flex items-center gap-1 flex-1" aria-label="Page navigation">
          {items.map((item, idx) => {
            const active   = isActive(item)
            const hasPanel = !!item.groups?.length

            return (
              <div
                key={idx}
                className="relative"
                onMouseEnter={() => hasPanel && openPanel(idx)}
                onMouseLeave={() => hasPanel && closePanel()}
              >
                <button
                  ref={el => { triggerRefs.current[idx] = el }}
                  className={`
                    relative flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium
                    transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1
                    focus-visible:ring-gray-900
                    ${active
                      ? 'text-gray-900 topnav-trigger-active'
                      : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'}
                  `}
                  onClick={() => {
                    if (hasPanel) setOpen(prev => prev === idx ? null : idx)
                    else if (item.href) router.push(item.href)
                  }}
                  onKeyDown={e => onTriggerKey(e, idx)}
                  aria-haspopup={hasPanel ? 'true' : undefined}
                  aria-expanded={open === idx ? 'true' : 'false'}
                >
                  {item.label}
                  {hasPanel && (
                    <ChevronDown
                      size={13}
                      strokeWidth={2.5}
                      className="transition-transform duration-150"
                      style={{ transform: open === idx ? 'rotate(180deg)' : 'rotate(0)' }}
                    />
                  )}
                </button>

                {/* Dropdown panel */}
                {hasPanel && open === idx && (
                  <div
                    className="dd-panel absolute top-full left-0 mt-2 z-50 min-w-[220px]"
                    style={{
                      background:   'var(--topnav-dropdown-bg)',
                      borderRadius: 'var(--topnav-dropdown-radius)',
                      boxShadow:    'var(--topnav-dropdown-shadow)',
                      border:       '1px solid rgba(255,255,255,0.75)',
                    }}
                    onKeyDown={onPanelKey}
                    onMouseEnter={() => leaveTimer.current && clearTimeout(leaveTimer.current)}
                    onMouseLeave={closePanel}
                  >
                    {item.groups!.map((group, gi) => (
                      <div key={gi} className={gi > 0 ? 'border-t border-gray-100' : ''}>
                        {group.label && (
                          <p className="px-4 pt-3 pb-1 text-[10.5px] font-semibold tracking-widest uppercase text-gray-400">
                            {group.label}
                          </p>
                        )}
                        <div className="p-2">
                          {group.items.map((link: NavLink) => {
                            const Icon      = link.icon
                            const linkActive = pathname === link.href
                            return (
                              <Link
                                key={link.href}
                                href={link.href}
                                className={`
                                  flex items-start gap-3 px-3 py-2.5 rounded-lg
                                  transition-colors focus:outline-none focus-visible:ring-2
                                  focus-visible:ring-gray-900
                                  ${linkActive
                                    ? 'bg-gray-100 text-gray-900'
                                    : 'hover:bg-gray-50 text-gray-700 hover:text-gray-900'}
                                `}
                              >
                                {Icon && (
                                  <span className="mt-0.5 p-1.5 rounded-md bg-gray-100 shrink-0">
                                    <Icon size={14} strokeWidth={2} />
                                  </span>
                                )}
                                <span>
                                  <span className="flex items-center gap-2 text-sm font-medium leading-tight">
                                    {link.label}
                                    {link.badge && (
                                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-900 text-white">
                                        {link.badge}
                                      </span>
                                    )}
                                  </span>
                                  {link.description && (
                                    <span className="text-xs text-gray-400 leading-tight mt-0.5 block">
                                      {link.description}
                                    </span>
                                  )}
                                </span>
                              </Link>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Mobile hamburger */}
        <button
          className="md:hidden ml-auto p-2 rounded-md text-gray-500 hover:bg-gray-100"
          onClick={() => setMobile(v => !v)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 top-[var(--topnav-height)] z-20 bg-white border-t border-gray-100 overflow-y-auto">
          {items.map((item, idx) => (
            <div key={idx}>
              {item.href ? (
                <Link
                  href={item.href}
                  className="block px-6 py-3 text-sm font-medium text-gray-700 border-b border-gray-50"
                >
                  {item.label}
                </Link>
              ) : (
                <div className="px-6 pt-4 pb-2 text-[10.5px] font-semibold tracking-widest uppercase text-gray-400">
                  {item.label}
                </div>
              )}
              {item.groups?.flatMap(g => g.items).map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center gap-3 px-8 py-2.5 text-sm text-gray-600 border-b border-gray-50 hover:bg-gray-50"
                >
                  {link.icon && <link.icon size={14} />}
                  {link.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
