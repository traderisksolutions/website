'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Mail, MessageCircle, Telescope, Megaphone, Bot, Users, BookOpen,
  Inbox, FileEdit, MessageSquare, BarChart2, ArrowRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/page-header'
import { StatCard } from '@/components/stat-card'

// ── Types ──────────────────────────────────────────────────────────────────────

type HomeCounts = {
  newLeads:        number
  activeThreads:   number
  pendingDrafts:   number
  activeCampaigns: number
}

const ZERO: HomeCounts = { newLeads: 0, activeThreads: 0, pendingDrafts: 0, activeCampaigns: 0 }

// ── Quick-link definitions ─────────────────────────────────────────────────────

const QUICK_LINKS: { label: string; href: string; icon: React.ElementType; desc: string }[] = [
  { label: 'Email Inbox',      href: '/inbound/email',      icon: Mail,          desc: 'View and reply to new inbound leads'        },
  { label: 'WhatsApp Inbox',   href: '/inbound/whatsapp',   icon: MessageCircle, desc: 'WhatsApp enquiries and leads'               },
  { label: 'Lead Discovery',   href: '/outbound/agent',     icon: Telescope,     desc: 'Search and prospect via Apollo'             },
  { label: 'Campaigns',        href: '/outbound/campaigns', icon: Megaphone,     desc: 'Outbound email campaign sequences'          },
  { label: 'Engagement Agent', href: '/engagement',         icon: Bot,           desc: 'AI-assisted reply drafting for live threads' },
  { label: 'Active Contacts',  href: '/contacts',           icon: Users,         desc: 'Pipeline view by stage'                    },
  { label: 'Overview',         href: '/overview',           icon: BookOpen,      desc: 'Platform guide, workflow map, and AI agent docs' },
]

// ── Page ───────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [counts,  setCounts]  = useState<HomeCounts | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/home/counts', { cache: 'no-store' })
      .then(r => r.ok ? r.json() as Promise<HomeCounts> : ZERO)
      .then(data => { setCounts(data); setLoading(false) })
      .catch(()  => { setCounts(ZERO); setLoading(false) })
  }, [])

  const c = counts ?? ZERO

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[900px] mx-auto px-6 py-8">

        {/* ── Header ── */}
        <PageHeader
          title="Home"
          description="TRS internal dashboard — your operational launchpad."
          className="mb-7"
        />

        {/* ── KPI row ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="New Leads"
            value={c.newLeads}
            sublabel="Awaiting first reply"
            href="/inbound/email"
            loading={loading}
            urgent={c.newLeads > 0}
          />
          <StatCard
            label="Active Threads"
            value={c.activeThreads}
            sublabel="Open conversations"
            href="/engagement"
            loading={loading}
          />
          <StatCard
            label="Pending Drafts"
            value={c.pendingDrafts}
            sublabel="AI drafts to review"
            href="/engagement"
            loading={loading}
            urgent={c.pendingDrafts > 0}
          />
          <StatCard
            label="Live Campaigns"
            value={c.activeCampaigns}
            sublabel="Active or in review"
            href="/outbound/campaigns"
            loading={loading}
          />
        </div>

        {/* ── Action queue ── */}
        <div className="mb-8">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-muted-foreground mb-2.5">
            Where to go next
          </p>
          <div className="bg-card border border-border rounded-xl overflow-hidden"
            style={{ boxShadow: 'var(--card-shadow)' }}>
            <ActionRow
              icon={Inbox}
              label="Leads awaiting first reply"
              count={loading ? null : c.newLeads}
              href="/inbound/email"
              urgent={c.newLeads > 0}
            />
            <ActionRow
              icon={FileEdit}
              label="AI drafts pending your review"
              count={loading ? null : c.pendingDrafts}
              href="/engagement"
              urgent={c.pendingDrafts > 0}
              divider
            />
            <ActionRow
              icon={MessageSquare}
              label="Active conversation threads"
              count={loading ? null : c.activeThreads}
              href="/engagement"
              divider
            />
            <ActionRow
              icon={BarChart2}
              label="Campaigns active or in review"
              count={loading ? null : c.activeCampaigns}
              href="/outbound/campaigns"
              divider
            />
          </div>
        </div>

        {/* ── Quick links ── */}
        <div className="mb-8">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-muted-foreground mb-2.5">
            Quick access
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {QUICK_LINKS.map(l => <QuickLink key={l.href} {...l} />)}
          </div>
        </div>

        {/* ── Orientation strip ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-5 border-t border-border">
          <p className="text-[11.5px] text-muted-foreground">
            TRS AI Platform — end-to-end sales automation from inbound capture to pipeline conversion.
          </p>
          <div className="flex items-center gap-4">
            <Link href="/overview"
              className="text-[11.5px] font-medium text-muted-foreground hover:text-foreground no-underline transition-colors">
              Overview
            </Link>
            <Link href="/settings"
              className="text-[11.5px] font-medium text-muted-foreground hover:text-foreground no-underline transition-colors">
              Settings
            </Link>
          </div>
        </div>

      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function QuickLink({
  label, href, icon: Icon, desc,
}: {
  label: string; href: string; icon: React.ElementType; desc: string
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 px-3.5 py-3 rounded-lg border border-border bg-card no-underline hover:border-muted-foreground/30 hover:bg-accent/40 transition-all"
    >
      <span
        className="flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center mt-px"
        style={{ background: 'hsl(var(--muted))' }}
      >
        <Icon size={14} strokeWidth={1.8} style={{ color: 'hsl(var(--muted-foreground))' }} />
      </span>
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[12.5px] font-semibold text-foreground leading-tight">{label}</span>
        <span className="text-[11px] text-muted-foreground leading-snug line-clamp-2">{desc}</span>
      </span>
    </Link>
  )
}

function ActionRow({
  icon: Icon, label, count, href, urgent, divider,
}: {
  icon: React.ElementType; label: string
  count: number | null; href: string; urgent?: boolean; divider?: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 px-4 py-3 no-underline hover:bg-accent/50 transition-colors group',
        divider && 'border-t border-border',
      )}
    >
      <Icon size={14} strokeWidth={1.8} className="flex-shrink-0 text-muted-foreground" />
      <span className="flex-1 text-[12.5px] text-foreground">{label}</span>

      {count === null ? (
        /* skeleton while loading */
        <span className="skeleton" style={{ width: 24, height: 18, borderRadius: 9999, display: 'inline-block' }} />
      ) : count > 0 ? (
        <span
          className="text-[11px] font-bold px-2 py-px rounded-full min-w-[22px] text-center"
          style={urgent
            ? { background: 'rgba(15,61,145,0.08)', color: '#0F3D91' }
            : { background: 'hsl(var(--muted))',    color: 'hsl(var(--muted-foreground))' }
          }
        >
          {count}
        </span>
      ) : (
        <span className="text-[11px] text-muted-foreground/40">—</span>
      )}

      <ArrowRight
        size={12} strokeWidth={2}
        className="flex-shrink-0 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors"
      />
    </Link>
  )
}
