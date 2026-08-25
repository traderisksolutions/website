import type { LucideIcon } from 'lucide-react'
import {
  Inbox, MessageCircle, AlertCircle, AlertTriangle,
  Users, BarChart2,
  Bot, Table2, UsersRound,
  Cpu, FolderOpen, BookMarked, Radar, History,
  Telescope, Megaphone, Settings, FlaskConical,
  TrendingUp, ScrollText, Network, HeartPulse, Car,
  Receipt, CalendarDays, Waypoints,
} from 'lucide-react'

export type NavLink = {
  title: string
  href: string
  description: string
  icon: LucideIcon
  disabled?: boolean
}

/** A labeled column inside a dropdown — lets a section hold more than ~6 items without turning
 *  into an unscannable flat list (e.g. Leads: Inbound vs Outbound; Analytics: Knowledge vs
 *  Reporting vs Vendor). Sections with only one natural grouping just use `items` instead. */
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
// mobile Sheet drawer. Consolidated from the ~12 groups Sidebar.tsx had (which, ported 1:1 into
// top-level nav slots, wrapped into an unreadable second row) down to 7: single-page sections
// stay direct links, the rest fold into a handful of dropdowns organized by actual task, not by
// how the old rail happened to bucket them. Every route/href is unchanged from the old sidebar —
// only which menu it lives under changed. `/` (Home) is reachable via the logo, same convention
// as almost every top-nav app; it doesn't need its own slot next to Overview.
export const NAV_SECTIONS: NavSection[] = [
  { label: 'Pipeline', href: '/pipeline', icon: Waypoints },

  {
    label: 'Leads',
    icon: Inbox,
    groups: [
      {
        heading: 'Inbound',
        items: [
          { title: 'Email Inbox', href: '/inbound/email',    icon: Inbox,         description: 'New leads from email' },
          { title: 'WhatsApp',    href: '/inbound/whatsapp', icon: MessageCircle, description: 'New leads from WhatsApp' },
        ],
      },
      {
        heading: 'Outbound',
        items: [
          { title: 'Lead Discovery', href: '/outbound/agent',     icon: Telescope,     description: 'Find and qualify new leads' },
          { title: 'Signal Library', href: '/outbound/signals',   icon: Radar,         description: 'Buying-signal sources and rules' },
          { title: 'Lead Database',  href: '/outbound/leads',     icon: Table2,        description: 'Browse and manage all leads' },
          { title: 'Campaigns',      href: '/outbound/campaigns', icon: Megaphone,     description: 'Outbound sequences and sends' },
          { title: 'Reply Review',   href: '/outbound/replies',   icon: MessageCircle, description: 'Triage incoming replies' },
        ],
      },
    ],
  },

  {
    label: 'Engagement',
    icon: Bot,
    groups: [
      {
        heading: 'Clients',
        items: [
          { title: 'Active Contacts',  href: '/contacts',   icon: Users, description: 'Contacts currently in play' },
          { title: 'Engagement Agent', href: '/engagement', icon: Bot,   description: 'AI-assisted conversation thread' },
          { title: 'Nexus',            href: '/nexus',      icon: Network, description: 'Case workspace and RFQs' },
        ],
      },
      {
        heading: 'Policy & Ops',
        items: [
          { title: 'Pricing Matrix', href: '/pricing-matrix', icon: HeartPulse,   description: 'Insurer calculators and quotes' },
          { title: 'Debit Notes',    href: '/debit-notes',    icon: Receipt,      description: 'Issued debit notes' },
          { title: 'Calendar',       href: '/calendar',       icon: CalendarDays, description: 'Meetings and scheduling' },
          { title: 'Claims',         href: '/claims',         icon: AlertCircle,  description: 'Claims handling', disabled: true },
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
