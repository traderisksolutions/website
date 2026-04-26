import { Inbox } from 'lucide-react'
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
    id:    'inbound-leads',
    label: 'Inbound Leads',
    items: [
      {
        id:    'inbound',
        label: 'All Leads',
        icon:  Inbox,
        href:  '/inbound',
        children: [
          { label: 'All Leads',          href: '/inbound' },
          { label: 'WhatsApp Leads',     href: '/inbound?source=whatsapp' },
          { label: 'Website Form Leads', href: '/inbound?source=email' },
        ],
      },
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
