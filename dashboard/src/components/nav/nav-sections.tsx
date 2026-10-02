import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle, Users, BarChart2, Bot, UsersRound, Cpu, FolderOpen, BookMarked, History,
  Settings, FlaskConical, TrendingUp, ScrollText, Network, HeartPulse, Car,
  Receipt, CalendarDays, Waypoints, Building2, Link2, Wrench, Home, Landmark } from 'lucide-react'

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
  {
    label: 'Product',
    icon: Wrench,
    items: [
      { title: 'Debit Notes',    href: '/debit-notes',      icon: Receipt,      description: 'Raise and issue debit notes' },
      { title: 'Pricing Matrix', href: '/pricing-matrix',   icon: HeartPulse,   description: 'Insurer calculators and quotes' },
      { title: 'Match Threads',  href: '/companies/triage', icon: Link2,        description: 'Decide which company unmatched email belongs to' },
      { title: 'Contacts',       href: '/contacts',         icon: Users,        description: 'Every person on file' },
      { title: 'Finance',        href: '/finance',          icon: Landmark,     description: 'Receipts and reconciliation' },
      { title: 'RoadPlus',       href: '/roadplus',         icon: Car,          description: 'Motor programme' },
    ],
  },
  { label: 'Sales',     href: '/pipeline', icon: Waypoints },
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
