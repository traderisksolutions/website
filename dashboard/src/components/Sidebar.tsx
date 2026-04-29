'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Mail, MessageCircle, AlertCircle,
  Users, BarChart2, Settings,
  Search, ChevronRight, ChevronDown,
} from 'lucide-react'

type Counts = { emailNew: number; waNew: number; claimsNew: number }

async function fetchCounts(): Promise<Counts> {
  try {
    const res = await fetch('/api/leads', { cache: 'no-store' })
    if (!res.ok) return { emailNew: 0, waNew: 0, claimsNew: 0 }
    const data: { status: string; source: string }[] = await res.json()
    const emailSources = new Set(['website_form', 'email', 'manual'])
    return {
      emailNew:  data.filter(l => l.status === 'new' && emailSources.has(l.source)).length,
      waNew:     data.filter(l => l.status === 'new' && l.source === 'whatsapp_click').length,
      claimsNew: data.filter(l => l.status === 'new' && l.source === 'claims_form').length,
    }
  } catch { return { emailNew: 0, waNew: 0, claimsNew: 0 } }
}

export default function Sidebar() {
  const pathname = usePathname()
  const [counts, setCounts]   = useState<Counts>({ emailNew: 0, waNew: 0, claimsNew: 0 })
  const [inboundOpen, setInboundOpen] = useState(true)

  useEffect(() => {
    fetchCounts().then(setCounts)
    const t = setInterval(() => fetchCounts().then(setCounts), 30_000)
    return () => clearInterval(t)
  }, [])

  function active(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

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
        borderBottom: '1px solid #e5e5e5',
        flexShrink:   0,
      }}>
        <span style={{
          width: 28, height: 28, borderRadius: 7,
          background: '#000',
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

        {/* ── Inbound Leads group ── */}
        <button
          onClick={() => setInboundOpen(o => !o)}
          className="sb-group"
          style={{
            display: 'flex', alignItems: 'center', gap: 9,
            padding: '0 10px', height: 36, borderRadius: 6, width: '100%',
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: '#111', textAlign: 'left',
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#aaa', flex: 1 }}>
            Inbound Leads
          </span>
          {(counts.emailNew + counts.waNew) > 0 && (
            <Badge count={counts.emailNew + counts.waNew} />
          )}
          {inboundOpen
            ? <ChevronDown size={13} strokeWidth={2} style={{ color: '#ccc', flexShrink: 0 }} />
            : <ChevronRight size={13} strokeWidth={2} style={{ color: '#ccc', flexShrink: 0 }} />
          }
        </button>

        {inboundOpen && (
          <div style={{ paddingLeft: 8 }}>
            <NavItem
              label="Email"
              href="/inbound/email"
              icon={Mail}
              badge={counts.emailNew}
              isActive={active('/inbound/email')}
            />
            <NavItem
              label="WhatsApp"
              href="/inbound/whatsapp"
              icon={MessageCircle}
              badge={counts.waNew}
              isActive={active('/inbound/whatsapp')}
            />
          </div>
        )}

        {/* Divider */}
        <Divider />

        {/* ── Claims ── */}
        <p style={{ margin: '8px 0 2px', padding: '0 10px', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#aaa' }}>
          Claims
        </p>
        <NavItem
          label="All Claims"
          href="/claims"
          icon={AlertCircle}
          badge={counts.claimsNew}
          isActive={active('/claims')}
        />

        {/* Divider */}
        <Divider />

        {/* ── Analytics ── */}
        <p style={{ margin: '8px 0 2px', padding: '0 10px', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#aaa' }}>
          Analytics
        </p>
        <NavItem label="Funnel"   href="/analytics"        icon={BarChart2} isActive={active('/analytics')} />
        <NavItem label="Contacts" href="/contacts"         icon={Users}     isActive={false} disabled />

        {/* Divider */}
        <Divider />

        <NavItem label="Settings" href="/settings" icon={Settings} isActive={false} disabled />

      </nav>

      {/* Footer */}
      <div style={{ padding: '10px 16px', borderTop: '1px solid #e5e5e5', flexShrink: 0 }}>
        <p style={{ margin: 0, fontSize: 11, color: '#bbb', letterSpacing: '-0.01em' }}>
          © 2025 Trade Risk Solutions
        </p>
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
      background: '#111', color: '#fff',
      fontSize: 11, fontWeight: 600,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 5px', flexShrink: 0,
    }}>
      {count > 99 ? '99+' : count}
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
        padding: '0 10px', height: 34, borderRadius: 6,
        background: isActive ? '#f0f0f0' : 'transparent',
        color: disabled ? '#ccc' : isActive ? '#111' : '#555',
        cursor: disabled ? 'default' : 'pointer',
        textDecoration: 'none', width: '100%',
        transition: 'background 0.1s, color 0.1s',
      }}
    >
      <Icon size={14} strokeWidth={isActive ? 2.2 : 1.8} style={{ flexShrink: 0, color: disabled ? '#ddd' : isActive ? '#111' : '#888' }} />
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
