import type { LucideIcon } from 'lucide-react'
import {
  ListChecks, Building2, Inbox, Table2, ShieldCheck, FileText, Landmark, FolderOpen, Megaphone,
  Settings, History, AlertTriangle, Cpu, TrendingUp, Users } from 'lucide-react'

export type PlaceTab = { title: string; href: string }

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
 * to the place holding the longest tab href that prefixes it, so /companies/triage is Work and
 * /companies/<id> is Clients.
 */
export const PLACES: Place[] = [
  { label: 'Work', href: '/work', icon: ListChecks, tabs: [
    { title: 'Queue', href: '/work' },
    { title: 'Home', href: '/' },
    { title: 'Calendar', href: '/calendar' },
    { title: 'Unfiled threads', href: '/companies/triage' },
  ] },
  { label: 'Clients', href: '/companies', icon: Building2, tabs: [
    { title: 'Companies', href: '/companies' },
    { title: 'People', href: '/contacts' },
    { title: 'Nexus', href: '/nexus' },
  ] },
  { label: 'Inbox', href: '/engagement', icon: Inbox, tabs: [
    { title: 'Inbox', href: '/engagement' },
    { title: 'Inbound', href: '/inbound' },
  ] },
  { label: 'Quotes', href: '/rfq', icon: Table2, tabs: [
    { title: 'Requests for quotes', href: '/rfq' },
    { title: 'Insurers', href: '/insurers' },
    { title: 'Benefits calculator', href: '/pricing-matrix' },
    { title: 'RoadPlus', href: '/roadplus' },
  ] },
  { label: 'Claims', href: '/claims', icon: ShieldCheck, tabs: [
    { title: 'Claims', href: '/claims' },
    { title: 'Second opinion', href: '/claims/second-opinion' },
  ] },
  { label: 'Policies', href: '/policies', icon: FileText, tabs: [
    { title: 'Policies', href: '/policies' },
    { title: 'Member movements', href: '/movements' },
  ] },
  { label: 'Finance', href: '/finance', icon: Landmark, tabs: [
    { title: 'Receipts', href: '/finance' },
    { title: 'Debit notes', href: '/debit-notes' },
    { title: 'Earnings', href: '/analytics/earnings' },
  ] },
  { label: 'Documents', href: '/documents', icon: FolderOpen, tabs: [
    { title: 'Documents', href: '/documents' },
  ] },
  { label: 'Growth', href: '/sales/enquiries', icon: Megaphone, tabs: [
    { title: 'Enquiries', href: '/sales/enquiries' },
    { title: 'Leads', href: '/sales/leads' },
    { title: 'Campaigns', href: '/sales/campaigns' },
    { title: 'Mailing list', href: '/sales/contacts' },
    { title: 'Articles', href: '/marketing/articles' },
    { title: 'Generate', href: '/marketing/generate' },
    { title: 'Schedule', href: '/marketing/schedule' },
    { title: 'Newsletter', href: '/marketing/newsletter' },
    { title: 'Knowledge', href: '/marketing/knowledge' },
    { title: 'Competitors', href: '/marketing/competitors' },
    { title: 'Search Console', href: '/marketing/search-console' },
    { title: 'Sites', href: '/marketing/sites' },
  ] },
]

/** Under the avatar: settings and the admin views checked rarely. */
export const ACCOUNT_LINKS: { title: string; href: string; icon: LucideIcon }[] = [
  { title: 'Settings',     href: '/settings',            icon: Settings },
  { title: 'Team',         href: '/team',                icon: Users },
  { title: 'Activity log', href: '/analytics/activity',  icon: History },
  { title: 'Error log',    href: '/analytics/error-log', icon: AlertTriangle },
  { title: 'AI spend',     href: '/analytics/ai-usage',  icon: Cpu },
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
  // /sales and /marketing landing pages belong to Growth.
  if (!best && (pathMatches(pathname, '/sales') || pathMatches(pathname, '/marketing'))) {
    const growth = PLACES.find(p => p.label === 'Growth')!
    return { place: growth, tab: null }
  }
  return best ?? { place: null, tab: null }
}
