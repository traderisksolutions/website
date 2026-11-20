'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Menu, LogOut, Search } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { PLACES, ACCOUNT_LINKS, HOME_LINKS, locate, pathMatches } from './nav-sections'
import { Spotlight } from './Spotlight'

/** Every page by name for ⌘K: Today and Calendar (the logo's), each place's tabs, the avatar's. */
const JUMP_PAGES = [
  ...HOME_LINKS,
  ...PLACES.flatMap(p => p.tabs.map(t => ({ label: t.title === p.label ? p.label : `${p.label} · ${t.title}`, href: t.href }))),
  ...ACCOUNT_LINKS.map(l => ({ label: l.title, href: l.href })),
]

/**
 * The top bar: the TRS 保风 wordmark (opens Today), the flat places (no drop-downs), ⌘K to go to
 * any page or find any email (Spotlight), the avatar menu. Below 980px the places fold into a menu button. The current place's own pages
 * show as a tab row under the bar (PlaceTabs, rendered by the shell).
 */
export function TopNavbar() {
  const pathname = usePathname()
  const router = useRouter()
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [jumpOpen, setJumpOpen] = useState(false)
  const { place: current } = locate(pathname)

  useEffect(() => { createClient().auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null)) }, [])
  useEffect(() => { setMobileOpen(false); setJumpOpen(false) }, [pathname])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setJumpOpen(v => !v) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  async function signOut() { await createClient().auth.signOut(); router.push('/login') }

  return (
    <header className="w-full h-[54px] flex-shrink-0 bg-white">
      <div className="flex h-full items-center gap-1 px-4 md:px-6 min-w-0">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <button type="button" className="min-[980px]:hidden -ml-1 mr-1 inline-flex items-center justify-center w-9 h-9 rounded-[8px] bg-transparent border-0 cursor-pointer text-trs-ink hover:bg-trs-canvas" aria-label="Open navigation">
              <Menu className="h-5 w-5" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0 flex flex-col">
            <SheetHeader className="border-b border-trs-line pb-3"><SheetTitle>Trade Risk Solutions</SheetTitle></SheetHeader>
            <nav className="flex-1 overflow-y-auto px-2 py-2" aria-label="Primary">
              {PLACES.map(place => {
                const Icon = place.icon
                const on = current?.label === place.label
                return (
                  <div key={place.label} className="py-0.5">
                    <Link href={place.href} aria-current={on ? 'page' : undefined}
                      className={cn('flex items-center gap-2.5 h-9 px-2.5 rounded-[8px] text-[14px] font-medium no-underline', on ? 'bg-trs-select-bg text-trs-select-fg' : 'text-trs-ink-2 hover:bg-trs-canvas')}>
                      <Icon className="h-4 w-4" />{place.label}
                    </Link>
                    {on && place.tabs.length > 1 && (
                      <div className="pl-7 py-0.5">
                        {place.tabs.map(t => (
                          <Link key={t.href} href={t.href} aria-current={pathMatches(pathname, t.href) ? 'page' : undefined}
                            className={cn('flex items-center h-[30px] px-2.5 rounded-[7px] text-[13px] no-underline', pathMatches(pathname, t.href) ? 'text-trs-ink font-medium bg-trs-field' : 'text-trs-muted hover:bg-trs-canvas')}>
                            {t.title}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
              <div className="mt-2 pt-2 border-t border-trs-line">
                {ACCOUNT_LINKS.map(l => (
                  <Link key={l.href} href={l.href} className="flex items-center gap-2.5 h-9 px-2.5 rounded-[8px] text-[13.5px] no-underline text-trs-muted hover:bg-trs-canvas">
                    <l.icon className="h-4 w-4" />{l.title}
                  </Link>
                ))}
              </div>
            </nav>
            <div className="flex items-center gap-2.5 px-4 py-3 border-t border-trs-line flex-shrink-0">
              <span className="w-7 h-7 rounded-full bg-trs-green text-white flex items-center justify-center text-[11px] font-bold flex-shrink-0">{userEmail ? userEmail[0].toUpperCase() : '?'}</span>
              <span className="text-[12px] flex-1 truncate text-trs-muted">{userEmail ?? '—'}</span>
              <button type="button" onClick={signOut} title="Sign out" aria-label="Sign out" className="inline-flex items-center justify-center w-[30px] h-[30px] rounded-[7px] border-0 bg-transparent cursor-pointer text-trs-muted hover:bg-trs-canvas hover:text-trs-ink"><LogOut size={14} /></button>
            </div>
          </SheetContent>
        </Sheet>

        <Link href="/today" className="flex items-baseline gap-2 flex-shrink-0 no-underline hover:opacity-80 transition-opacity mr-3" aria-label="Today" title="Today">
          <span className="trs-mark-t">TRS</span><span className="trs-mark-c" lang="zh-Hans">保风</span>
        </Link>

        <nav className="hidden min-[980px]:flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto [scrollbar-width:none]" aria-label="Primary">
          {PLACES.map(place => (
            <Link key={place.label} href={place.href} aria-current={current?.label === place.label ? 'page' : undefined} className="trs-place">
              {place.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 flex-shrink-0 pl-2">
          <button type="button" onClick={() => setJumpOpen(true)} aria-label="Go to a page or find an email"
            className="inline-flex items-center gap-2 h-[30px] px-2.5 rounded-[7px] border border-trs-line-2 bg-white cursor-pointer text-[13px] text-trs-muted hover:border-trs-ink-2">
            <Search className="h-3.5 w-3.5" />
            <span className="hidden min-[1180px]:inline">Go to</span>
            <kbd className="hidden min-[1180px]:inline font-mono text-[11px] text-trs-subtle">⌘K</kbd>
          </button>
          <AccountMenu email={userEmail} pathname={pathname} onSignOut={signOut} />
        </div>
      </div>
      <Spotlight open={jumpOpen} onOpenChange={setJumpOpen} pages={JUMP_PAGES} />
    </header>
  )
}

/**
 * The bar and the current place's tabs as one sticky block, one line under it. Its height is
 * measured into --top-nav-h, which the fixed mail navigator and every page's minimum height read,
 * so nothing is ever offset for a tab row that is not there.
 */
export function TopBar() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const set = () => document.documentElement.style.setProperty('--top-nav-h', `${el.getBoundingClientRect().height}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => { ro.disconnect(); document.documentElement.style.removeProperty('--top-nav-h') }
  }, [])
  return (
    <div ref={ref} className="sticky top-0 z-50 w-full bg-white border-b border-trs-line">
      <TopNavbar />
      <PlaceTabs />
    </div>
  )
}

/** The current place's pages, under the bar. Nothing when the place has one page. */
export function PlaceTabs() {
  const pathname = usePathname()
  const { place, tab } = locate(pathname)
  if (!place || place.tabs.length < 2) return null
  return (
    <nav aria-label={place.label} className="trs-place-tabs hidden min-[980px]:flex items-center gap-0.5 px-4 md:px-6 h-10 bg-white overflow-x-auto [scrollbar-width:none]">
      {place.tabs.map(t => (
        <Link key={t.href} href={t.href} aria-current={tab?.href === t.href ? 'page' : undefined} className="trs-subtab">{t.title}</Link>
      ))}
    </nav>
  )
}

/** Avatar menu: settings and admin views, then sign out. */
function AccountMenu({ email, pathname, onSignOut }: { email: string | null; pathname: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const onAccountPage = ACCOUNT_LINKS.some(l => pathMatches(pathname, l.href))
  useEffect(() => { setOpen(false) }, [pathname])
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(v => !v)} aria-label="Account menu" aria-expanded={open}
        className={cn('flex items-center gap-2 rounded-full p-0.5 md:pr-2 border-0 cursor-pointer transition-colors hover:bg-trs-canvas', onAccountPage ? 'bg-trs-select-bg' : 'bg-transparent')}>
        <span className="w-[30px] h-[30px] rounded-full inline-flex items-center justify-center text-[12px] font-bold text-white bg-trs-green">{email ? email[0].toUpperCase() : '?'}</span>
        <span className="hidden md:block text-[13px] max-w-[160px] truncate text-trs-muted">{email ?? '—'}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] w-56 rounded-[12px] bg-white p-1.5 border border-trs-line shadow-[0_12px_40px_rgba(0,0,0,0.10)]" role="menu">
          <div className="px-3 py-2 text-[12.5px] truncate text-trs-muted">{email ?? 'Account'}</div>
          {ACCOUNT_LINKS.map(l => {
            const on = pathMatches(pathname, l.href)
            return (
              <Link key={l.href} href={l.href} role="menuitem" aria-current={on ? 'page' : undefined}
                className={cn('w-full flex items-center gap-2 h-9 px-3 rounded-[8px] text-[13.5px] no-underline text-trs-ink hover:bg-trs-canvas', on && 'bg-trs-select-bg')}>
                <l.icon className="h-4 w-4 text-trs-muted" /> {l.title}
              </Link>
            )
          })}
          <div className="my-1 mx-2 border-t border-trs-line" />
          <button type="button" role="menuitem" onClick={onSignOut} className="w-full flex items-center gap-2 h-9 px-3 rounded-[8px] text-[13.5px] bg-transparent border-0 cursor-pointer text-left text-trs-ink hover:bg-trs-canvas">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}
