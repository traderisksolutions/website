'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Inbox, MessageCircle, AlertCircle,
  Users, BarChart2,
  ChevronRight, ChevronDown, ChevronLeft,
  Bot, Table2, UsersRound,
  LogOut, BookOpen, Cpu, FolderOpen, BookMarked, Radar, History,
  Telescope, Megaphone, Settings, FlaskConical,
  LayoutDashboard, TrendingUp, ScrollText, Network, HeartPulse, Car,
  Receipt, CalendarDays, PanelLeftClose, PanelLeft, ArrowLeft,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { EngagementFolderNav } from '@/components/engagement/EngagementFolderNav'
import { useNarrowViewport } from '@/hooks/useNarrowViewport'

type InboundCounts = { totalNew: number }
type StageCounts   = { engaged: number; qualified: number; proposal: number; converted: number }

// Routes with their own list+detail sub-navigation (a conversation/record list next to a
// detail view). Entering one of these auto-collapses the primary rail to icons-only so the
// list column gets the horizontal room it needs. /engagement is handled separately (see
// ENGAGEMENT_ROUTE below) — instead of collapsing, its rail content is swapped for
// EngagementFolderNav, so this array is currently empty but kept as the extension point for a
// future section that DOES want the plain auto-collapse behavior.
const LIST_DETAIL_ROUTES: string[] = []

// On this route the rail stays expanded but its content swaps to EngagementFolderNav (a
// filtered-view switcher for the conversation list) instead of the normal nav sections —
// mirrors TFE's email view swapping its sidebar content, adapted to this app's actual nav
// (which auto-collapses to icons elsewhere, unlike TFE's).
const ENGAGEMENT_ROUTE = '/engagement'

type SidebarMode = 'auto' | 'expanded' | 'collapsed'

function isListDetailRoute(pathname: string) {
  return LIST_DETAIL_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'))
}

async function fetchInboundCounts(): Promise<InboundCounts> {
  try {
    const res = await fetch('/api/leads', { cache: 'no-store' })
    if (!res.ok) return { totalNew: 0 }
    const raw = await res.json()
    const data: { status: string }[] = Array.isArray(raw) ? raw : []
    return { totalNew: data.filter(l => l.status === 'new').length }
  } catch { return { totalNew: 0 } }
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
  const [inbound,       setInbound]       = useState<InboundCounts>({ totalNew: 0 })
  const [stages,        setStages]        = useState<StageCounts>({ engaged: 0, qualified: 0, proposal: 0, converted: 0 })
  const [outboundOpen,  setOutboundOpen]  = useState(true)
  const [engageOpen,    setEngageOpen]    = useState(true)
  const [roadplusOpen,  setRoadplusOpen]  = useState(true)
  const [knowledgeOpen, setKnowledgeOpen] = useState(true)
  const [analyticsOpen, setAnalyticsOpen] = useState(true)
  const [vendorOpen,    setVendorOpen]    = useState(true)
  const [userEmail,     setUserEmail]     = useState<string | null>(null)

  // ── Collapse mode ────────────────────────────────────────────────────────
  // 'auto'      (default) — expanded normally, auto-collapses on list+detail routes.
  // 'expanded'  — user pinned the labeled rail open, overriding auto-collapse everywhere.
  // 'collapsed' — user explicitly collapsed the rail, stays collapsed everywhere.
  const [mode,   setMode]   = useState<SidebarMode>('auto')
  const narrow = useNarrowViewport()
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('sidebar-mode')
    if (stored === 'expanded' || stored === 'collapsed' || stored === 'auto') setMode(stored)
    setHydrated(true)
  }, [])

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

  const onListDetailRoute = isListDetailRoute(pathname)
  const onEngagement = pathname === ENGAGEMENT_ROUTE || pathname.startsWith(ENGAGEMENT_ROUTE + '/')
  const collapsed = !hydrated
    ? onListDetailRoute
    : narrow
      ? true
      : mode === 'expanded'
        ? false
        : mode === 'collapsed'
          ? true
          : onListDetailRoute   // mode === 'auto'

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-width', collapsed ? '56px' : '256px')
    document.documentElement.dataset.sidebarCollapsed = collapsed ? 'true' : 'false'
  }, [collapsed])

  function toggle() {
    if (narrow) return
    const next: SidebarMode = collapsed ? 'expanded' : 'collapsed'
    setMode(next)
    localStorage.setItem('sidebar-mode', next)
  }

  async function signOut() {
    await createClient().auth.signOut()
    router.push('/login')
  }

  function active(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  const totalEngaged = stages.engaged + stages.qualified + stages.proposal + stages.converted

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className="hidden lg:flex fixed inset-y-0 left-0 flex-col z-40 glass-sidebar overflow-x-hidden"
        style={{
          width: collapsed ? 56 : 256,
          transition: 'width 220ms cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {/* ── Logo / Brand ── */}
        <div className={cn('flex items-center h-14 flex-shrink-0', collapsed ? 'justify-center px-0' : 'gap-3 px-4')}>
          <div
            className="flex items-center justify-center rounded-lg flex-shrink-0"
            style={{ width: 32, height: 32, background: 'hsl(var(--sidebar-ring))', boxShadow: '0 0 0 2px var(--primary-focus-ring)' }}
          >
            <span className="text-[10px] font-black text-white tracking-tight">TRS</span>
          </div>
          <Label collapsed={collapsed} className="flex flex-col min-w-0 flex-1">
            <span className="text-[13px] font-semibold leading-tight tracking-tight text-foreground whitespace-nowrap">
              Trade Risk Solutions
            </span>
            <span className="text-[10.5px] leading-tight text-muted-foreground/70 whitespace-nowrap">
              Internal Dashboard
            </span>
          </Label>
          {!collapsed && !narrow && (
            <button
              onClick={toggle}
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
              className="p-1.5 rounded-md text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent transition-all flex-shrink-0"
            >
              <PanelLeftClose size={14} strokeWidth={2} />
            </button>
          )}
        </div>

        {/* Pinned expand affordance — only shown collapsed, sits at the top of the icon rail */}
        {collapsed && !narrow && (
          <button
            onClick={toggle}
            title="Pin sidebar open"
            aria-label="Pin sidebar open"
            className="flex-shrink-0 h-8 w-full flex items-center justify-center cursor-pointer text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <PanelLeft size={13} strokeWidth={2} />
          </button>
        )}

        {/* ── Nav ── */}
        <nav className={cn('flex-1 overflow-y-auto overflow-x-hidden py-3 space-y-px', collapsed ? 'px-2 flex flex-col items-center' : 'px-2')}>
          {onEngagement && !collapsed ? (
            <>
              <Link href="/" className="flex items-center gap-1.5 h-7 px-2.5 mb-2 rounded-md text-[11.5px] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors no-underline">
                <ArrowLeft size={12} strokeWidth={2} /> Dashboard
              </Link>
              <EngagementFolderNav />
            </>
          ) : (
          <>
          {/* Top-level items */}
          <NavItem label="Home"     href="/"        icon={LayoutDashboard} isActive={pathname === '/'} collapsed={collapsed} />
          <NavItem label="Overview" href="/overview" icon={BookOpen}        isActive={active('/overview')} collapsed={collapsed} />

          <SectionDivider collapsed={collapsed} />

          <NavItem label="Inbound Leads" href="/inbound/email" icon={Inbox} badge={inbound.totalNew || undefined} isActive={active('/inbound/email') || active('/inbound/whatsapp')} collapsed={collapsed} />

          <SectionDivider collapsed={collapsed} />

          <SectionHeader label="Outbound Leads" open={outboundOpen} onToggle={() => setOutboundOpen(o => !o)} collapsed={collapsed} />
          {(outboundOpen || collapsed) && (
            <div className={cn('space-y-px', collapsed && 'flex flex-col items-center')}>
              <NavItem label="Lead Discovery" href="/outbound/agent"     icon={Telescope}     isActive={active('/outbound/agent')}     collapsed={collapsed} />
              <NavItem label="Signal Library" href="/outbound/signals"   icon={Radar}         isActive={active('/outbound/signals')}   collapsed={collapsed} />
              <NavItem label="Lead Database"  href="/outbound/leads"     icon={Table2}        isActive={active('/outbound/leads')}     collapsed={collapsed} />
              <NavItem label="Campaigns"      href="/outbound/campaigns" icon={Megaphone}     isActive={active('/outbound/campaigns')} collapsed={collapsed} />
              <NavItem label="Reply Review"   href="/outbound/replies"   icon={MessageCircle} isActive={active('/outbound/replies')}   collapsed={collapsed} />
            </div>
          )}

          <SectionDivider collapsed={collapsed} />

          <SectionHeader
            label="Engagement"
            open={engageOpen}
            onToggle={() => setEngageOpen(o => !o)}
            collapsed={collapsed}
          />
          {(engageOpen || collapsed) && (
            <div className={cn('space-y-px', collapsed && 'flex flex-col items-center')}>
              <NavItem label="Active Contacts" href="/contacts"   icon={Users} isActive={active('/contacts')} collapsed={collapsed} hasBadge={totalEngaged > 0} />
              <NavItem label="Engagement Agent" href="/engagement" icon={Bot} isActive={active('/engagement')} collapsed={collapsed} />
              <NavItem label="Nexus" href="/nexus" icon={Network} isActive={active('/nexus')} collapsed={collapsed} />
              <NavItem label="Pricing Matrix" href="/pricing-matrix" icon={HeartPulse} isActive={active('/pricing-matrix')} collapsed={collapsed} />
              <NavItem label="Debit Notes" href="/debit-notes" icon={Receipt} isActive={active('/debit-notes')} collapsed={collapsed} />
              <NavItem label="Calendar" href="/calendar" icon={CalendarDays} isActive={active('/calendar')} collapsed={collapsed} />
            </div>
          )}

          <SectionDivider collapsed={collapsed} />

          <SectionHeader label="RoadPlus" open={roadplusOpen} onToggle={() => setRoadplusOpen(o => !o)} collapsed={collapsed} />
          {(roadplusOpen || collapsed) && (
            <div className={cn('space-y-px', collapsed && 'flex flex-col items-center')}>
              <NavItem label="Reconciliation" href="/roadplus" icon={Car} isActive={active('/roadplus')} collapsed={collapsed} />
            </div>
          )}

          <SectionDivider collapsed={collapsed} />

          <SectionHeader label="Knowledge" open={knowledgeOpen} onToggle={() => setKnowledgeOpen(o => !o)} collapsed={collapsed} />
          {(knowledgeOpen || collapsed) && (
            <div className={cn('space-y-px', collapsed && 'flex flex-col items-center')}>
              <NavItem label="Knowledge Base" href="/outbound/knowledge"  icon={BookMarked} isActive={active('/outbound/knowledge')} collapsed={collapsed} />
              <NavItem label="RAG Index"      href="/analytics/rag-index" icon={FolderOpen} isActive={active('/analytics/rag-index')} collapsed={collapsed} />
            </div>
          )}

          <SectionDivider collapsed={collapsed} />

          <SectionHeader label="Analytics" open={analyticsOpen} onToggle={() => setAnalyticsOpen(o => !o)} collapsed={collapsed} />
          {(analyticsOpen || collapsed) && (
            <div className={cn('space-y-px', collapsed && 'flex flex-col items-center')}>
              <NavItem label="Funnel"           href="/analytics"           icon={BarChart2}    isActive={active('/analytics') && !active('/analytics/ai-usage') && !active('/analytics/activity') && !active('/analytics/eval') && !active('/analytics/rag-index')} disabled collapsed={collapsed} />
              <NavItem label="Activity Log"     href="/analytics/activity"  icon={History}      isActive={active('/analytics/activity')} collapsed={collapsed} />
              <NavItem label="AI Usage"         href="/analytics/ai-usage"  icon={Cpu}          isActive={active('/analytics/ai-usage')} collapsed={collapsed} />
              <NavItem label="Email Evaluation" href="/analytics/eval"      icon={FlaskConical} isActive={active('/analytics/eval')} collapsed={collapsed} />
            </div>
          )}

          <SectionDivider collapsed={collapsed} />

          <SectionHeader label="Vendor Analytics" open={vendorOpen} onToggle={() => setVendorOpen(o => !o)} collapsed={collapsed} />
          {(vendorOpen || collapsed) && (
            <div className={cn('space-y-px', collapsed && 'flex flex-col items-center')}>
              <NavItem label="Kyn ROI"  href="/kyn-roi"     icon={TrendingUp} isActive={active('/kyn-roi') && !active('/kyn-roi-log')} collapsed={collapsed} />
              <NavItem label="Dev Logs" href="/kyn-roi-log" icon={ScrollText} isActive={active('/kyn-roi-log')} collapsed={collapsed} />
            </div>
          )}

          <SectionDivider collapsed={collapsed} />

          <NavItem label="Claims"   href="/claims"   icon={AlertCircle} isActive={active('/claims')}   disabled collapsed={collapsed} />
          <NavItem label="Team"     href="/team"     icon={UsersRound}  isActive={active('/team')} collapsed={collapsed} />
          <NavItem label="Settings" href="/settings" icon={Settings}    isActive={active('/settings')} collapsed={collapsed} />
          </>
          )}
        </nav>

        {/* ── Footer ── */}
        <div className={cn('flex items-center flex-shrink-0 py-3', collapsed ? 'flex-col gap-2 px-0' : 'gap-2.5 px-3')}>
          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold text-accent-foreground flex-shrink-0">
            {userEmail ? userEmail[0].toUpperCase() : '?'}
          </div>
          <Label collapsed={collapsed} className="flex-1 min-w-0">
            <span className="text-[11.5px] block overflow-hidden text-ellipsis whitespace-nowrap text-muted-foreground">
              {userEmail ?? '—'}
            </span>
          </Label>
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
    </TooltipProvider>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

/** Fades/shrinks a label out when the rail collapses, rather than unmounting it — keeps the
 *  transition smooth instead of an instant snap between two different DOM trees. */
function Label({ collapsed, children, className }: { collapsed: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div
      className={className}
      style={{
        opacity: collapsed ? 0 : 1,
        maxWidth: collapsed ? 0 : 220,
        marginLeft: collapsed ? 0 : undefined,
        overflow: 'hidden',
        transition: 'opacity 140ms ease, max-width 200ms ease, margin-left 200ms ease',
        pointerEvents: collapsed ? 'none' : undefined,
      }}
    >
      {children}
    </div>
  )
}

function SectionDivider({ collapsed }: { collapsed: boolean }) {
  return collapsed
    ? <div className="w-7 h-px my-1.5 bg-[--border-subtle]" />
    : <div className="my-2 h-px bg-[--border-subtle]" />
}

function SectionHeader({
  label, open, onToggle, badge, collapsed,
}: {
  label: string; open: boolean; onToggle: () => void; badge?: number; collapsed: boolean
}) {
  if (collapsed) return null   // collapsed rail shows all items flat — no section chrome to toggle
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
  label, href, icon: Icon, badge, isActive, disabled, collapsed, hasBadge,
}: {
  label: string; href: string; icon: React.ElementType
  badge?: number; isActive: boolean; disabled?: boolean; collapsed: boolean; hasBadge?: boolean
}) {
  if (collapsed) {
    const inner = (
      <span
        className={cn(
          'relative flex items-center justify-center rounded-lg transition-colors',
          isActive
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          disabled && 'opacity-35 pointer-events-none',
        )}
        style={{ width: 36, height: 36 }}
      >
        <Icon size={16} strokeWidth={isActive ? 2.2 : 1.8} className="flex-shrink-0" />
        {(hasBadge || (badge !== undefined && badge > 0)) && (
          <span className="absolute top-[7px] right-[7px] w-1.5 h-1.5 rounded-full bg-primary border-2 border-white" />
        )}
      </span>
    )
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {disabled ? (
            <div>{inner}</div>
          ) : (
            <Link href={href} className="no-underline" aria-current={isActive ? 'page' : undefined}>{inner}</Link>
          )}
        </TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    )
  }

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
