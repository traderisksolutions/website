'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Menu, LogOut, ChevronDown, Search } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { NAV_SECTIONS, type NavLink, type NavGroup, type NavSection } from './nav-sections'

/**
 * The dashboard's top bar, in the marketing site's visual language: a 56px white bar with a
 * soft blur, Inter at 14/500 in muted ink that darkens on hover, the current section in a
 * quiet dark tint, and dropdowns as white rounded cards with a title and a one-line sub for
 * each entry. The sections and their contents are the dashboard's own (nav-sections.tsx);
 * only the look comes from the website.
 */

function active(pathname: string, href: string) {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(href + '/')
}
function sectionItems(section: NavSection): NavLink[] {
  if (section.items) return section.items
  if (section.groups) return section.groups.flatMap(g => g.items)
  return []
}
function sectionActive(pathname: string, section: NavSection) {
  if (section.href) return active(pathname, section.href)
  return sectionItems(section).some(i => active(pathname, i.href))
}

// Marketing-site tokens, inlined so this bar matches the website exactly and does not drift
// with the dashboard's own theme.
const INK = '#18181b'
const MUTED = '#4b4b4b'
const SUBTLE = '#9ca3af'

export function TopNavbar() {
  const pathname = usePathname()
  const router = useRouter()
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const barRef = useRef<HTMLElement>(null)

  useEffect(() => { createClient().auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null)) }, [])
  useEffect(() => { setMobileOpen(false); setOpen(null) }, [pathname])

  // Click outside or Escape closes any dropdown.
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (!barRef.current?.contains(e.target as Node)) setOpen(null) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null) }
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  async function signOut() { await createClient().auth.signOut(); router.push('/login') }

  return (
    <header
      ref={barRef}
      className="sticky top-0 z-50 w-full h-14 flex-shrink-0"
      style={{
        background: 'rgba(255,255,255,0.82)',
        backdropFilter: 'blur(18px) saturate(160%)',
        WebkitBackdropFilter: 'blur(18px) saturate(160%)',
        borderBottom: '1px solid rgba(200,200,204,0.45)',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div className="flex h-14 items-center gap-6 px-4 md:px-7">
        {/* Mobile drawer trigger */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <button className="xl:hidden -ml-1 inline-flex items-center justify-center w-9 h-9 rounded-md bg-transparent border-0 cursor-pointer" style={{ color: INK }} aria-label="Open navigation">
              <Menu className="h-5 w-5" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0 flex flex-col">
            <SheetHeader className="border-b border-[--border-subtle] pb-3"><SheetTitle>Trade Risk Solutions</SheetTitle></SheetHeader>
            <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
              {NAV_SECTIONS.map(section => <MobileSection key={section.label} section={section} pathname={pathname} />)}
            </nav>
            <div className="flex items-center gap-2.5 px-4 py-3 border-t border-[--border-subtle] flex-shrink-0">
              <span className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold flex-shrink-0">{userEmail ? userEmail[0].toUpperCase() : '?'}</span>
              <span className="text-[11.5px] flex-1 truncate text-muted-foreground">{userEmail ?? '—'}</span>
              <button onClick={signOut} title="Sign out" aria-label="Sign out" className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors flex-shrink-0"><LogOut size={14} /></button>
            </div>
          </SheetContent>
        </Sheet>

        {/* Wordmark, as on the website */}
        <Link href="/" className="flex items-center flex-shrink-0 no-underline hover:opacity-75 transition-opacity" aria-label="Home">
          <span className="text-[15px] font-bold tracking-[-0.02em] whitespace-nowrap" style={{ color: INK }}>Trade Risk Solutions</span>
        </Link>

        {/* Desktop links */}
        <nav className="hidden xl:flex items-center gap-0.5 flex-1 min-w-0" aria-label="Primary">
          {NAV_SECTIONS.filter(s => s.placement !== 'account').map(section => {
            const isActive = sectionActive(pathname, section)
            const items = sectionItems(section)
            if (!items.length) {
              if (section.disabled) return <span key={section.label} className="px-2.5 py-1.5 text-[14px] font-medium whitespace-nowrap" style={{ color: SUBTLE }}>{section.label}</span>
              return (
                <Link
                  key={section.label}
                  href={section.href!}
                  aria-current={isActive ? 'page' : undefined}
                  className="px-2.5 py-1.5 rounded-md text-[14px] font-medium no-underline whitespace-nowrap transition-colors"
                  style={{ color: isActive ? INK : MUTED, background: isActive ? 'rgba(12,51,138,0.08)' : 'transparent' }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#f4f4f5' }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                >
                  {section.label}
                </Link>
              )
            }
            const isOpen = open === section.label
            return (
              <div key={section.label} className="relative">
                <button
                  type="button"
                  onClick={() => setOpen(v => v === section.label ? null : section.label)}
                  aria-expanded={isOpen}
                  aria-haspopup="true"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[14px] font-medium bg-transparent border-0 cursor-pointer whitespace-nowrap transition-colors"
                  style={{ color: isActive || isOpen ? INK : MUTED, background: isActive ? 'rgba(12,51,138,0.08)' : isOpen ? 'rgba(0,0,0,0.06)' : 'transparent' }}
                >
                  {section.label}
                  <ChevronDown size={12} strokeWidth={2.5} className={cn('transition-transform', isOpen && 'rotate-180')} style={{ color: MUTED }} />
                </button>
                {isOpen && <Dropdown section={section} pathname={pathname} onNavigate={() => setOpen(null)} />}
              </div>
            )
          })}
        </nav>

        {/* Right: search + account */}
        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          <Link href="/companies" className="hidden md:inline-flex items-center gap-2 h-9 px-3 rounded-full text-[13px] no-underline transition-colors" style={{ color: MUTED, background: '#f4f4f5' }} title="Search companies">
            <Search size={14} /> <span className="hidden lg:inline">Search</span>
          </Link>
          <AccountMenu email={userEmail} pathname={pathname} onSignOut={signOut} />
        </div>
      </div>
    </header>
  )
}

/** A dropdown in the website's mega-menu style: white card, 14px rounded corners, soft shadow. */
function Dropdown({ section, pathname, onNavigate }: { section: NavSection; pathname: string; onNavigate: () => void }) {
  const groups: NavGroup[] = section.groups ?? [{ heading: '', items: section.items! }]
  const cols = Math.min(groups.length, 3)
  return (
    <div
      role="menu"
      className="absolute left-0 top-[calc(100%+10px)] z-50 rounded-[14px] bg-white p-2"
      style={{ minWidth: cols === 1 ? 300 : cols === 2 ? 540 : 760, border: '1px solid rgba(200,200,204,0.45)', boxShadow: '0 12px 40px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.05)' }}
    >
      <div className="grid gap-x-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {groups.map((g, i) => (
          <div key={g.heading || i} className={cn(i > 0 && 'pl-2', i < groups.length - 1 && 'pr-2')} style={i < groups.length - 1 ? { borderRight: '1px solid #f3f4f6' } : undefined}>
            {g.heading && <div className="px-3 pt-2 pb-1 text-[11px] font-medium" style={{ color: SUBTLE }}>{g.heading}</div>}
            {g.items.map(item => {
              const isActive = active(pathname, item.href)
              const Icon = item.icon
              if (item.disabled) {
                return (
                  <span key={item.href} className="flex flex-col gap-0.5 px-3 py-2.5 rounded-[10px] opacity-40">
                    <span className="text-[14px] font-semibold" style={{ color: INK }}>{item.title} <span className="text-[9px] font-semibold uppercase tracking-wide ml-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">Soon</span></span>
                    <span className="text-[12.5px]" style={{ color: '#6b7280' }}>{item.description}</span>
                  </span>
                )
              }
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={isActive ? 'page' : undefined}
                  className="flex items-start gap-3 px-3 py-2.5 rounded-[10px] no-underline transition-colors hover:bg-[#f9fafb]"
                  style={isActive ? { background: 'rgba(12,51,138,0.06)' } : undefined}
                >
                  <span className="mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded-md flex-shrink-0" style={{ background: '#f4f4f5', color: INK }}><Icon className="h-3.5 w-3.5" /></span>
                  <span className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-[14px] font-semibold leading-[1.3]" style={{ color: INK }}>{item.title}</span>
                    <span className="text-[12.5px] leading-[1.4]" style={{ color: '#6b7280' }}>{item.description}</span>
                  </span>
                </Link>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Avatar menu: the account-level sections (Team, Settings), then sign out. */
function AccountMenu({ email, pathname, onSignOut }: { email: string | null; pathname: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const accountLinks = NAV_SECTIONS.filter(s => s.placement === 'account' && s.href && !s.disabled)
  const onAccountPage = accountLinks.some(s => active(pathname, s.href!))
  useEffect(() => { setOpen(false) }, [pathname])
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(v => !v)} aria-label="Account menu" aria-expanded={open}
        className="flex items-center gap-2 rounded-full p-0.5 pr-2 border-0 cursor-pointer transition-colors hover:bg-[#f4f4f5]"
        style={{ background: onAccountPage ? 'rgba(12,51,138,0.08)' : 'transparent' }}>
        <span className="w-8 h-8 rounded-full inline-flex items-center justify-center text-[12px] font-bold text-white" style={{ background: '#0C338A' }}>{email ? email[0].toUpperCase() : '?'}</span>
        <span className="hidden md:block text-[13px] max-w-[160px] truncate" style={{ color: MUTED }}>{email ?? '—'}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] w-56 rounded-[14px] bg-white p-1.5" style={{ border: '1px solid rgba(200,200,204,0.45)', boxShadow: '0 12px 40px rgba(0,0,0,0.10)' }}>
          <div className="px-3 py-2 text-[12.5px] truncate" style={{ color: '#6b7280' }}>{email ?? 'Account'}</div>
          {accountLinks.map(s => {
            const Icon = s.icon
            const isActive = active(pathname, s.href!)
            return (
              <Link key={s.href} href={s.href!} aria-current={isActive ? 'page' : undefined}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-[10px] text-[13.5px] no-underline hover:bg-[#f9fafb]"
                style={{ color: INK, background: isActive ? 'rgba(12,51,138,0.06)' : undefined }}>
                <Icon className="h-4 w-4" style={{ color: MUTED }} /> {s.label}
              </Link>
            )
          })}
          <div className="my-1 mx-2" style={{ borderTop: '1px solid #f3f4f6' }} />
          <button type="button" onClick={onSignOut} className="w-full flex items-center gap-2 px-3 py-2 rounded-[10px] text-[13.5px] bg-transparent border-0 cursor-pointer text-left hover:bg-[#f9fafb]" style={{ color: INK }}>
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}

function MobileSection({ section, pathname }: { section: NavSection; pathname: string }) {
  const Icon = section.icon
  const items = sectionItems(section)
  if (!items.length) {
    const isActive = active(pathname, section.href!)
    if (section.disabled) return <span className="flex items-center gap-2.5 h-9 px-2.5 rounded-md text-[13px] text-muted-foreground/35"><Icon className="h-4 w-4" />{section.label}</span>
    return (
      <Link href={section.href!} aria-current={isActive ? 'page' : undefined}
        className={cn('flex items-center gap-2.5 h-9 px-2.5 rounded-md text-[13px] no-underline transition-colors hover:bg-accent', isActive ? 'bg-accent font-medium' : 'text-muted-foreground')}>
        <Icon className="h-4 w-4" />{section.label}
      </Link>
    )
  }
  const groups: NavGroup[] = section.groups ?? [{ heading: section.label, items: section.items! }]
  return (
    <div className="pt-2">
      <div className="flex items-center gap-2 px-2.5 h-7 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-muted-foreground"><Icon className="h-3.5 w-3.5" />{section.label}</div>
      {groups.map(group => (
        <div key={group.heading} className="mb-1.5 last:mb-0">
          {section.groups && <div className="px-2.5 h-6 flex items-center text-[9.5px] font-semibold uppercase tracking-[0.07em] text-muted-foreground/60">{group.heading}</div>}
          <div className="space-y-0.5">
            {group.items.map(item => {
              const isActive = active(pathname, item.href)
              if (item.disabled) return <span key={item.href} className="flex items-center gap-2.5 h-9 pl-6 pr-2.5 rounded-md text-[13px] text-muted-foreground/35"><item.icon className="h-3.5 w-3.5" />{item.title}</span>
              return (
                <Link key={item.href} href={item.href} aria-current={isActive ? 'page' : undefined}
                  className={cn('flex items-center gap-2.5 h-9 pl-6 pr-2.5 rounded-md text-[13px] no-underline transition-colors hover:bg-accent', isActive ? 'bg-accent font-medium' : 'text-muted-foreground')}>
                  <item.icon className="h-3.5 w-3.5" />{item.title}
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
