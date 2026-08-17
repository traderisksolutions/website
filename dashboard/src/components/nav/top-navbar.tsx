'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Menu, LogOut } from 'lucide-react'
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from '@/components/ui/navigation-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { NAV_SECTIONS, type NavLink, type NavGroup, type NavSection } from './nav-sections'

type InboundCounts = { totalNew: number }
type StageCounts   = { engaged: number; qualified: number; proposal: number; converted: number }

async function fetchInboundCounts(): Promise<InboundCounts> {
  try {
    const res = await fetch('/api/leads', { cache: 'no-store' })
    if (!res.ok) return { totalNew: 0 }
    const raw = await res.json()
    const data: { status: string }[] = Array.isArray(raw) ? raw : []
    return { totalNew: data.filter(l => l.status === 'new').length }
  } catch { return { totalNew: 0 } }
}

async function fetchStageCounts(): Promise<StageCounts> {
  try {
    const res = await fetch('/api/contacts/counts', { cache: 'no-store' })
    if (!res.ok) return { engaged: 0, qualified: 0, proposal: 0, converted: 0 }
    const data = await res.json()
    return {
      engaged:   data.engaged   ?? 0,
      qualified: data.qualified ?? 0,
      proposal:  data.proposal  ?? 0,
      converted: data.converted ?? 0,
    }
  } catch { return { engaged: 0, qualified: 0, proposal: 0, converted: 0 } }
}

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

/** Sum of badge counts across a section's children — shown on the dropdown trigger itself now
 *  that items like "Email Inbox" / "Active Contacts" live inside a menu, not as their own
 *  top-level link (which is where their badge used to render in the old sidebar). */
function sectionBadge(section: NavSection, badgeFor: (href: string) => number | undefined): number | undefined {
  const total = sectionItems(section).reduce((sum, i) => sum + (badgeFor(i.href) ?? 0), 0)
  return total || undefined
}

const GROUP_COLS: Record<number, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
}
const GROUP_WIDTH: Record<number, string> = {
  1: 'md:w-[260px]',
  2: 'md:w-[480px]',
  3: 'md:w-[700px]',
}

function NavBadge({ count }: { count: number }) {
  return (
    <span className="flex items-center justify-center text-[10px] font-bold rounded-full px-1.5 min-w-[18px] h-[18px] flex-shrink-0 bg-primary text-primary-foreground">
      {count > 99 ? '99+' : count}
    </span>
  )
}

export function TopNavbar() {
  const pathname = usePathname()
  const router   = useRouter()
  const [inbound,   setInbound]   = useState<InboundCounts>({ totalNew: 0 })
  const [stages,    setStages]    = useState<StageCounts>({ engaged: 0, qualified: 0, proposal: 0, converted: 0 })
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const load = () => {
      fetchInboundCounts().then(setInbound)
      fetchStageCounts().then(setStages)
    }
    load()
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null))
  }, [])

  // Auto-close the mobile drawer on route change.
  useEffect(() => { setMobileOpen(false) }, [pathname])

  async function signOut() {
    await createClient().auth.signOut()
    router.push('/login')
  }

  const totalEngaged = stages.engaged + stages.qualified + stages.proposal + stages.converted

  function badgeFor(href: string): number | undefined {
    if (href === '/inbound/email') return inbound.totalNew || undefined
    if (href === '/contacts')      return totalEngaged || undefined
    return undefined
  }

  return (
    <header
      className="sticky top-0 z-50 w-full h-14 flex-shrink-0 border-b border-[--border-subtle] glass-sidebar"
      style={{ borderRight: 'none' }}
    >
      <div className="flex h-14 items-center gap-2 px-3 md:px-4">
        <Link href="/" className="flex items-center gap-2.5 flex-shrink-0 no-underline mr-2" aria-label="Home">
          <div
            className="flex items-center justify-center rounded-lg flex-shrink-0"
            style={{ width: 32, height: 32, background: 'hsl(var(--sidebar-ring))', boxShadow: '0 0 0 2px var(--primary-focus-ring)' }}
          >
            <span className="text-[10px] font-black text-white tracking-tight">TRS</span>
          </div>
          <span className="hidden sm:block text-[13px] font-semibold leading-tight tracking-tight text-foreground whitespace-nowrap">
            Trade Risk Solutions
          </span>
        </Link>

        {/* ── Desktop nav — no-wrap; scrolls horizontally in the rare case it doesn't fit rather
             than breaking into an unreadable second row. ── */}
        <div className="hidden lg:block flex-1 min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <NavigationMenu className="max-w-none justify-start">
            <NavigationMenuList className="gap-0.5 flex-nowrap w-max">
              {NAV_SECTIONS.map((section) => {
                const Icon = section.icon
                const isActive = sectionActive(pathname, section)
                const items = sectionItems(section)

                if (!items.length) {
                  const badge = badgeFor(section.href!)
                  return (
                    <NavigationMenuItem key={section.label}>
                      {section.disabled ? (
                        <span
                          className="flex items-center gap-1.5 rounded-md px-2.5 py-2 text-[12.5px] font-medium text-muted-foreground/35 cursor-default whitespace-nowrap"
                          aria-disabled="true"
                        >
                          <Icon className="h-4 w-4" />
                          {section.label}
                          <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground/50">Soon</span>
                        </span>
                      ) : (
                        <NavigationMenuLink asChild>
                          <Link
                            href={section.href!}
                            aria-current={isActive ? 'page' : undefined}
                            className={cn(
                              'flex items-center gap-1.5 rounded-md px-2.5 py-2 text-[12.5px] font-medium no-underline transition-colors hover:bg-accent hover:text-accent-foreground whitespace-nowrap',
                              isActive && 'bg-accent text-accent-foreground'
                            )}
                          >
                            <Icon className="h-4 w-4" />
                            {section.label}
                            {badge !== undefined && <NavBadge count={badge} />}
                          </Link>
                        </NavigationMenuLink>
                      )}
                    </NavigationMenuItem>
                  )
                }

                const badge = sectionBadge(section, badgeFor)
                const cols = section.groups?.length ?? 1

                return (
                  <NavigationMenuItem key={section.label}>
                    <NavigationMenuTrigger
                      className={cn('gap-1.5 text-[12.5px] px-2.5', isActive && 'bg-accent text-accent-foreground')}
                    >
                      <Icon className="h-4 w-4" />
                      {section.label}
                      {badge !== undefined && <NavBadge count={badge} />}
                    </NavigationMenuTrigger>
                    <NavigationMenuContent>
                      {section.groups ? (
                        <div className={cn('grid gap-1 p-3 w-[320px]', GROUP_COLS[Math.min(cols, 3)], GROUP_WIDTH[Math.min(cols, 3)])}>
                          {section.groups.map((group) => (
                            <GroupColumn key={group.heading} group={group} pathname={pathname} badgeFor={badgeFor} />
                          ))}
                        </div>
                      ) : (
                        <ul className="grid w-[320px] gap-1 p-3">
                          {section.items!.map((item) => (
                            <ListItem key={item.href} {...item} badge={badgeFor(item.href)} isActive={active(pathname, item.href)} />
                          ))}
                        </ul>
                      )}
                    </NavigationMenuContent>
                  </NavigationMenuItem>
                )
              })}
            </NavigationMenuList>
          </NavigationMenu>
        </div>

        {/* ── Right slot: search/notifications placeholder + profile + mobile trigger ── */}
        <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-2 rounded-full p-0.5 pr-2 hover:bg-accent transition-colors"
                aria-label="Account menu"
              >
                <span className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold text-accent-foreground flex-shrink-0">
                  {userEmail ? userEmail[0].toUpperCase() : '?'}
                </span>
                <span className="hidden md:block text-[11.5px] text-muted-foreground max-w-[160px] truncate">
                  {userEmail ?? '—'}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="truncate">{userEmail ?? 'Account'}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut}>
                <LogOut className="h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* ── Mobile trigger ── */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0 flex flex-col">
              <SheetHeader className="border-b border-[--border-subtle] pb-3">
                <SheetTitle>Trade Risk Solutions</SheetTitle>
              </SheetHeader>
              <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
                {NAV_SECTIONS.map((section) => (
                  <MobileSection
                    key={section.label}
                    section={section}
                    pathname={pathname}
                    badgeFor={badgeFor}
                  />
                ))}
              </nav>
              <div className="flex items-center gap-2.5 px-4 py-3 border-t border-[--border-subtle] flex-shrink-0">
                <span className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold text-accent-foreground flex-shrink-0">
                  {userEmail ? userEmail[0].toUpperCase() : '?'}
                </span>
                <span className="text-[11.5px] flex-1 truncate text-muted-foreground">{userEmail ?? '—'}</span>
                <button
                  onClick={signOut}
                  title="Sign out"
                  aria-label="Sign out"
                  className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors flex-shrink-0"
                >
                  <LogOut size={14} strokeWidth={2} />
                </button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}

function GroupColumn({
  group, pathname, badgeFor,
}: {
  group: NavGroup
  pathname: string
  badgeFor: (href: string) => number | undefined
}) {
  return (
    <div className="min-w-0">
      <div className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground/70">
        {group.heading}
      </div>
      <ul className="space-y-1">
        {group.items.map((item) => (
          <ListItem key={item.href} {...item} badge={badgeFor(item.href)} isActive={active(pathname, item.href)} />
        ))}
      </ul>
    </div>
  )
}

function ListItem({
  title, href, description, icon: Icon, disabled, badge, isActive,
}: NavLink & { badge?: number; isActive?: boolean }) {
  const inner = (
    <span className="flex select-none flex-row items-start gap-3 rounded-md p-2.5 leading-none">
      <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted', isActive && 'bg-accent')}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="flex items-center gap-2 text-[13px] font-medium leading-none">
          {title}
          {disabled && <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground/50">Soon</span>}
          {badge !== undefined && <NavBadge count={badge} />}
        </span>
        <span className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">{description}</span>
      </span>
    </span>
  )

  if (disabled) {
    return <li aria-disabled="true" className="opacity-40 cursor-default">{inner}</li>
  }

  return (
    <li>
      <NavigationMenuLink asChild>
        <Link
          href={href}
          aria-current={isActive ? 'page' : undefined}
          className={cn(
            'block rounded-md no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground',
            isActive && 'bg-accent/60'
          )}
        >
          {inner}
        </Link>
      </NavigationMenuLink>
    </li>
  )
}

function MobileSection({
  section, pathname, badgeFor,
}: {
  section: NavSection
  pathname: string
  badgeFor: (href: string) => number | undefined
}) {
  const Icon = section.icon
  const items = sectionItems(section)

  if (!items.length) {
    const isActive = active(pathname, section.href!)
    const badge = badgeFor(section.href!)
    if (section.disabled) {
      return (
        <span className="flex items-center gap-2.5 h-9 px-2.5 rounded-md text-[13px] text-muted-foreground/35 cursor-default">
          <Icon className="h-4 w-4" />
          {section.label}
          <span className="ml-auto text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground/50">Soon</span>
        </span>
      )
    }
    return (
      <Link
        href={section.href!}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'flex items-center gap-2.5 h-9 px-2.5 rounded-md text-[13px] no-underline transition-colors hover:bg-accent hover:text-accent-foreground',
          isActive ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground'
        )}
      >
        <Icon className="h-4 w-4" />
        {section.label}
        {badge !== undefined && <span className="ml-auto"><NavBadge count={badge} /></span>}
      </Link>
    )
  }

  const groups: NavGroup[] = section.groups ?? [{ heading: section.label, items: section.items! }]

  return (
    <div className="pt-2">
      <div className="flex items-center gap-2 px-2.5 h-7 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {section.label}
      </div>
      {groups.map((group) => (
        <div key={group.heading} className="mb-1.5 last:mb-0">
          {section.groups && (
            <div className="px-2.5 h-6 flex items-center text-[9.5px] font-semibold uppercase tracking-[0.07em] text-muted-foreground/60">
              {group.heading}
            </div>
          )}
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const isActive = active(pathname, item.href)
              const badge = badgeFor(item.href)
              if (item.disabled) {
                return (
                  <span key={item.href} className="flex items-center gap-2.5 h-9 pl-6 pr-2.5 rounded-md text-[13px] text-muted-foreground/35 cursor-default">
                    <item.icon className="h-3.5 w-3.5" />
                    {item.title}
                    <span className="ml-auto text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground/50">Soon</span>
                  </span>
                )
              }
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2.5 h-9 pl-6 pr-2.5 rounded-md text-[13px] no-underline transition-colors hover:bg-accent hover:text-accent-foreground',
                    isActive ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground'
                  )}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.title}
                  {badge !== undefined && <span className="ml-auto"><NavBadge count={badge} /></span>}
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
