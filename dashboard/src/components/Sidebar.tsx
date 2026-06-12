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
  Telescope, Megaphone, BookMarked, Settings, FlaskConical,
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

  // Restore collapsed state from localStorage on mount
  useEffect(() => {
    if (localStorage.getItem('sidebar-collapsed') === 'true') setCollapsed(true)
  }, [])

  // Sync CSS variable and localStorage whenever collapsed changes
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
      <aside className="fixed inset-y-0 left-0 flex flex-col z-40 glass-sidebar"
        style={{ width: 52, overflowY: 'hidden' }}
      >
        {/* Logo */}
        <div style={{ height: 52, borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'hsl(var(--sidebar-ring))', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 2px var(--primary-focus-ring)' }}>
            <span style={{ fontSize: 10, fontWeight: 900, color: '#fff', letterSpacing: '-0.03em' }}>TRS</span>
          </div>
        </div>

        {/* Expand button — sits directly below logo */}
        <button
          onClick={() => setCollapsed(false)}
          title="Expand sidebar"
          style={{ flexShrink: 0, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', width: '100%', color: 'hsl(var(--sidebar-fg))' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'hsl(var(--sidebar-accent))')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          <ChevronRight size={13} strokeWidth={2} />
        </button>

        {/* Icon-only nav */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          <CollapsedIcon icon={BookOpen} href="/documentation" isActive={active('/documentation')} label="Overview" />
          <IconDivider />
          <CollapsedIcon icon={Mail}          href="/inbound/email"    isActive={active('/inbound/email')}    label="Email"    hasBadge={inbound.emailNew > 0} />
          <CollapsedIcon icon={MessageCircle} href="/inbound/whatsapp" isActive={active('/inbound/whatsapp')} label="WhatsApp" hasBadge={inbound.waNew > 0} />
          <IconDivider />
          <CollapsedIcon icon={Telescope}  href="/outbound/agent"     isActive={active('/outbound/agent')}     label="Lead Discovery" />
          <CollapsedIcon icon={Table2}     href="/outbound/leads"     isActive={active('/outbound/leads')}     label="Lead Database" />
          <CollapsedIcon icon={Megaphone}  href="/outbound/campaigns" isActive={active('/outbound/campaigns')} label="Campaigns" />
          <CollapsedIcon icon={BookMarked} href="/outbound/knowledge" isActive={active('/outbound/knowledge')} label="Product Knowledge" />
          <IconDivider />
          <CollapsedIcon icon={Users} href="/contacts"  isActive={active('/contacts')}  label="Active Contacts" hasBadge={totalEngaged > 0} />
          <CollapsedIcon icon={Bot}   href="/engagement" isActive={active('/engagement')} label="Engagement AI Agent" />
          <IconDivider />
          <CollapsedIcon icon={Cpu}         href="/analytics/ai-usage"  isActive={active('/analytics/ai-usage')}  label="AI Usage" />
          <CollapsedIcon icon={FolderOpen}  href="/analytics/rag-index" isActive={active('/analytics/rag-index')} label="RAG Index" />
          <CollapsedIcon icon={FlaskConical} href="/analytics/eval"     isActive={active('/analytics/eval')}      label="Email Evaluation" />
          <IconDivider />
          <CollapsedIcon icon={Settings} href="/settings" isActive={active('/settings')} label="Settings" />
        </nav>

        {/* Footer */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '10px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'hsl(var(--sidebar-primary))' }}>
            {userEmail ? userEmail[0].toUpperCase() : '?'}
          </div>
          <button onClick={signOut} title="Sign out" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'hsl(var(--sidebar-fg))', display: 'flex', alignItems: 'center' }}>
            <LogOut size={13} strokeWidth={2} />
          </button>
        </div>
      </aside>
    )
  }

  // ── Expanded mode ──────────────────────────────────────────────────────────
  return (
    <aside className="fixed inset-y-0 left-0 flex flex-col z-40 overflow-y-auto glass-sidebar"
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
            style={{ color: 'hsl(var(--sidebar-primary))' }}
          >
            Trade Risk Solutions
          </span>
          <span className="text-[11px] leading-tight" style={{ color: 'hsl(var(--sidebar-fg))' }}>
            Internal Dashboard
          </span>
        </div>
        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(true)}
          title="Collapse sidebar"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'hsl(var(--sidebar-fg))', display: 'flex', alignItems: 'center', flexShrink: 0, borderRadius: 6, opacity: 0.6 }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'hsl(var(--sidebar-accent))' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.background = 'none' }}
        >
          <ChevronLeft size={14} strokeWidth={2} />
        </button>
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 px-2 py-2 space-y-0.5">

        {/* Overview */}
        <NavItem label="Overview" href="/documentation" icon={BookOpen} isActive={active('/documentation')} />

        <SectionDivider />

        {/* Inbound Leads */}
        <SectionHeader
          label="Inbound Leads"
          open={captureOpen}
          onToggle={() => setCaptureOpen(o => !o)}
          badge={(inbound.emailNew + inbound.waNew) || undefined}
        />
        {captureOpen && (
          <div className="space-y-0.5">
            <NavItem label="Email"    href="/inbound/email"    icon={Mail}          badge={inbound.emailNew} isActive={active('/inbound/email')} />
            <NavItem label="WhatsApp" href="/inbound/whatsapp" icon={MessageCircle} badge={inbound.waNew}    isActive={active('/inbound/whatsapp')} />
          </div>
        )}

        <SectionDivider />

        {/* Outbound Leads */}
        <SectionHeader label="Outbound Leads" open={outboundOpen} onToggle={() => setOutboundOpen(o => !o)} />
        {outboundOpen && (
          <div className="space-y-0.5">
            <NavItem label="Lead Discovery"    href="/outbound/agent"     icon={Telescope}  isActive={active('/outbound/agent')} />
            <NavItem label="Lead Database"     href="/outbound/leads"     icon={Table2}     isActive={active('/outbound/leads')} />
            <NavItem label="Campaigns"         href="/outbound/campaigns" icon={Megaphone}  isActive={active('/outbound/campaigns')} />
            <NavItem label="Product Knowledge" href="/outbound/knowledge" icon={BookMarked} isActive={active('/outbound/knowledge')} />
          </div>
        )}

        <SectionDivider />

        {/* Engagement */}
        <SectionHeader
          label="Engagement"
          open={engageOpen}
          onToggle={() => setEngageOpen(o => !o)}
          badge={totalEngaged || undefined}
        />
        {engageOpen && (
          <div className="space-y-0.5">
            <NavItem label="Active Contacts"      href="/contacts"   icon={Users} badge={totalEngaged || undefined} isActive={active('/contacts')} />
            {totalEngaged > 0 && (
              <div className="flex flex-wrap gap-1 pl-7 pb-1">
                {stages.engaged   > 0 && <StagePill label="Engaged"   count={stages.engaged}   color="#0F3D91" />}
                {stages.qualified > 0 && <StagePill label="Qualified" count={stages.qualified} color="#475467" />}
                {stages.proposal  > 0 && <StagePill label="Proposal"  count={stages.proposal}  color="#C27A07" />}
                {stages.converted > 0 && <StagePill label="Converted" count={stages.converted} color="#0F8A5F" />}
              </div>
            )}
            <NavItem label="Engagement AI Agent" href="/engagement" icon={Bot} isActive={active('/engagement')} />
          </div>
        )}

        <SectionDivider />

        {/* Analytics — now collapsible */}
        <SectionHeader label="Analytics" open={analyticsOpen} onToggle={() => setAnalyticsOpen(o => !o)} />
        {analyticsOpen && (
          <div className="space-y-0.5">
            <NavItem label="Funnel"           href="/analytics"           icon={BarChart2}    isActive={active('/analytics') && !active('/analytics/ai-usage') && !active('/analytics/activity') && !active('/analytics/eval') && !active('/analytics/rag-index')} disabled />
            <NavItem label="Activity Log"     href="/analytics/activity"  icon={UsersRound}   isActive={active('/analytics/activity')} disabled />
            <NavItem label="AI Usage"         href="/analytics/ai-usage"  icon={Cpu}          isActive={active('/analytics/ai-usage')} />
            <NavItem label="RAG Index"        href="/analytics/rag-index" icon={FolderOpen}   isActive={active('/analytics/rag-index')} />
            <NavItem label="Email Evaluation" href="/analytics/eval"      icon={FlaskConical} isActive={active('/analytics/eval')} />
          </div>
        )}

        <SectionDivider />

        {/* Claims / Settings */}
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
          style={{ color: 'hsl(var(--sidebar-fg))' }}
        >
          {userEmail ?? '—'}
        </span>
        <button
          onClick={signOut}
          title="Sign out"
          className="p-1.5 rounded-md transition-colors flex-shrink-0"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--sidebar-fg))' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'hsl(var(--sidebar-accent))')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          <LogOut size={13} strokeWidth={2} />
        </button>
      </div>
    </aside>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionDivider() {
  return (
    <div className="my-2 mx-2 h-px" style={{ background: 'var(--border-subtle)' }} />
  )
}

function SectionHeader({
  label, open, onToggle, badge,
}: {
  label: string; open: boolean; onToggle: () => void; badge?: number
}) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-2 w-full h-8 px-2.5 rounded-md text-left transition-colors"
      style={{ background: 'none', border: 'none', cursor: 'pointer' }}
    >
      <span className="text-[10px] font-semibold uppercase tracking-widest flex-1"
        style={{ color: 'hsl(var(--sidebar-fg))' }}
      >
        {label}
      </span>
      {badge !== undefined && badge > 0 && <NavBadge count={badge} />}
      {open
        ? <ChevronDown  size={12} strokeWidth={2} style={{ color: 'hsl(var(--sidebar-fg))', flexShrink: 0 }} />
        : <ChevronRight size={12} strokeWidth={2} style={{ color: 'hsl(var(--sidebar-fg))', flexShrink: 0 }} />
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
        'sb-row flex items-center gap-2.5 px-2.5 h-8 rounded-md w-full transition-all duration-150',
        isActive && 'font-medium',
        disabled && 'pointer-events-none',
      )}
      style={{
        background: isActive ? 'hsl(var(--sidebar-accent))' : 'transparent',
        color: disabled
          ? 'hsl(var(--sidebar-fg) / 0.35)'
          : isActive
          ? 'hsl(var(--sidebar-ring))'
          : 'hsl(var(--sidebar-fg))',
        textDecoration: 'none',
        borderLeft: isActive ? '2px solid hsl(var(--sidebar-ring))' : '2px solid transparent',
        paddingLeft: isActive ? '8px' : '10px',
      }}
    >
      <Icon
        size={14}
        strokeWidth={isActive ? 2.2 : 1.8}
        style={{
          flexShrink: 0,
          color: disabled
            ? 'hsl(var(--sidebar-fg) / 0.25)'
            : isActive
            ? 'hsl(var(--sidebar-ring))'
            : 'hsl(var(--sidebar-fg))',
        }}
      />
      <span className="text-[12.5px] flex-1 tracking-tight leading-none">
        {label}
      </span>
      {badge !== undefined && badge > 0 && <NavBadge count={badge} />}
      {disabled && (
        <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
          style={{ background: 'hsl(var(--sidebar-border))', color: 'hsl(var(--sidebar-fg) / 0.5)' }}
        >
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
      style={{ background: 'hsl(var(--sidebar-ring))', color: '#fff' }}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

function StagePill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium rounded-full px-2 py-0.5 border"
      style={{ color, background: `${color}18`, borderColor: `${color}30`, letterSpacing: '0.01em' }}
    >
      {label} {count}
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
      style={{
        width: 36, height: 36, borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: isActive ? 'hsl(var(--sidebar-accent))' : 'transparent',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        position: 'relative',
        transition: 'background 0.1s',
      }}
    >
      <Icon
        size={16}
        strokeWidth={isActive ? 2.2 : 1.8}
        style={{ color: isActive ? 'hsl(var(--sidebar-ring))' : 'hsl(var(--sidebar-fg))' }}
      />
      {hasBadge && (
        <span style={{
          position: 'absolute', top: 7, right: 7,
          width: 6, height: 6, borderRadius: '50%',
          background: 'hsl(var(--sidebar-ring))',
          border: '1px solid #fff',
        }} />
      )}
    </span>
  )

  return disabled
    ? <div>{inner}</div>
    : <Link href={href} className="no-underline">{inner}</Link>
}

function IconDivider() {
  return <div style={{ width: 28, height: 1, background: 'var(--border-subtle)', margin: '3px 0' }} />
}
