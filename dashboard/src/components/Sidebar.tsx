'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Mail, MessageCircle, AlertCircle,
  Users, BarChart2,
  ChevronRight, ChevronDown, ChevronLeft,
  Bot, Table2, UsersRound,
  LogOut, BookOpen, Cpu, FolderOpen,
  Telescope, Megaphone, Settings, FlaskConical,
  LayoutDashboard,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

type InboundCounts = { emailNew: number; waNew: number }
type StageCounts   = { engaged: number; qualified: number; proposal: number; converted: number }

async function fetchInboundCounts(): Promise<InboundCounts> {
  try {
    const res = await fetch('/api/leads', { cache: 'no-store' })
    if (!res.ok) return { emailNew: 0, waNew: 0 }
    const raw = await res.json()
    const data: { status: string; source: string }[] = Array.isArray(raw) ? raw : []
    const emailSrc = new Set(['website_form', 'email', 'manual'])
    return {
      emailNew: data.filter(l => l.status === 'new' && emailSrc.has(l.source)).length,
      waNew:    data.filter(l => l.status === 'new' && l.source === 'whatsapp_click').length,
    }
  } catch { return { emailNew: 0, waNew: 0 } }
}

async function fetchStageCounts(): Promise<StageCounts> {
  try {
    const res = await fetch('/api/contacts/counts', { cache: 'no-store' })
    if (!res.ok) return { engaged: 0, qualified: 0, proposal: 0, converted: 0 }
    const data = await res.json()
    return {
      engaged:   data.engaged   ?? 0,
      qualified: data.qualified ?? 0,
      proposal:  data.proposal  ?? 0,
      converted: data.converted ?? 0,
    }
  } catch { return { engaged: 0, qualified: 0, proposal: 0, converted: 0 } }
}

export default function Sidebar() {
  const pathname = usePathname()
  const router   = useRouter()
  const [inbound,       setInbound]       = useState<InboundCounts>({ emailNew: 0, waNew: 0 })
  const [stages,        setStages]        = useState<StageCounts>({ engaged: 0, qualified: 0, proposal: 0, converted: 0 })
  const [captureOpen,   setCaptureOpen]   = useState(true)
  const [outboundOpen,  setOutboundOpen]  = useState(true)
  const [engageOpen,    setEngageOpen]    = useState(true)
  const [analyticsOpen, setAnalyticsOpen] = useState(true)
  const [collapsed,     setCollapsed]     = useState(false)
  const [userEmail,     setUserEmail]     = useState<string | null>(null)

  useEffect(() => {
    const load = () => {
      fetchInboundCounts().then(setInbound)
      fetchStageCounts().then(setStages)
    }
    load()
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null))
  }, [])

  useEffect(() => {
    if (localStorage.getItem('sidebar-collapsed') === 'true') setCollapsed(true)
  }, [])

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-width', collapsed ? '52px' : '256px')
    localStorage.setItem('sidebar-collapsed', String(collapsed))
  }, [collapsed])

  async function signOut() {
    await createClient().auth.signOut()
    router.push('/login')
  }

  function active(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  const totalEngaged = stages.engaged + stages.qualified + stages.proposal + stages.converted

  // ── Collapsed (icon-rail) mode ─────────────────────────────────────────────
  if (collapsed) {
    return (
      <aside
        className="hidden lg:flex fixed inset-y-0 left-0 flex-col z-40 glass-sidebar"
        style={{ width: 52, overflowY: 'hidden' }}
      >
        {/* Logo */}
        <div className="h-14 flex items-center justify-center flex-shrink-0 border-b border-[--border-subtle]">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'hsl(var(--sidebar-ring))', boxShadow: '0 0 0 2px var(--primary-focus-ring)' }}
          >
            <span className="text-[10px] font-black text-white tracking-tight">TRS</span>
          </div>
        </div>

        {/* Expand button */}
        <button
          onClick={() => setCollapsed(false)}
          title="Expand sidebar"
          aria-label="Expand sidebar"
          className="flex-shrink-0 h-8 w-full flex items-center justify-center cursor-pointer text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors border-b border-[--border-subtle]"
        >
          <ChevronRight size={13} strokeWidth={2} />
        </button>

        {/* Icon-only nav */}
        <nav className="flex-1 overflow-y-auto py-2 flex flex-col items-center gap-px">
          <CollapsedIcon icon={LayoutDashboard} href="/" isActive={pathname === '/'}       label="Home" />
          <CollapsedIcon icon={BookOpen}        href="/overview" isActive={active('/overview')} label="Overview" />
          <IconDivider />
          <CollapsedIcon icon={Mail}          href="/inbound/email"    isActive={active('/inbound/email')}    label="Email"    hasBadge={inbound.emailNew > 0} />
          <CollapsedIcon icon={MessageCircle} href="/inbound/whatsapp" isActive={active('/inbound/whatsapp')} label="WhatsApp" hasBadge={inbound.waNew > 0} />
          <IconDivider />
          <CollapsedIcon icon={Telescope}     href="/outbound/agent"     isActive={active('/outbound/agent')}     label="Lead Discovery" />
          <CollapsedIcon icon={Table2}        href="/outbound/leads"     isActive={active('/outbound/leads')}     label="Lead Database" />
          <CollapsedIcon icon={Megaphone}     href="/outbound/campaigns" isActive={active('/outbound/campaigns')} label="Campaigns" />
          <CollapsedIcon icon={MessageCircle} href="/outbound/replies"   isActive={active('/outbound/replies')}   label="Reply Review" />
          <IconDivider />
          <CollapsedIcon icon={Users} href="/contacts"   isActive={active('/contacts')}   label="Active Contacts"  hasBadge={totalEngaged > 0} />
          <CollapsedIcon icon={Bot}   href="/engagement" isActive={active('/engagement')} label="Engagement Agent" />
          <IconDivider />
          <CollapsedIcon icon={Cpu}          href="/analytics/ai-usage"  isActive={active('/analytics/ai-usage')}  label="AI Usage" />
          <CollapsedIcon icon={FolderOpen}   href="/analytics/rag-index" isActive={active('/analytics/rag-index')} label="RAG Index" />
          <CollapsedIcon icon={FlaskConical} href="/analytics/eval"      isActive={active('/analytics/eval')}      label="Email Evaluation" />
          <IconDivider />
          <CollapsedIcon icon={Settings} href="/settings" isActive={active('/settings')} label="Settings" />
        </nav>

        {/* Footer */}
        <div className="border-t border-[--border-subtle] py-3 flex flex-col items-center gap-2 flex-shrink-0">
          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold text-accent-foreground">
            {userEmail ? userEmail[0].toUpperCase() : '?'}
          </div>
          <button
            onClick={signOut}
            title="Sign out"
            aria-label="Sign out"
            className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <LogOut size={13} strokeWidth={2} />
          </button>
        </div>
      </aside>
    )
  }

  // ── Expanded mode ──────────────────────────────────────────────────────────
  return (
    <aside
      className="hidden lg:flex fixed inset-y-0 left-0 flex-col z-40 overflow-y-auto glass-sidebar"
      style={{ width: 'var(--sidebar-width)' }}
    >
      {/* ── Logo / Brand ── */}
      <div className="flex items-center gap-3 px-4 h-14 flex-shrink-0 border-b border-[--border-subtle]">
        <div
          className="flex items-center justify-center rounded-lg flex-shrink-0"
          style={{ width: 32, height: 32, background: 'hsl(var(--sidebar-ring))', boxShadow: '0 0 0 2px var(--primary-focus-ring)' }}
        >
          <span className="text-[10px] font-black text-white tracking-tight">TRS</span>
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[13px] font-semibold leading-tight tracking-tight text-foreground">
            Trade Risk Solutions
          </span>
          <span className="text-[10.5px] leading-tight text-muted-foreground/70">
            Internal Dashboard
          </span>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
          className="p-1.5 rounded-md text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent transition-all flex-shrink-0"
        >
          <ChevronLeft size={14} strokeWidth={2} />
        </button>
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 px-2 py-3 space-y-px">

        {/* Top-level items */}
        <NavItem label="Home"     href="/"        icon={LayoutDashboard} isActive={pathname === '/'} />
        <NavItem label="Overview" href="/overview" icon={BookOpen}        isActive={active('/overview')} />

        <SectionDivider />

        <SectionHeader
          label="Inbound Leads"
          open={captureOpen}
          onToggle={() => setCaptureOpen(o => !o)}
          badge={(inbound.emailNew + inbound.waNew) || undefined}
        />
        {captureOpen && (
          <div className="space-y-px">
            <NavItem label="Email"    href="/inbound/email"    icon={Mail}          badge={inbound.emailNew} isActive={active('/inbound/email')} />
            <NavItem label="WhatsApp" href="/inbound/whatsapp" icon={MessageCircle} badge={inbound.waNew}    isActive={active('/inbound/whatsapp')} />
          </div>
        )}

        <SectionDivider />

        <SectionHeader label="Outbound Leads" open={outboundOpen} onToggle={() => setOutboundOpen(o => !o)} />
        {outboundOpen && (
          <div className="space-y-px">
            <NavItem label="Lead Discovery" href="/outbound/agent"     icon={Telescope}     isActive={active('/outbound/agent')} />
            <NavItem label="Lead Database"  href="/outbound/leads"     icon={Table2}        isActive={active('/outbound/leads')} />
            <NavItem label="Campaigns"      href="/outbound/campaigns" icon={Megaphone}     isActive={active('/outbound/campaigns')} />
            <NavItem label="Reply Review"   href="/outbound/replies"   icon={MessageCircle} isActive={active('/outbound/replies')} />
          </div>
        )}

        <SectionDivider />

        <SectionHeader
          label="Engagement"
          open={engageOpen}
          onToggle={() => setEngageOpen(o => !o)}
          badge={totalEngaged || undefined}
        />
        {engageOpen && (
          <div className="space-y-px">
            <NavItem label="Active Contacts" href="/contacts"   icon={Users} badge={totalEngaged || undefined} isActive={active('/contacts')} />
            {totalEngaged > 0 && (
              <div className="flex flex-wrap gap-1 pl-7 pb-1 pt-0.5">
                {stages.engaged   > 0 && <StagePill label="Engaged"   count={stages.engaged}   color="#0F3D91" />}
                {stages.qualified > 0 && <StagePill label="Qualified" count={stages.qualified} color="#0a6e4b" />}
                {stages.proposal  > 0 && <StagePill label="Proposal"  count={stages.proposal}  color="#b45309" />}
                {stages.converted > 0 && <StagePill label="Converted" count={stages.converted} color="#0F8A5F" />}
              </div>
            )}
            <NavItem label="Engagement Agent" href="/engagement" icon={Bot} isActive={active('/engagement')} />
          </div>
        )}

        <SectionDivider />

        <SectionHeader label="Analytics" open={analyticsOpen} onToggle={() => setAnalyticsOpen(o => !o)} />
        {analyticsOpen && (
          <div className="space-y-px">
            <NavItem label="Funnel"           href="/analytics"           icon={BarChart2}    isActive={active('/analytics') && !active('/analytics/ai-usage') && !active('/analytics/activity') && !active('/analytics/eval') && !active('/analytics/rag-index')} disabled />
            <NavItem label="Activity Log"     href="/analytics/activity"  icon={UsersRound}   isActive={active('/analytics/activity')} disabled />
            <NavItem label="AI Usage"         href="/analytics/ai-usage"  icon={Cpu}          isActive={active('/analytics/ai-usage')} />
            <NavItem label="RAG Index"        href="/analytics/rag-index" icon={FolderOpen}   isActive={active('/analytics/rag-index')} />
            <NavItem label="Email Evaluation" href="/analytics/eval"      icon={FlaskConical} isActive={active('/analytics/eval')} />
          </div>
        )}

        <SectionDivider />

        <NavItem label="Claims"   href="/claims"   icon={AlertCircle} isActive={active('/claims')}   disabled />
        <NavItem label="Settings" href="/settings" icon={Settings}    isActive={active('/settings')} />

      </nav>

      {/* ── Footer ── */}
      <div className="flex items-center gap-2.5 px-3 py-3 flex-shrink-0 border-t border-[--border-subtle]">
        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold text-accent-foreground flex-shrink-0">
          {userEmail ? userEmail[0].toUpperCase() : '?'}
        </div>
        <span className="text-[11.5px] flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-muted-foreground">
          {userEmail ?? '—'}
        </span>
        <button
          onClick={signOut}
          title="Sign out"
          aria-label="Sign out"
          className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors flex-shrink-0"
        >
          <LogOut size={13} strokeWidth={2} />
        </button>
      </div>
    </aside>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionDivider() {
  return <div className="my-2 h-px bg-[--border-subtle]" />
}

function SectionHeader({
  label, open, onToggle, badge,
}: {
  label: string; open: boolean; onToggle: () => void; badge?: number
}) {
  return (
    <button
      onClick={onToggle}
      aria-expanded={open}
      className="flex items-center gap-2 w-full h-7 px-2.5 rounded-md text-left hover:bg-accent hover:text-accent-foreground transition-colors"
    >
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.07em] flex-1 text-muted-foreground">
        {label}
      </span>
      {badge !== undefined && badge > 0 && <NavBadge count={badge} />}
      {open
        ? <ChevronDown  size={11} strokeWidth={2.5} className="text-muted-foreground/60 flex-shrink-0" />
        : <ChevronRight size={11} strokeWidth={2.5} className="text-muted-foreground/60 flex-shrink-0" />
      }
    </button>
  )
}

function NavItem({
  label, href, icon: Icon, badge, isActive, disabled,
}: {
  label: string; href: string; icon: React.ElementType
  badge?: number; isActive: boolean; disabled?: boolean
}) {
  const row = (
    <span
      className={cn(
        'flex items-center gap-2.5 h-8 rounded-md w-full transition-all duration-100 pr-2.5',
        'text-[12.5px] tracking-tight leading-none',
        isActive && [
          'bg-accent text-accent-foreground font-medium',
          'border-l-2 border-primary pl-2',
        ],
        !isActive && !disabled && [
          'text-muted-foreground',
          'hover:bg-accent hover:text-accent-foreground',
          'border-l-2 border-transparent pl-2.5',
        ],
        disabled && [
          'text-muted-foreground/35 pointer-events-none',
          'border-l-2 border-transparent pl-2.5',
        ],
      )}
    >
      <Icon
        size={14}
        strokeWidth={isActive ? 2.2 : 1.7}
        className="flex-shrink-0"
      />
      <span className="flex-1 truncate">{label}</span>
      {badge !== undefined && badge > 0 && <NavBadge count={badge} />}
      {disabled && (
        <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground/50 flex-shrink-0">
          Soon
        </span>
      )}
    </span>
  )

  return disabled ? (
    <div className="block">{row}</div>
  ) : (
    <Link href={href} className="block no-underline rounded-md" aria-current={isActive ? 'page' : undefined}>
      {row}
    </Link>
  )
}

function NavBadge({ count }: { count: number }) {
  return (
    <span className="flex items-center justify-center text-[10px] font-bold rounded-full px-1.5 min-w-[18px] h-[18px] flex-shrink-0 bg-primary text-primary-foreground">
      {count > 99 ? '99+' : count}
    </span>
  )
}

function StagePill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-medium rounded-full px-2 py-0.5 border"
      style={{ color, background: `${color}14`, borderColor: `${color}28`, letterSpacing: '0.01em' }}
    >
      <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: color }} />
      {label} <span className="font-bold">{count}</span>
    </span>
  )
}

// ── Collapsed-mode icon components ─────────────────────────────────────────────

function CollapsedIcon({
  icon: Icon, href, isActive, label, hasBadge, disabled,
}: {
  icon: React.ElementType; href: string; isActive: boolean
  label: string; hasBadge?: boolean; disabled?: boolean
}) {
  const inner = (
    <span
      title={label}
      className={cn(
        'relative flex items-center justify-center rounded-lg transition-colors',
        isActive
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        disabled && 'opacity-35 pointer-events-none',
      )}
      style={{ width: 36, height: 36 }}
    >
      <Icon
        size={16}
        strokeWidth={isActive ? 2.2 : 1.8}
        className="flex-shrink-0"
      />
      {hasBadge && (
        <span className="absolute top-[7px] right-[7px] w-1.5 h-1.5 rounded-full bg-primary border-2 border-white" />
      )}
    </span>
  )

  return disabled
    ? <div>{inner}</div>
    : <Link href={href} className="no-underline" aria-current={isActive ? 'page' : undefined}>{inner}</Link>
}

function IconDivider() {
  return <div className="w-7 h-px my-0.5 bg-[--border-subtle]" />
}
