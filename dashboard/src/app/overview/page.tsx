'use client'

import Link from 'next/link'
import {
  Inbox, Telescope, Megaphone, Zap, MessageSquare, BarChart2,
  type LucideIcon,
} from 'lucide-react'

type Step = {
  icon:      LucideIcon
  accent:    string
  step:      string
  title:     string
  desc:      string
  href:      string
  linkLabel: string
}

const STEPS: Step[] = [
  {
    icon: Inbox, accent: '#2563eb', step: '01',
    title: 'Capture Every Enquiry',
    desc:  'Every inbound lead — website form, email, or WhatsApp — is captured automatically and centralised in one inbox. No channel is missed, no lead goes cold.',
    href: '/inbound/email', linkLabel: 'Open Inbox',
  },
  {
    icon: Telescope, accent: '#7c3aed', step: '02',
    title: 'Prospect with Apollo',
    desc:  'Apollo.io searches thousands of companies and decision-makers by sector, size, and location. Verified emails are retrieved in one click and loaded into campaigns.',
    href: '/outbound/agent', linkLabel: 'Lead Discovery',
  },
  {
    icon: Megaphone, accent: '#0891b2', step: '03',
    title: 'AI Campaign Sequences',
    desc:  'The AI drafts a personalised multi-step email sequence for each campaign. You approve it once — Instantly handles delivery, scheduling, and reply tracking automatically.',
    href: '/outbound/campaigns', linkLabel: 'View Campaigns',
  },
  {
    icon: Zap, accent: '#dc2626', step: '04',
    title: 'Instant First Reply',
    desc:  'Every new inbound lead receives a personalised reply within seconds of their message — drafted by AI, reviewed by the team. First impressions are never delayed.',
    href: '/inbound/email', linkLabel: 'View Inbound',
  },
  {
    icon: MessageSquare, accent: '#d97706', step: '05',
    title: 'Continuous Engagement',
    desc:  "From the second message onwards, Agent 2 reads the full conversation and TRS's insurance knowledge base, then drafts contextual, accurate follow-ups every time.",
    href: '/engagement', linkLabel: 'Engagement Agent',
  },
  {
    icon: BarChart2, accent: '#16a34a', step: '06',
    title: 'Full Pipeline Visibility',
    desc:  'Every contact — inbound or outbound — is tracked by stage, channel, and value in one view. Campaign analytics, AI usage, and conversion data all in one place.',
    href: '/contacts', linkLabel: 'View Pipeline',
  },
]

export default function OverviewPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[960px] mx-auto px-6 py-10">

        {/* Page header */}
        <div className="mb-10">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'hsl(var(--primary))', boxShadow: '0 0 0 3px var(--primary-focus-ring)' }}>
              <span className="text-[10px] font-black text-white tracking-tight">TRS</span>
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Platform Guide</span>
          </div>
          <h1 className="text-[28px] font-bold tracking-tight text-foreground leading-tight mb-2">
            TRS AI Platform
          </h1>
          <p className="text-[14px] text-muted-foreground max-w-[480px] leading-relaxed">
            End-to-end automation — from first contact to closed deal. Six steps, fully integrated.
          </p>
        </div>

        {/* Step grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {STEPS.map(s => {
            const Icon = s.icon
            return (
              <div key={s.step}
                className="group relative bg-card border border-border rounded-xl p-5 flex flex-col gap-4 transition-shadow hover:shadow-md"
                style={{ boxShadow: 'var(--card-shadow)' }}
              >
                {/* Step number — subtle, top-right */}
                <span className="absolute top-4 right-4 text-[11px] font-bold text-muted-foreground/30 tabular-nums select-none">
                  {s.step}
                </span>

                {/* Icon */}
                <div className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ background: `${s.accent}14`, color: s.accent }}>
                  <Icon size={17} strokeWidth={2} />
                </div>

                {/* Content */}
                <div className="flex flex-col gap-2 flex-1">
                  <h2 className="text-[13px] font-semibold text-foreground tracking-tight leading-snug pr-6">
                    {s.title}
                  </h2>
                  <p className="text-[12px] text-muted-foreground leading-[1.65] flex-1">
                    {s.desc}
                  </p>
                </div>

                {/* Link */}
                <Link
                  href={s.href}
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold no-underline transition-opacity group-hover:opacity-100 opacity-80"
                  style={{ color: s.accent }}
                >
                  {s.linkLabel}
                  <span className="transition-transform group-hover:translate-x-0.5">→</span>
                </Link>
              </div>
            )
          })}
        </div>

        {/* Quick links footer */}
        <div className="mt-10 pt-6 border-t border-border">
          <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground mb-3">Quick access</p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Inbound Inbox',    href: '/inbound/email' },
              { label: 'Contacts',         href: '/contacts' },
              { label: 'Engagement Agent', href: '/engagement' },
              { label: 'Campaigns',        href: '/outbound/campaigns' },
              { label: 'Lead Database',    href: '/outbound/leads' },
              { label: 'AI Usage',         href: '/analytics/ai-usage' },
            ].map(l => (
              <Link key={l.href} href={l.href}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-border bg-card text-[12px] font-medium text-muted-foreground no-underline hover:text-foreground hover:border-muted-foreground transition-colors">
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
