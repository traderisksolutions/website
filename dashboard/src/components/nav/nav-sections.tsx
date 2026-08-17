import type { LucideIcon } from 'lucide-react'
import {
  Inbox, MessageCircle, AlertCircle,
  Users, BarChart2,
  Bot, Table2, UsersRound,
  Cpu, FolderOpen, BookMarked, Radar, History,
  Telescope, Megaphone, Settings, FlaskConical,
  LayoutDashboard, TrendingUp, ScrollText, Network, HeartPulse, Car,
  Receipt, CalendarDays, BookOpen,
} from 'lucide-react'

export type NavLink = {
  title: string
  href: string
  description: string
  icon: LucideIcon
  disabled?: boolean
}

export type NavSection = {
  label: string
  icon: LucideIcon
  href?: string    // direct link — no dropdown
  disabled?: boolean
  items?: NavLink[] // dropdown children (2-6)
}

// Single source of truth for the top nav — used by both the desktop NavigationMenu and the
// mobile Sheet drawer. Mirrors the sections/hrefs that used to live in Sidebar.tsx 1:1; only the
// per-item `description` copy is new (the old rail had no room for it).
export const NAV_SECTIONS: NavSection[] = [
  { label: 'Home',     href: '/',         icon: LayoutDashboard },
  { label: 'Overview', href: '/overview', icon: BookOpen },
  { label: 'Inbound Leads', href: '/inbound/email', icon: Inbox },

  {
    label: 'Outbound Leads',
    icon: Telescope,
    items: [
      { title: 'Lead Discovery', href: '/outbound/agent',     icon: Telescope,     description: 'Find and qualify new leads' },
      { title: 'Signal Library', href: '/outbound/signals',   icon: Radar,         description: 'Buying-signal sources and rules' },
      { title: 'Lead Database',  href: '/outbound/leads',     icon: Table2,        description: 'Browse and manage all leads' },
      { title: 'Campaigns',      href: '/outbound/campaigns', icon: Megaphone,     description: 'Outbound sequences and sends' },
      { title: 'Reply Review',   href: '/outbound/replies',   icon: MessageCircle, description: 'Triage incoming replies' },
    ],
  },
  {
    label: 'Engagement',
    icon: Bot,
    items: [
      { title: 'Active Contacts',  href: '/contacts',        icon: Users,      description: 'Contacts currently in play' },
      { title: 'Engagement Agent', href: '/engagement',      icon: Bot,        description: 'AI-assisted conversation thread' },
      { title: 'Nexus',            href: '/nexus',           icon: Network,    description: 'Case workspace and RFQs' },
      { title: 'Pricing Matrix',   href: '/pricing-matrix',  icon: HeartPulse, description: 'Insurer calculators and quotes' },
      { title: 'Debit Notes',      href: '/debit-notes',     icon: Receipt,    description: 'Issued debit notes' },
      { title: 'Calendar',         href: '/calendar',        icon: CalendarDays, description: 'Meetings and scheduling' },
    ],
  },
  { label: 'RoadPlus', href: '/roadplus', icon: Car },
  {
    label: 'Knowledge',
    icon: BookMarked,
    items: [
      { title: 'Knowledge Base', href: '/outbound/knowledge',  icon: BookMarked, description: 'Guides, SOPs and playbooks' },
      { title: 'RAG Index',      href: '/analytics/rag-index', icon: FolderOpen, description: 'Indexed documents for retrieval' },
    ],
  },
  {
    label: 'Analytics',
    icon: BarChart2,
    items: [
      { title: 'Funnel',           href: '/analytics',          icon: BarChart2,    description: 'Lead-to-close funnel', disabled: true },
      { title: 'Activity Log',     href: '/analytics/activity', icon: History,      description: 'Audit trail of system activity' },
      { title: 'AI Usage',         href: '/analytics/ai-usage', icon: Cpu,          description: 'Model spend and usage' },
      { title: 'Email Evaluation', href: '/analytics/eval',     icon: FlaskConical, description: 'Outbound email quality checks' },
    ],
  },
  {
    label: 'Vendor Analytics',
    icon: TrendingUp,
    items: [
      { title: 'Kyn ROI',  href: '/kyn-roi',     icon: TrendingUp, description: 'Return on the Kyn vendor spend' },
      { title: 'Dev Logs', href: '/kyn-roi-log', icon: ScrollText, description: 'Kyn ROI build/change history' },
    ],
  },

  { label: 'Claims',   href: '/claims',   icon: AlertCircle, disabled: true },
  { label: 'Team',     href: '/team',     icon: UsersRound },
  { label: 'Settings', href: '/settings', icon: Settings },
]
