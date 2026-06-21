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
    document.documentElement.style.setProperty('--sidebar-width', collapsed ? '52px' : '240px')
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
      <aside className="hidden lg:flex fixed inset-y-0 left-0 flex-col z-40 glass-sidebar"
        style={{ width: 52, overflowY: 'hidden' }}
      >
        {/* Logo */}
        <div className="h-[52px] flex items-center justify-center flex-shrink-0 border-b border-[--border-subtle]">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'hsl(var(--sidebar-ring))', boxShadow: '0 0 0 2px var(--primary-focus-ring)' }}>
            <span className="text-[10px] font-black text-white tracking-tight">TRS</span>
          </div>
        </div>

        {/* Expand button */}
        <button
          onClick={() => setCollapsed(false)}
          title="Expand sidebar"
          className="flex-shrink-0 h-8 flex items-center justify-center border-b border-[--border-subtle] cursor-pointer text-[--sidebar-fg] transition-colors hover:bg-accent w-full"
          style={{ background: 'none', border: 'none', borderBottom: '1px solid var(--border-subtle)' }}
        >
          <ChevronRight size={13} strokeWidth={2} className="text-muted-foreground" />
        </button>

        {/* Icon-only nav */}
        <nav className="flex-1 overflow-y-auto py-2 flex flex-col items-center gap-px">
          <CollapsedIcon icon={BookOpen} href="/documentation" isActive={active('/documentation')} label="Overview" />
          <IconDivider />
          <CollapsedIcon icon={Mail}          href="/inbound/email"    isActive={active('/inbound/email')}    label="Email"    hasBadge={inbound.emailNew > 0} />
          <CollapsedIcon icon={MessageCircle} href="/inbound/whatsapp" isActive={active('/inbound/whatsapp')} label="WhatsApp" hasBadge={inbound.waNew > 0} />
          <IconDivider />
          <CollapsedIcon icon={Telescope}     href="/outbound/agent"     isActive={active('/outbound/agent')}     label="Lead Discovery" />
          <CollapsedIcon icon={Table2}        href="/outbound/leads"     isActive={active('/outbound/leads')}     label="Lead Database" />
          <CollapsedIcon icon={Megaphone}     href="/outbound/campaigns" isActive={active('/outbound/campaigns')} label="Campaigns" />
          <CollapsedIcon icon={MessageCircle} href="/outbound/replies"   isActive={active('/outbound/replies')}   label="Reply Review" />
          <IconDivider />
          <CollapsedIcon icon={Users} href="/contacts"   isActive={active('/contacts')}   label="Active Contacts" hasBadge={totalEngaged > 0} />
          <CollapsedIcon icon={Bot}   href="/engagement" isActive={active('/engagement')} label="Engagement AI Agent" />
          <IconDivider />
          <CollapsedIcon icon={Cpu}         href="/analytics/ai-usage"  isActive={active('/analytics/ai-usage')}  label="AI Usage" />
          <CollapsedIcon icon={FolderOpen}  href="/analytics/rag-index" isActive={active('/analytics/rag-index')} label="RAG Index" />
          <CollapsedIcon icon={FlaskConical} href="/analytics/eval"     isActive={active('/analytics/eval')}      label="Email Evaluation" />
          <IconDivider />
          <CollapsedIcon icon={Settings} href="/settings" isActive={active('/settings')} label="Settings" />
        </nav>

        {/* Footer */}
        <div className="border-t border-[--border-subtle] py-2.5 flex flex-col items-center gap-1.5 flex-shrink-0"
          style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <div className="w-7 h-7 rounded-full bg-black/[0.06] flex items-center justify-center text-[11px] font-bold"
            style={{ color: 'hsl(var(--sidebar-primary))' }}>
            {userEmail ? userEmail[0].toUpperCase() : '?'}
          </div>
          <button onClick={signOut} title="Sign out"
            className="p-1 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <LogOut size={13} strokeWidth={2} />
          </button>
        </div>
      </aside>
    )
  }

  // ── Expanded mode ──────────────────────────────────────────────────────────
  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 flex-col z-40 overflow-y-auto glass-sidebar"
      style={{ width: 'var(--sidebar-width)' }}
    >
      {/* ── Logo / Brand ── */}
      <div className="flex items-center gap-3 px-4 h-[52px] flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-center justify-center rounded-lg flex-shrink-0"
          style={{ width: 32, height: 32, background: 'hsl(var(--sidebar-ring))', boxShadow: '0 0 0 2px var(--primary-focus-ring)' }}
        >
          <span className="text-[10px] font-black text-white tracking-tight">TRS</span>
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[13px] font-semibold leading-tight tracking-tight"
            style={{ color: 'hsl(var(--sidebar-primary))' }}>
            Trade Risk Solutions
          </span>
          <span className="text-[10px] leading-tight" style={{ color: 'hsl(var(--sidebar-fg))' }}>
            Internal Dashboard
          </span>
        </div>
        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(true)}
          title="Collapse sidebar"
          className="p-1 rounded-md opacity-50 hover:opacity-100 hover:bg-accent transition-all flex-shrink-0 text-muted-foreground"
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          <ChevronLeft size={14} strokeWidth={2} />
        </button>
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 px-2 py-2.5 space-y-px">

        <NavItem label="Overview" href="/documentation" icon={BookOpen} isActive={active('/documentation')} />

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
            <NavItem label="Active Contacts"      href="/contacts"   icon={Users} badge={totalEngaged || undefined} isActive={active('/contacts')} />
            {totalEngaged > 0 && (
              <div className="flex flex-wrap gap-1 pl-7 pb-1 pt-0.5">
                {stages.engaged   > 0 && <StagePill label="Engaged"   count={stages.engaged}   color="#0F3D91" />}
                {stages.qualified > 0 && <StagePill label="Qualified" count={stages.qualified} color="#0a6e4b" />}
                {stages.proposal  > 0 && <StagePill label="Proposal"  count={stages.proposal}  color="#b45309" />}
                {stages.converted > 0 && <StagePill label="Converted" count={stages.converted} color="#0F8A5F" />}
              </div>
            )}
            <NavItem label="Engagement AI Agent" href="/engagement" icon={Bot} isActive={active('/engagement')} />
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
      <div className="flex items-center gap-2.5 px-3 py-3 flex-shrink-0"
        style={{ borderTop: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-center justify-center rounded-full flex-shrink-0 text-[11px] font-bold"
          style={{ width: 28, height: 28, background: 'rgba(0,0,0,0.06)', color: 'hsl(var(--sidebar-primary))' }}
        >
          {userEmail ? userEmail[0].toUpperCase() : '?'}
        </div>
        <span className="text-[11px] flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
          style={{ color: 'hsl(var(--sidebar-fg))' }}>
          {userEmail ?? '—'}
        </span>
        <button
          onClick={signOut}
          title="Sign out"
          className="p-1.5 rounded-md hover:bg-accent hover:text-foreground transition-colors text-muted-foreground flex-shrink-0"
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <LogOut size={13} strokeWidth={2} />
        </button>
      </div>
    </aside>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionDivider() {
  return <div className="my-2 mx-2 h-px bg-[--border-subtle]" style={{ background: 'var(--border-subtle)' }} />
}

function SectionHeader({
  label, open, onToggle, badge,
}: {
  label: string; open: boolean; onToggle: () => void; badge?: number
}) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-2 w-full h-7 px-2.5 rounded-md text-left hover:bg-accent transition-colors"
      style={{ background: 'none', border: 'none', cursor: 'pointer' }}
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.07em] flex-1"
        style={{ color: 'hsl(var(--sidebar-fg))' }}>
        {label}
      </span>
      {badge !== undefined && badge > 0 && <NavBadge count={badge} />}
      {open
        ? <ChevronDown  size={11} strokeWidth={2.5} style={{ color: 'hsl(var(--sidebar-fg))', flexShrink: 0 }} />
        : <ChevronRight size={11} strokeWidth={2.5} style={{ color: 'hsl(var(--sidebar-fg))', flexShrink: 0 }} />
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
        'sb-row flex items-center gap-2.5 px-2.5 h-8 rounded-md w-full transition-all duration-100',
        isActive && 'font-medium',
        disabled && 'pointer-events-none',
      )}
      style={{
        background:  isActive ? 'hsl(var(--sidebar-accent))' : 'transparent',
        color:       disabled ? 'hsl(var(--sidebar-fg) / 0.35)' : isActive ? 'hsl(var(--sidebar-ring))' : 'hsl(var(--sidebar-fg))',
        textDecoration: 'none',
        borderLeft:  isActive ? '2px solid hsl(var(--sidebar-ring))' : '2px solid transparent',
        paddingLeft: isActive ? '8px' : '10px',
      }}
    >
      <Icon
        size={14}
        strokeWidth={isActive ? 2.2 : 1.7}
        style={{
          flexShrink: 0,
          color: disabled
            ? 'hsl(var(--sidebar-fg) / 0.25)'
            : isActive ? 'hsl(var(--sidebar-ring))' : 'hsl(var(--sidebar-fg))',
        }}
      />
      <span className="text-[12.5px] flex-1 tracking-tight leading-none">{label}</span>
      {badge !== undefined && badge > 0 && <NavBadge count={badge} />}
      {disabled && (
        <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
          style={{ background: 'hsl(var(--sidebar-border))', color: 'hsl(var(--sidebar-fg) / 0.5)' }}>
          Soon
        </span>
      )}
    </span>
  )

  return disabled ? (
    <div className="block">{row}</div>
  ) : (
    <Link href={href} className="block no-underline">{row}</Link>
  )
}

function NavBadge({ count }: { count: number }) {
  return (
    <span className="flex items-center justify-center text-[10px] font-bold rounded-full px-1.5 min-w-[18px] h-[18px] flex-shrink-0"
      style={{ background: 'hsl(var(--sidebar-ring))', color: '#fff' }}>
      {count > 99 ? '99+' : count}
    </span>
  )
}

function StagePill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium rounded-full px-2 py-0.5 border"
      style={{ color, background: `${color}14`, borderColor: `${color}28`, letterSpacing: '0.01em' }}>
      <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: color }} />
      {label} <span className="font-bold">{count}</span>
    </span>
  )
}

// ── Collapsed-mode icon components ─────────────────────────────────────────────

function CollapsedIcon({
  icon: Icon, href, isActive, label, hasBadge, disabled,
}: {
  icon: React.ElementType; href: string; isActive: boolean; label: string; hasBadge?: boolean; disabled?: boolean
}) {
  const inner = (
    <span
      title={label}
      className={cn(
        'relative flex items-center justify-center rounded-lg transition-colors',
        isActive ? 'bg-accent' : 'hover:bg-accent',
        disabled && 'opacity-35 pointer-events-none',
      )}
      style={{ width: 36, height: 36 }}
    >
      <Icon
        size={16}
        strokeWidth={isActive ? 2.2 : 1.8}
        style={{ color: isActive ? 'hsl(var(--sidebar-ring))' : 'hsl(var(--sidebar-fg))' }}
      />
      {hasBadge && (
        <span className="absolute top-[7px] right-[7px] w-1.5 h-1.5 rounded-full border border-white"
          style={{ background: 'hsl(var(--sidebar-ring))' }} />
      )}
    </span>
  )

  return disabled
    ? <div>{inner}</div>
    : <Link href={href} className="no-underline">{inner}</Link>
}

function IconDivider() {
  return <div className="w-7 h-px my-0.5" style={{ background: 'var(--border-subtle)' }} />
}
