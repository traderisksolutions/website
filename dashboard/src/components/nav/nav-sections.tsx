import type { LucideIcon } from 'lucide-react'
import {
  ListChecks, Building2, Inbox, Table2, LayoutGrid, Megaphone,
  Settings, History, AlertTriangle, Cpu, TrendingUp, Users, Gauge, HeartPulse } from 'lucide-react'

export type PlaceTab = { title: string; href: string }

/** The four websites, keyed as in marketing_sites. Their page is /websites/<key>. */
export const WEBSITES: PlaceTab[] = [
  { title: 'Trade Risk Solutions', href: '/websites/traderisksolutions' },
  { title: 'Corp Cover', href: '/websites/corpcover' },
  { title: 'Benefixe', href: '/websites/benefixe' },
  { title: 'New South Sea', href: '/websites/newsouthsea' },
]

export type Place = {
  label: string
  href: string
  icon: LucideIcon
  /** The pages inside this place, shown as a tab row under the bar. The first is the place's home. */
  tabs: PlaceTab[]
}

/**
 * The top bar (1 Nov 2026 revamp): nine flat places, no drop-downs. Every page that the old
 * menus reached is a tab of one place, or sits under the avatar (ACCOUNT_LINKS). A path belongs
 * to the place holding the longest tab href that prefixes it, so /companies/triage is Today and
 * /companies/<id> is Clients. Today (2 Nov 2026) took Work's slot; the queue is its second tab.
 */
export const PLACES: Place[] = [
  { label: 'Today', href: '/today', icon: ListChecks, tabs: [
    { title: 'Today', href: '/today' },
    // Jarod, 19 Nov 2026: Today and Calendar only. The other pages stay at their addresses.
    { title: 'Calendar', href: '/calendar' },
  ] },
  { label: 'Clients', href: '/companies', icon: Building2, tabs: [
    { title: 'Companies', href: '/companies' },
    { title: 'People', href: '/contacts' },
    { title: 'Nexus', href: '/nexus' },
    { title: 'Portfolio', href: '/companies/portfolio' },
    { title: 'Admin desk', href: '/companies/portfolio/desk' },
  ] },
  // Jarod, 19 Nov 2026: one home for Employment Benefits. The register of quotations moved here
  // from Quotes, which no longer carries it. 20 Nov 2026: New quotation · Quotation register
  // (eb_quotations, at the old /pricing-matrix address) · Brochures.
  { label: 'Employment Benefits', href: '/eb', icon: HeartPulse, tabs: [
    { title: 'New quotation', href: '/eb' },
    { title: 'Quotation register', href: '/pricing-matrix' },
    { title: 'Brochures', href: '/brochures' },
  ] },
  { label: 'Inbox', href: '/engagement', icon: Inbox, tabs: [
    { title: 'Inbox', href: '/engagement' },
    { title: 'Inbound', href: '/inbound' },
  ] },
  // Jarod, 19 Nov 2026: Quotes is off the bar. RoadPlus is its own place; Lines is a tab under
  // Others; Requests for quotes and Insurers left the bar and keep their addresses.
  { label: 'RoadPlus', href: '/roadplus', icon: Table2, tabs: [
    { title: 'RoadPlus', href: '/roadplus' },
  ] },
  // Others (19 Nov 2026): Claims, Policies, Finance and Documents in one place.
  { label: 'Others', href: '/claims', icon: LayoutGrid, tabs: [
    { title: 'Claims', href: '/claims' },
    { title: 'Second opinion', href: '/claims/second-opinion' },
    { title: 'Policies', href: '/policies' },
    { title: 'Member movements', href: '/movements' },
    { title: 'Receipts', href: '/finance' },
    { title: 'Debit notes', href: '/debit-notes' },
    { title: 'Earnings', href: '/analytics/earnings' },
    { title: 'Documents', href: '/documents' },
    { title: 'Lines', href: '/lines' },
  ] },
  // Marketing (19 Nov 2026, was Growth): one tab per website. Each website's page links to its
  // articles, enquiries, newsletter and Search Console, which keep their ?site= pages.
  { label: 'Marketing', href: WEBSITES[0].href, icon: Megaphone, tabs: WEBSITES },
]

/** Under the avatar: settings and the admin views checked rarely. */
export const ACCOUNT_LINKS: { title: string; href: string; icon: LucideIcon }[] = [
  { title: 'Settings',     href: '/settings',            icon: Settings },
  { title: 'Team',         href: '/team',                icon: Users },
  { title: 'Activity log', href: '/analytics/activity',  icon: History },
  { title: 'Error log',    href: '/analytics/error-log', icon: AlertTriangle },
  { title: 'AI spend',     href: '/analytics/ai-usage',  icon: Cpu },
  { title: 'Autonomy',     href: '/analytics/autonomy',  icon: Gauge },
  { title: 'Kyn ROI',      href: '/kyn-roi',             icon: TrendingUp },
]

export function pathMatches(pathname: string, href: string) {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(href + '/')
}

/** The place and tab a path belongs to: the longest matching tab href wins. */
export function locate(pathname: string): { place: Place | null; tab: PlaceTab | null } {
  let best: { place: Place; tab: PlaceTab } | null = null
  for (const place of PLACES) for (const tab of place.tabs) {
    if (pathMatches(pathname, tab.href) && (!best || tab.href.length > best.tab.href.length)) best = { place, tab }
  }
  // A website's tools (/marketing/…?site=) and the sales pages belong to Marketing.
  if (!best && (pathMatches(pathname, '/sales') || pathMatches(pathname, '/marketing'))) {
    const marketing = PLACES.find(p => p.label === 'Marketing')!
    return { place: marketing, tab: null }
  }
  return best ?? { place: null, tab: null }
}
