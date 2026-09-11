import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle, Users, BarChart2, Bot, UsersRound, Cpu, FolderOpen, BookMarked, History,
  Settings, FlaskConical, TrendingUp, ScrollText, Network, HeartPulse, Car,
  Receipt, CalendarDays, Waypoints, Building2, Link2, Wrench, Home, Landmark,
} from 'lucide-react'

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
  items?: NavLink[]  // flat dropdown (2-6 items, one column)
  groups?: NavGroup[] // grouped dropdown (each group its own labeled column)
}

// Single source of truth for the top nav — used by both the desktop NavigationMenu and the
// mobile Sheet drawer.
//
// Companies-first. Client work lives inside each company page. The daily path reads left to
// right: the client list, all mail, the sales journey, cases, the diary. Tools keeps the
// global-only views that are not about one client. Finance is where a balance is cleared.
// Group Benefits is deprecated (route kept,
// hidden from the menu). RoadPlus, Analytics, Team and Settings stay separate.
export const NAV_SECTIONS: NavSection[] = [
  { label: 'Home',           href: '/',           icon: Home },
  { label: 'Companies',      href: '/companies',  icon: Building2 },
  { label: 'All Inbox',      href: '/engagement', icon: Bot },
  { label: 'Sales Outreach', href: '/pipeline',   icon: Waypoints },
  { label: 'Nexus',          href: '/nexus',      icon: Network },
  { label: 'Calendar',       href: '/calendar',   icon: CalendarDays },
  { label: 'Finance',        href: '/finance',    icon: Landmark },

  {
    label: 'Tools',
    icon: Wrench,
    items: [
      { title: 'Debit Notes',    href: '/debit-notes',      icon: Receipt,    description: 'Raise and issue debit notes' },
      { title: 'Pricing Matrix', href: '/pricing-matrix',   icon: HeartPulse, description: 'Insurer calculators and quotes' },
      { title: 'Filing',         href: '/companies/triage', icon: Link2,      description: 'Decide who unmatched email belongs to' },
      { title: 'Contacts',       href: '/contacts',         icon: Users,      description: 'Every person on file' },
    ],
  },

  { label: 'RoadPlus', href: '/roadplus', icon: Car },

  {
    label: 'Analytics',
    icon: BarChart2,
    groups: [
      {
        heading: 'Knowledge',
        items: [
          { title: 'Knowledge Base', href: '/outbound/knowledge',  icon: BookMarked, description: 'Guides, SOPs and playbooks' },
          { title: 'RAG Index',      href: '/analytics/rag-index', icon: FolderOpen, description: 'Indexed documents for retrieval' },
        ],
      },
      {
        heading: 'Reporting',
        items: [
          { title: 'Funnel',           href: '/analytics',           icon: BarChart2,     description: 'Lead-to-close funnel', disabled: true },
          { title: 'Activity Log',     href: '/analytics/activity',  icon: History,       description: 'Audit trail of system activity' },
          { title: 'Error Log',        href: '/analytics/error-log', icon: AlertTriangle, description: 'AI/API failures, auto-logged as they happen' },
          { title: 'AI Usage',         href: '/analytics/ai-usage',  icon: Cpu,           description: 'Model spend and usage' },
          { title: 'Email Evaluation', href: '/analytics/eval',      icon: FlaskConical,  description: 'Outbound email quality checks' },
        ],
      },
      {
        heading: 'Vendor',
        items: [
          { title: 'Kyn ROI',  href: '/kyn-roi',     icon: TrendingUp, description: 'Return on the Kyn vendor spend' },
          { title: 'Dev Logs', href: '/kyn-roi-log', icon: ScrollText, description: 'Kyn ROI build/change history' },
        ],
      },
    ],
  },

  { label: 'Team',     href: '/team',     icon: UsersRound },
  { label: 'Settings', href: '/settings', icon: Settings },
]
