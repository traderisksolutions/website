import {
  Inbox, Users, BarChart2, MessageSquare, FileText,
  Settings, UserCircle, Bot, Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type SubItem = { label: string; href: string }

export type NavItem = {
  id:       string
  label:    string
  icon:     LucideIcon
  href:     string
  children?: SubItem[]
}

export type NavSection = {
  id:     string
  label:  string
  items:  NavItem[]
}

export const SIDEBAR_NAV: NavSection[] = [
  {
    id:    'sales',
    label: 'Sales Agent',
    items: [
      {
        id:    'inbound',
        label: 'Inbound Contacts',
        icon:  Inbox,
        href:  '/inbound',
        children: [
          { label: 'All Leads',  href: '/inbound' },
          { label: 'WhatsApp',   href: '/inbound?source=whatsapp' },
          { label: 'Email Form', href: '/inbound?source=email' },
        ],
      },
      { id: 'contacts', label: 'Contacts',  icon: Users,     href: '/contacts' },
      { id: 'pipeline', label: 'Pipeline',  icon: BarChart2, href: '/pipeline' },
    ],
  },
  {
    id:    'whatsapp',
    label: 'WhatsApp AI',
    items: [
      { id: 'conversations', label: 'Conversations', icon: MessageSquare, href: '/conversations' },
      { id: 'drafts',        label: 'Drafts',        icon: FileText,      href: '/drafts' },
    ],
  },
  {
    id:    'ai',
    label: 'AI Config',
    items: [
      { id: 'agents',  label: 'Agents',  icon: Bot,  href: '/agents' },
      { id: 'prompts', label: 'Prompts', icon: Zap,  href: '/prompts' },
    ],
  },
  {
    id:    'settings',
    label: 'Settings',
    items: [
      { id: 'team',   label: 'Team',          icon: UserCircle, href: '/team' },
      { id: 'config', label: 'Configuration', icon: Settings,   href: '/config' },
    ],
  },
]

/* ── TopNav config type ── */
export type NavLink = {
  label:       string
  href:        string
  description?: string
  icon?:       LucideIcon
  badge?:      string
}

export type NavGroup = {
  label?: string
  items:  NavLink[]
}

export type NavTrigger = {
  label:   string
  href?:   string
  groups?: NavGroup[]
}
