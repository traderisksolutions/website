'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Mail, MessageCircle, AlertCircle,
  Users, BarChart2,
  Search, ChevronRight, ChevronDown,
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
  const [inbound,      setInbound]      = useState<InboundCounts>({ emailNew: 0, waNew: 0 })
  const [stages,       setStages]       = useState<StageCounts>({ engaged: 0, qualified: 0, proposal: 0, converted: 0 })
  const [captureOpen,  setCaptureOpen]  = useState(true)
  const [outboundOpen, setOutboundOpen] = useState(true)
  const [engageOpen,   setEngageOpen]   = useState(true)
  const [userEmail,    setUserEmail]    = useState<string | null>(null)

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

  async function signOut() {
    await createClient().auth.signOut()
    router.push('/login')
  }

  function active(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  const totalEngaged = stages.engaged + stages.qualified + stages.proposal + stages.converted

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
        <div className="flex flex-col min-w-0">
          <span className="text-[13px] font-semibold leading-tight tracking-tight"
            style={{ color: 'hsl(var(--sidebar-primary))' }}
          >
            Trade Risk Solutions
          </span>
          <span className="text-[11px] leading-tight" style={{ color: 'hsl(var(--sidebar-fg))' }}>
            Internal Dashboard
          </span>
        </div>
      </div>

      {/* ── Search ── */}
      <div className="px-3 pt-3 pb-1 flex-shrink-0">
        <div className="flex items-center gap-2 rounded-md px-3 h-8 cursor-pointer group"
          style={{ background: 'var(--neutral-status-bg)', border: '1px solid var(--border-subtle)' }}
        >
          <Search size={12} style={{ color: 'hsl(var(--sidebar-fg))' }} />
          <span className="text-[12px] flex-1" style={{ color: 'hsl(var(--sidebar-fg))' }}>Search...</span>
          <kbd className="text-[10px] rounded px-1" style={{ background: 'rgba(0,0,0,0.07)', color: 'hsl(var(--sidebar-fg))' }}>F</kbd>
        </div>
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

        {/* Analytics */}
        <p className="px-2.5 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: 'hsl(var(--sidebar-fg))' }}
        >
          Analytics
        </p>
        <NavItem label="Funnel"           href="/analytics"          icon={BarChart2}   isActive={active('/analytics') && !active('/analytics/ai-usage') && !active('/analytics/activity') && !active('/analytics/eval') && !active('/analytics/rag-index')} disabled />
        <NavItem label="Activity Log"     href="/analytics/activity" icon={UsersRound}  isActive={active('/analytics/activity')} disabled />
        <NavItem label="AI Usage"         href="/analytics/ai-usage" icon={Cpu}         isActive={active('/analytics/ai-usage')} />
        <NavItem label="RAG Index"        href="/analytics/rag-index" icon={FolderOpen} isActive={active('/analytics/rag-index')} />
        <NavItem label="Email Evaluation" href="/analytics/eval"     icon={FlaskConical} isActive={active('/analytics/eval')} />

        <SectionDivider />

        {/* Claims */}
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
