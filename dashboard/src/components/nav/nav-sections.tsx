import type { LucideIcon } from 'lucide-react'
import {
  Building2, Inbox, Table2, LayoutGrid, Megaphone,
  Settings, AlertTriangle, Cpu, HeartPulse, RefreshCw } from 'lucide-react'

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
 * The top bar (1 Nov 2026 revamp): flat places, no drop-downs. Every page that the old
 * menus reached is a tab of one place, or sits under the avatar (ACCOUNT_LINKS). A path belongs
 * to the place holding the longest tab href that prefixes it, so /companies/portfolio/desk is Admin desk and
 * /companies/<id> is Clients. /today and /calendar belong to no place: the logo opens Today.
 */
export const PLACES: Place[] = [
  // Jarod, 20 Nov 2026: Today is not a place on the bar. The TRS logo opens it; Calendar is a view
  // on Today (/today?calendar=1) and keeps /calendar. Both are in HOME_LINKS for ⌘K.
  // Jarod, 20 Nov 2026: Portfolio and Admin desk left the Clients tabs.
  { label: 'Clients', href: '/companies', icon: Building2, tabs: [
    { title: 'Companies', href: '/companies' },
    { title: 'People', href: '/contacts' },
    { title: 'Nexus', href: '/nexus' },
    // Jarod, 20 Nov 2026: Unfiled threads (with the Referrals review) is a Clients tab.
    { title: 'Unfiled threads', href: '/companies/triage' },
  ] },
  // Jarod, 20 Nov 2026: Renewals is its own place (docs/renewals.md). /renewals/<id> sits under Pipeline.
  { label: 'Renewals', href: '/renewals', icon: RefreshCw, tabs: [
    { title: 'Pipeline', href: '/renewals' },
    { title: 'Forecast', href: '/renewals/forecast' },
    { title: 'To fix', href: '/renewals/fix' },
  ] },
  // Jarod, 19 Nov 2026: one home for Employment Benefits. The register of quotations moved here
  // from Quotes, which no longer carries it. 20 Nov 2026: New quotation · Quotation register
  // (eb_quotations, at the old /pricing-matrix address) · Brochures. 20 Nov 2026: the register's
  // address is /eb/quotations (/pricing-matrix redirects there).
  { label: 'Employment Benefits', href: '/eb', icon: HeartPulse, tabs: [
    { title: 'New quotation', href: '/eb' },
    { title: 'Quotation register', href: '/eb/quotations' },
    // 21 Nov 2026: Products, the workbook beside the rate tables (docs/eb-v2.md P3).
    { title: 'Products', href: '/eb/products' },
    { title: 'Brochures', href: '/brochures' },
  ] },
  { label: 'Inbox', href: '/engagement', icon: Inbox, tabs: [
    { title: 'Inbox', href: '/engagement' },
  ] },
  // Jarod, 19 Nov 2026: Quotes is off the bar. RoadPlus is its own place; Lines is a tab under
  // Others; Requests for quotes and Insurers left the bar and keep their addresses.
  { label: 'RoadPlus', href: '/roadplus', icon: Table2, tabs: [
    { title: 'RoadPlus', href: '/roadplus' },
  ] },
  // Others (19 Nov 2026): Claims, Policies, Finance and Documents in one place. 20 Nov 2026:
  // Second opinion and Documents are tabs inside Claims, not here.
  { label: 'Others', href: '/claims', icon: LayoutGrid, tabs: [
    { title: 'Claims', href: '/claims' },
    { title: 'Policies', href: '/policies' },
    { title: 'Member movements', href: '/movements' },
    { title: 'Receipts', href: '/finance' },
    { title: 'Debit notes', href: '/debit-notes' },
    { title: 'Lines', href: '/lines' },
  ] },
  // Marketing (19 Nov 2026, was Growth): one tab per website. Each website's page links to its
  // articles, enquiries, newsletter and Search Console, which keep their ?site= pages.
  { label: 'Marketing', href: WEBSITES[0].href, icon: Megaphone, tabs: WEBSITES },
  // Jarod, 20 Nov 2026 (approved design): AI Agents, monitoring only. Usage replaces AI spend under the avatar.
  { label: 'AI Agents', href: '/agents', icon: Cpu, tabs: [
    { title: 'Agents', href: '/agents' },
    { title: 'Usage', href: '/agents/usage' },
    { title: 'Knowledge', href: '/agents/knowledge' },
  ] },
]

/** Today and its Calendar: opened by the logo, not a place on the bar; listed for ⌘K. */
export const HOME_LINKS: { label: string; href: string }[] = [
  { label: 'Today', href: '/today' },
  { label: 'Calendar', href: '/today?calendar=1' },
]

/** Under the avatar: settings and the admin views checked rarely. */
export const ACCOUNT_LINKS: { title: string; href: string; icon: LucideIcon }[] = [
  { title: 'Settings',     href: '/settings',            icon: Settings },
  { title: 'Error log',    href: '/analytics/error-log', icon: AlertTriangle },
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
