import type { LucideIcon } from 'lucide-react'
import {
  Inbox, MessageCircle, AlertCircle, AlertTriangle,
  Users, BarChart2,
  Bot, Table2, UsersRound,
  Cpu, FolderOpen, BookMarked, Radar, History,
  Telescope, Megaphone, Settings, FlaskConical,
  TrendingUp, ScrollText, Network, HeartPulse, Car,
  Receipt, CalendarDays, Waypoints, Building2, Link2, Briefcase, Home,
} from 'lucide-react'

export type NavLink = {
  title: string
  href: string
  description: string
  icon: LucideIcon
  disabled?: boolean
}

/** A labeled column inside a dropdown — lets a section hold more than ~6 items without turning
 *  into an unscannable flat list. Sections with only one natural grouping just use `items`. */
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
// Companies-first (10 Sep 2026): the client company is the hub. Home, Companies, Pipeline and
// Inbox are the daily loop; "Work" holds the tools that act on a company (debit notes, quotes,
// Nexus, calendar, triage) and the lead sources that feed the pipeline. RoadPlus, Analytics,
// Team and Settings stay separate top-level items, as agreed. Every legacy route is still
// reachable — only where it lives in the menu changed.
export const NAV_SECTIONS: NavSection[] = [
  { label: 'Home',      href: '/',          icon: Home },
  { label: 'Companies', href: '/companies', icon: Building2 },
  { label: 'Pipeline',  href: '/pipeline',  icon: Waypoints },
  { label: 'Inbox',     href: '/engagement', icon: Bot },

  {
    label: 'Work',
    icon: Briefcase,
    groups: [
      {
        heading: 'Client work',
        items: [
          { title: 'Debit Notes',      href: '/debit-notes',      icon: Receipt,      description: 'Invoices and payments' },
          { title: 'Pricing Matrix',   href: '/pricing-matrix',   icon: HeartPulse,   description: 'Insurer calculators and group benefits quotes' },
          { title: 'Group Benefits',   href: '/group-benefits',   icon: Users,        description: 'Earlier group benefits quoting flow' },
          { title: 'Nexus',            href: '/nexus',            icon: Network,      description: 'Case workspace and RFQs' },
          { title: 'Calendar',         href: '/calendar',         icon: CalendarDays, description: 'Renewals and payment due dates' },
          { title: 'Link threads',     href: '/companies/triage', icon: Link2,        description: 'File emails under the right company' },
          { title: 'Contacts',         href: '/contacts',         icon: Users,        description: 'Every person on file' },
          { title: 'Claims',           href: '/claims',           icon: AlertCircle,  description: 'Claims handling', disabled: true },
        ],
      },
      {
        heading: 'Lead sources',
        items: [
          { title: 'Website leads',  href: '/inbound/email',      icon: Inbox,         description: 'New enquiries from the website' },
          { title: 'WhatsApp',       href: '/inbound/whatsapp',   icon: MessageCircle, description: 'New leads from WhatsApp' },
          { title: 'Lead Discovery', href: '/outbound/agent',     icon: Telescope,     description: 'Find and qualify new leads' },
          { title: 'Signal Library', href: '/outbound/signals',   icon: Radar,         description: 'Buying-signal sources and rules' },
          { title: 'Lead Database',  href: '/outbound/leads',     icon: Table2,        description: 'Browse and manage all leads' },
          { title: 'Campaigns',      href: '/outbound/campaigns', icon: Megaphone,     description: 'Outbound sequences and sends' },
          { title: 'Reply Review',   href: '/outbound/replies',   icon: MessageCircle, description: 'Triage incoming replies' },
        ],
      },
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
