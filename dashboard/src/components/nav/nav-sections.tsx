import type { LucideIcon } from 'lucide-react'
import {
  Inbox, Mail, AlertTriangle, Users, BarChart2, Bot, UsersRound, Cpu, FolderOpen, BookMarked, History,
  Settings, FlaskConical, TrendingUp, ScrollText, Network, HeartPulse, Car,
  Receipt, CalendarDays, Waypoints, Building2, Link2, Wrench, Home, Landmark, Megaphone, Contact,
  Newspaper, Sparkles, Library, Search, Globe, Crosshair, CalendarClock, ShieldCheck, Table2 } from 'lucide-react'

export type NavLink = {
  title: string
  href: string
  description: string
  icon: LucideIcon
  disabled?: boolean
}

export type NavGroup = {
  heading: string
  items: NavLink[]
}

export type NavSection = {
  label: string
  icon: LucideIcon
  href?: string      // direct link — no dropdown
  disabled?: boolean
  placement?: 'account' // lives under the avatar on desktop, not in the bar; still listed on mobile
  items?: NavLink[]  // flat dropdown (2-6 items, one column)
  groups?: NavGroup[] // grouped dropdown (each group its own labeled column)
}

// Single source of truth for the top nav — used by both the desktop NavigationMenu and the
// mobile Sheet drawer.
//
// Companies-first. Home, Companies, the inbox (with Nexus beside it), the product tools, Sales,
// Calendar, Analytics. Settings — which now holds the team roster — sits under the avatar.
// Group Benefits is deprecated (route kept, hidden from the menu).
export const NAV_SECTIONS: NavSection[] = [
  // 29 Oct 2026 sweep: nine places on the bar, grouped by the work a broker does. Placement work
  // (requests, insurers) sits on the bar; billing under Finance; winning business under one menu;
  // everything checked rarely under More.
  { label: 'Home',      href: '/',           icon: Home },
  { label: 'Inbox',     href: '/engagement', icon: Inbox },
  { label: 'Nexus',     href: '/nexus',      icon: Network },
  { label: 'Companies', href: '/companies',  icon: Building2 },
  { label: 'Requests for quotes', href: '/rfq',      icon: Table2 },
  { label: 'Insurers',            href: '/insurers', icon: ShieldCheck },
  {
    label: 'Finance',
    icon: Landmark,
    items: [
      { title: 'Debit notes',                 href: '/debit-notes',        icon: Receipt,    description: 'Raise, issue and send debit notes' },
      { title: 'Receipts and reconciliation', href: '/finance',            icon: Landmark,   description: 'Payments received, matched to debit notes' },
      { title: 'Earnings',                    href: '/analytics/earnings', icon: TrendingUp, description: 'Commission earned by month' },
    ],
  },
  // One article library, knowledge bank and search view per website the business owns;
  // every page switches between corpcover.com, benefixe.com, newsouthsea.com and
  // traderisksolutions.com.sg.
  {
    label: 'Sales & marketing',
    icon: Megaphone,
    groups: [
      {
        heading: 'Sales',
        items: [
          { title: 'Enquiries',    href: '/sales/enquiries', icon: Inbox,     description: 'Forms buyers submit on each website' },
          { title: 'Leads',        href: '/sales/leads',     icon: Waypoints, description: 'Strongest first, with the draft to approve' },
          { title: 'Campaigns',    href: '/sales/campaigns', icon: Megaphone, description: 'Email sequences sent as sales@' },
          { title: 'Mailing list', href: '/sales/contacts',  icon: Contact,   description: 'Every address TRS may write to' },
        ],
      },
      {
        heading: 'Content',
        items: [
          { title: 'Articles',   href: '/marketing/articles',   icon: Newspaper,     description: 'Awaiting approval, published, drafts' },
          { title: 'Generate',   href: '/marketing/generate',   icon: Sparkles,      description: 'Start an engine run' },
          { title: 'Schedule',   href: '/marketing/schedule',   icon: CalendarClock, description: 'The nightly batch' },
          { title: 'Newsletter', href: '/marketing/newsletter', icon: Mail,          description: 'Subscribers and the weekly issue' },
        ],
      },
      {
        heading: 'Research',
        items: [
          { title: 'Knowledge',      href: '/marketing/knowledge',      icon: Library,   description: 'Facts the engine may write from' },
          { title: 'Competitors',    href: '/marketing/competitors',    icon: Crosshair, description: 'Their best pages and prompts' },
          { title: 'Search Console', href: '/marketing/search-console', icon: Search,    description: 'Impressions, positions, what to write next' },
        ],
      },
      {
        heading: 'Setup',
        items: [
          { title: 'Sites', href: '/marketing/sites', icon: Globe, description: 'URL, topics, banned terms, approval' },
        ],
      },
    ],
  },
  {
    label: 'More',
    icon: Wrench,
    groups: [
      {
        heading: 'Work',
        items: [
          { title: 'Calendar',           href: '/calendar',         icon: CalendarDays, description: 'Renewals, deadlines, meetings' },
          { title: 'Contacts',           href: '/contacts',         icon: Users,        description: 'Every person on file' },
          { title: 'Unfiled threads',    href: '/companies/triage', icon: Link2,        description: 'Choose the company for unmatched email' },
          { title: 'Benefits calculator', href: '/pricing-matrix',  icon: HeartPulse,   description: 'Insurer rate tables and EB quotes' },
          { title: 'RoadPlus',           href: '/roadplus',         icon: Car,          description: 'Motor programme' },
        ],
      },
      {
        heading: 'Admin',
        items: [
          { title: 'Activity log', href: '/analytics/activity',  icon: History,       description: 'Audit trail of system activity' },
          { title: 'Error log',    href: '/analytics/error-log', icon: AlertTriangle, description: 'AI and API failures' },
          { title: 'AI spend',     href: '/analytics/ai-usage',  icon: Cpu,           description: 'What each agent costs' },
          { title: 'Kyn ROI',      href: '/kyn-roi',             icon: TrendingUp,    description: 'Return on the Kyn vendor spend' },
        ],
      },
    ],
  },

  // Settings (with Team inside it) sits under the avatar.
  { label: 'Settings', href: '/settings', icon: Settings, placement: 'account' },
]
