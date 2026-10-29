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
  { label: 'Home',      href: '/',          icon: Home },
  { label: 'Companies', href: '/companies', icon: Building2 },
  // Ask AI is reached from a thread, where it belongs — the question is almost always about a
  // conversation in front of you. /ask still works for a question with no thread open; it is
  // simply not in the navbar.
  {
    label: 'All Inbox',
    icon: Bot,
    items: [
      { title: 'All Inbox', href: '/engagement', icon: Bot,     description: 'Every client conversation, needs-reply first' },
      { title: 'Nexus',     href: '/nexus',      icon: Network, description: 'Case analysis across a client\'s threads and files' },
    ],
  },
  // The placement work every broker does daily sits on the bar itself (29 Oct 2026 redesign).
  { label: 'Requests for quotes', href: '/rfq',      icon: Table2 },
  { label: 'Insurers',            href: '/insurers', icon: ShieldCheck },
  {
    label: 'Product',
    icon: Wrench,
    items: [
      { title: 'Debit Notes',    href: '/debit-notes',      icon: Receipt,      description: 'Raise and issue debit notes' },
      { title: 'Employment Benefits', href: '/pricing-matrix', icon: HeartPulse, description: 'Insurer calculators and quotes' },
      { title: 'Match Threads',  href: '/companies/triage', icon: Link2,        description: 'Decide which company unmatched email belongs to' },
      { title: 'Contacts',       href: '/contacts',         icon: Users,        description: 'Every person on file' },
      { title: 'Finance',        href: '/finance',          icon: Landmark,     description: 'Receipts and reconciliation' },
      { title: 'RoadPlus',       href: '/roadplus',         icon: Car,          description: 'Motor programme' },
    ],
  },
  {
    label: 'Sales',
    icon: Waypoints,
    items: [
      { title: 'Enquiries', href: '/sales/enquiries', icon: Inbox,     description: 'Forms buyers submit on each website: Corp Cover, Benefixe, New South Sea, TRS' },
      { title: 'Leads',     href: '/sales/leads',     icon: Waypoints, description: 'Companies from the lead tool, strongest first, with the draft to approve' },
      { title: 'Contacts',  href: '/sales/contacts',  icon: Contact,   description: 'Every address TRS may write to: prospects, clients, enquiries' },
      { title: 'Campaigns', href: '/sales/campaigns', icon: Megaphone, description: 'Email sequences sent as sales@, each recipient approved first' },
    ],
  },
  // One article library, knowledge bank and search view per website the business owns;
  // every page switches between corpcover.com, benefixe.com, newsouthsea.com and
  // traderisksolutions.com.sg.
  {
    label: 'Marketing',
    icon: Newspaper,
    items: [
      { title: 'Articles',       href: '/marketing/articles',       icon: Newspaper,  description: 'Every article per site: awaiting approval, published, drafts' },
      { title: 'Knowledge',      href: '/marketing/knowledge',      icon: Library,    description: 'The facts the engine may write from, per site' },
      { title: 'Competitors',    href: '/marketing/competitors',    icon: Crosshair,  description: 'Competitor blogs, their best pages, and the prompts worth writing for' },
      { title: 'Schedule',       href: '/marketing/schedule',       icon: CalendarClock, description: 'The nightly batch: cadence, tonight\'s prompts, what was posted' },
      { title: 'Generate',       href: '/marketing/generate',       icon: Sparkles,   description: 'Start an engine run and follow its twelve stages' },
      { title: 'Newsletter',     href: '/marketing/newsletter',     icon: Mail,       description: 'Subscribers per site and the weekly issue, approved before it sends' },
      { title: 'Search Console', href: '/marketing/search-console', icon: Search,     description: 'Google impressions, positions and what to write next' },
      { title: 'Sites',          href: '/marketing/sites',          icon: Globe,      description: 'Base URL, contact link, topics, banned terms, approval, nightly count' },
    ],
  },
  { label: 'Calendar',  href: '/calendar', icon: CalendarDays },
  // Earnings is the business's own figure, so it sits on the bar; the system logs moved under Admin.
  { label: 'Earnings',  href: '/analytics/earnings', icon: TrendingUp },
  {
    label: 'Admin',
    icon: BarChart2,
    groups: [
      {
        heading: 'System',
        items: [
          { title: 'Activity Log',     href: '/analytics/activity',  icon: History,       description: 'Audit trail of system activity' },
          { title: 'Error Log',        href: '/analytics/error-log', icon: AlertTriangle, description: 'AI/API failures, auto-logged as they happen' },
          { title: 'AI Spend',         href: '/analytics/ai-usage',  icon: Cpu,           description: 'What each agent costs' },
        ],
      },
      {
        heading: 'Vendor',
        items: [
          { title: 'Kyn ROI',  href: '/kyn-roi',     icon: TrendingUp, description: 'Return on the Kyn vendor spend' },
        ],
      },
    ],
  },

  // Settings (with Team inside it) sits under the avatar.
  { label: 'Settings', href: '/settings', icon: Settings, placement: 'account' },
]
