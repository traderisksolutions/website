'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV: { href: string; label: string }[] = [
  { href: '/overview',          label: 'Overview'  },
  { href: '/overview/workflow', label: 'Workflow'  },
]

const SECTION_NAV: { href: string; label: string }[] = [
  { href: '/overview/inbound',    label: 'Inbound Leads'  },
  { href: '/overview/outbound',   label: 'Outbound Leads' },
  { href: '/overview/engagement', label: 'Engagement'     },
  { href: '/overview/analytics',  label: 'Analytics'      },
]

const AGENT_ROOT = '/overview/agents'

const AGENT_PAGES: { href: string; label: string }[] = [
  { href: '/overview/agents/inbound-auto-draft', label: 'Inbound Auto-Draft' },
  { href: '/overview/agents/engagement-drafter', label: 'Engagement Drafter' },
  { href: '/overview/agents/campaign-drafter',   label: 'Campaign Drafter'   },
  { href: '/overview/agents/evaluation-agent',   label: 'Evaluation Agent'   },
  { href: '/overview/agents/evals',              label: 'How Evals Work'     },
]

export default function OverviewNav() {
  const pathname = usePathname()

  function isActive(href: string) {
    return pathname === href
  }

  function isAgentSection() {
    return pathname === AGENT_ROOT || pathname.startsWith(AGENT_ROOT + '/')
  }

  function NavItem({ href, label }: { href: string; label: string }) {
    const active = isActive(href)
    return (
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className="block w-full text-left px-2.5 py-1.5 rounded-md text-[13px] no-underline transition-all mb-px"
        style={{
          background:  active ? 'hsl(var(--primary) / 0.08)' : 'transparent',
          color:       active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
          fontWeight:  active ? 600 : 400,
          borderLeft:  `2px solid ${active ? 'hsl(var(--primary))' : 'transparent'}`,
          paddingLeft: active ? '9px' : '10px',
        }}
      >
        {label}
      </Link>
    )
  }

  function AgentParentItem() {
    const active = isActive(AGENT_ROOT)
    const inSection = isAgentSection()
    return (
      <Link
        href={AGENT_ROOT}
        aria-current={active ? 'page' : undefined}
        className="block w-full text-left px-2.5 py-1.5 rounded-md text-[13px] no-underline transition-all mb-px"
        style={{
          background:  active ? 'hsl(var(--primary) / 0.08)' : 'transparent',
          color:       inSection ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
          fontWeight:  inSection ? 600 : 400,
          borderLeft:  `2px solid ${inSection ? 'hsl(var(--primary))' : 'transparent'}`,
          paddingLeft: inSection ? '9px' : '10px',
        }}
      >
        AI Agents
      </Link>
    )
  }

  function AgentSubItem({ href, label }: { href: string; label: string }) {
    const active = isActive(href)
    return (
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className="block w-full text-left rounded-md no-underline transition-all mb-px"
        style={{
          fontSize: 12,
          padding: '5px 10px 5px 18px',
          background:  active ? 'hsl(var(--primary) / 0.06)' : 'transparent',
          color:       active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
          fontWeight:  active ? 600 : 400,
          borderLeft:  `2px solid ${active ? 'hsl(var(--primary))' : 'transparent'}`,
        }}
      >
        {label}
      </Link>
    )
  }

  return (
    <div className="w-[196px] flex-shrink-0 bg-card border-r border-border flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 border-b border-border">
        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-0">
          Overview
        </p>
        <p className="text-[11px] text-muted-foreground/50 leading-snug mt-0.5">
          Platform guide
        </p>
      </div>

      {/* Nav */}
      <nav className="p-2 flex-1">
        {NAV.map(n => <NavItem key={n.href} {...n} />)}

        <div className="h-px bg-border my-2" />

        <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground/50 px-2.5 mb-1.5 mt-0.5">
          Platform areas
        </p>
        {SECTION_NAV.map(n => <NavItem key={n.href} {...n} />)}

        <div className="h-px bg-border my-2" />

        <AgentParentItem />
        {AGENT_PAGES.map(n => <AgentSubItem key={n.href} {...n} />)}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border">
        <p className="text-[11px] text-muted-foreground/40 leading-relaxed">
          TRS Internal Dashboard
        </p>
      </div>
    </div>
  )
}
