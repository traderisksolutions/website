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
  const [inbound, setInbound]     = useState<InboundCounts>({ emailNew: 0, waNew: 0 })
  const [stages,  setStages]      = useState<StageCounts>({ engaged: 0, qualified: 0, proposal: 0, converted: 0 })
  const [captureOpen,  setCaptureOpen]  = useState(true)
  const [outboundOpen, setOutboundOpen] = useState(true)
  const [engageOpen,   setEngageOpen]   = useState(true)
  const [userEmail,   setUserEmail]   = useState<string | null>(null)

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
    <aside style={{
      position:      'fixed',
      inset:         '0 auto 0 0',
      width:         'var(--sidebar-width)',
      display:       'flex',
      flexDirection: 'column',
      background:    '#fff',
      borderRight:   '1px solid #e5e5e5',
      zIndex:        40,
      overflowY:     'auto',
    }}>

      {/* Account header */}
      <div style={{
        display:      'flex',
        alignItems:   'center',
        gap:          10,
        padding:      '0 12px',
        height:       52,
        borderBottom: '1px solid #f0f0f0',
        flexShrink:   0,
      }}>
        <span style={{
          width: 28, height: 28, borderRadius: 7,
          background: '#1677FF',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em' }}>TRS</span>
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#111', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
            Trade Risk Solutions
          </p>
          <p style={{ margin: 0, fontSize: 11, color: '#999', lineHeight: 1.3 }}>Internal Dashboard</p>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '10px 10px 4px', flexShrink: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: '#f4f4f5', borderRadius: 7, padding: '0 10px', height: 34,
        }}>
          <Search size={13} style={{ color: '#aaa', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: '#aaa', flex: 1 }}>Find...</span>
          <kbd style={{ fontSize: 11, color: '#bbb', background: '#e8e8e8', borderRadius: 4, padding: '1px 5px', fontFamily: 'inherit' }}>F</kbd>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '4px 8px 8px' }}>

        {/* ── OVERVIEW ── */}
        <NavItem label="Overview" href="/documentation" icon={BookOpen} isActive={active('/documentation')} />

        <Divider />

        {/* ── INBOUND LEADS ── */}
        <button
          onClick={() => setCaptureOpen(o => !o)}
          style={{
            display: 'flex', alignItems: 'center', gap: 9,
            padding: '0 10px', height: 32, borderRadius: 6, width: '100%',
            background: 'transparent', border: 'none', cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#aaa', flex: 1 }}>
            Inbound Leads
          </span>
          {(inbound.emailNew + inbound.waNew) > 0 && (
            <Badge count={inbound.emailNew + inbound.waNew} />
          )}
          {captureOpen
            ? <ChevronDown  size={12} strokeWidth={2} style={{ color: '#ccc' }} />
            : <ChevronRight size={12} strokeWidth={2} style={{ color: '#ccc' }} />
          }
        </button>

        {captureOpen && (
          <>
            <NavItem label="Email"    href="/inbound/email"    icon={Mail}          badge={inbound.emailNew} isActive={active('/inbound/email')} />
            <NavItem label="WhatsApp" href="/inbound/whatsapp" icon={MessageCircle} badge={inbound.waNew}    isActive={active('/inbound/whatsapp')} />
          </>
        )}

        <Divider />

        {/* ── OUTBOUND LEADS ── */}
        <button
          onClick={() => setOutboundOpen(o => !o)}
          style={{
            display: 'flex', alignItems: 'center', gap: 9,
            padding: '0 10px', height: 32, borderRadius: 6, width: '100%',
            background: 'transparent', border: 'none', cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#aaa', flex: 1 }}>
            Outbound Leads
          </span>
          {outboundOpen
            ? <ChevronDown  size={12} strokeWidth={2} style={{ color: '#ccc' }} />
            : <ChevronRight size={12} strokeWidth={2} style={{ color: '#ccc' }} />
          }
        </button>

        {outboundOpen && (
          <>
            <NavItem label="Lead Discovery"    href="/outbound/agent"     icon={Telescope}   isActive={active('/outbound/agent')} />
            <NavItem label="Lead Database"    href="/outbound/leads"     icon={Table2}      isActive={active('/outbound/leads')} />
            <NavItem label="Campaigns"        href="/outbound/campaigns" icon={Megaphone}   isActive={active('/outbound/campaigns')} />
            <NavItem label="Product Knowledge" href="/outbound/knowledge" icon={BookMarked}  isActive={active('/outbound/knowledge')} />
          </>
        )}

        <Divider />

        {/* ── ENGAGEMENT ── */}
        <button
          onClick={() => setEngageOpen(o => !o)}
          style={{
            display: 'flex', alignItems: 'center', gap: 9,
            padding: '0 10px', height: 32, borderRadius: 6, width: '100%',
            background: 'transparent', border: 'none', cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#aaa', flex: 1 }}>
            Engagement
          </span>
          {totalEngaged > 0 && <Badge count={totalEngaged} />}
          {engageOpen
            ? <ChevronDown  size={12} strokeWidth={2} style={{ color: '#ccc' }} />
            : <ChevronRight size={12} strokeWidth={2} style={{ color: '#ccc' }} />
          }
        </button>

        {engageOpen && (
          <>
            <NavItem label="Active Contacts" href="/contacts" icon={Users} badge={totalEngaged || undefined} isActive={active('/contacts')} />
            {totalEngaged > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '2px 10px 6px 18px' }}>
                {stages.engaged   > 0 && <StagePill label="Engaged"   count={stages.engaged}   color="#2563eb" />}
                {stages.qualified > 0 && <StagePill label="Qualified" count={stages.qualified} color="#7c3aed" />}
                {stages.proposal  > 0 && <StagePill label="Proposal"  count={stages.proposal}  color="#d97706" />}
                {stages.converted > 0 && <StagePill label="Converted" count={stages.converted} color="#059669" />}
              </div>
            )}
            <NavItem label="Engagement AI Agent" href="/engagement" icon={Bot} isActive={active('/engagement')} />
          </>
        )}

        <Divider />

        {/* ── ANALYTICS ── */}
        <p style={{ margin: '4px 0 2px', padding: '0 10px', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#aaa' }}>
          Analytics
        </p>
        <NavItem label="Funnel"       href="/analytics"             icon={BarChart2}  isActive={active('/analytics') && !active('/analytics/ai-usage') && !active('/analytics/activity') && !active('/analytics/eval') && !active('/analytics/rag-index')} disabled />
        <NavItem label="Activity Log" href="/analytics/activity"    icon={UsersRound} isActive={active('/analytics/activity')} disabled />
        <NavItem label="AI Usage"   href="/analytics/ai-usage"  icon={Cpu}        isActive={active('/analytics/ai-usage')} />
        <NavItem label="RAG Index"  href="/analytics/rag-index" icon={FolderOpen} isActive={active('/analytics/rag-index')} />
        <NavItem label="Draft Evals" href="/analytics/eval"      icon={FlaskConical} isActive={active('/analytics/eval')} />

        <Divider />

        {/* ── CLAIMS ── */}
        <NavItem label="Claims" href="/claims" icon={AlertCircle} isActive={active('/claims')} disabled />

        <Divider />

        {/* ── SETTINGS ── */}
        <NavItem label="Settings" href="/settings" icon={Settings} isActive={active('/settings')} />

      </nav>

      {/* Footer — user + sign out */}
      <div style={{ padding: '10px 12px', borderTop: '1px solid #e5e5e5', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%', background: '#f0f0f0',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#555' }}>
            {userEmail ? userEmail[0].toUpperCase() : '?'}
          </span>
        </div>
        <span style={{ fontSize: 11, color: '#888', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {userEmail ?? '—'}
        </span>
        <button
          onClick={signOut}
          title="Sign out"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', color: '#bbb', flexShrink: 0 }}
        >
          <LogOut size={13} strokeWidth={2} />
        </button>
      </div>
    </aside>
  )
}

function Divider() {
  return <div style={{ height: 1, background: '#f0f0f0', margin: '6px 4px' }} />
}

function Badge({ count }: { count: number }) {
  return (
    <span style={{
      minWidth: 18, height: 18, borderRadius: 9,
      background: '#1677FF', color: '#fff',
      fontSize: 11, fontWeight: 600,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 5px', flexShrink: 0,
    }}>
      {count > 99 ? '99+' : count}
    </span>
  )
}

function StagePill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10, fontWeight: 500, color,
      background: `${color}14`,
      border: `1px solid ${color}30`,
      borderRadius: 20, padding: '1px 7px',
      letterSpacing: '0.01em',
    }}>
      {label} {count}
    </span>
  )
}

function NavItem({
  label, href, icon: Icon, badge, isActive, disabled,
}: {
  label: string; href: string; icon: React.ElementType;
  badge?: number; isActive: boolean; disabled?: boolean;
}) {
  const row = (
    <span
      className={disabled ? '' : 'sb-row'}
      style={{
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '0 10px 0 7px', height: 32, borderRadius: 6,
        background: isActive ? '#E6F4FF' : 'transparent',
        color: disabled ? '#ccc' : isActive ? '#1677FF' : '#555',
        cursor: disabled ? 'default' : 'pointer',
        textDecoration: 'none', width: '100%',
        transition: 'background 0.1s, color 0.1s',
        borderLeft: isActive ? '3px solid #1677FF' : '3px solid transparent',
      }}
    >
      <Icon size={14} strokeWidth={isActive ? 2.2 : 1.8} style={{ flexShrink: 0, color: disabled ? '#ddd' : isActive ? '#1677FF' : '#888' }} />
      <span style={{ fontSize: 13, fontWeight: isActive ? 500 : 400, flex: 1, letterSpacing: '-0.01em', lineHeight: 1 }}>
        {label}
      </span>
      {badge !== undefined && badge > 0 && <Badge count={badge} />}
      {disabled && (
        <span style={{
          fontSize: 10, fontWeight: 500, padding: '1px 5px', borderRadius: 4,
          background: '#f4f4f5', color: '#ccc', letterSpacing: '0.04em', textTransform: 'uppercase',
        }}>
          Soon
        </span>
      )}
    </span>
  )

  return disabled ? (
    <div>{row}</div>
  ) : (
    <Link href={href} style={{ display: 'block', textDecoration: 'none' }}>{row}</Link>
  )
}
