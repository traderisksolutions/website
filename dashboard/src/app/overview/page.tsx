import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

// ── Area card data ─────────────────────────────────────────────────────────────

const AREAS = [
  {
    title:   'Inbound Leads',
    desc:    'All enquiries received via the website form, email, or WhatsApp. Reply with an AI-drafted email in one click from the inbox.',
    links:   [
      { label: 'Email Inbox',    href: '/inbound/email'    },
      { label: 'WhatsApp Inbox', href: '/inbound/whatsapp' },
    ],
    guide:   '/overview/inbound',
  },
  {
    title:   'Outbound Leads',
    desc:    'Find prospective clients using Apollo.io search, manage the resulting lead list, and run AI-generated multi-step email campaigns.',
    links:   [
      { label: 'Lead Discovery', href: '/outbound/agent'     },
      { label: 'Lead Database',  href: '/outbound/leads'     },
      { label: 'Campaigns',      href: '/outbound/campaigns' },
      { label: 'Reply Review',   href: '/outbound/replies'   },
    ],
    guide:   '/overview/outbound',
  },
  {
    title:   'Engagement',
    desc:    'Manage ongoing conversations after first contact. The AI reads the full thread history and drafts contextual replies.',
    links:   [
      { label: 'Active Contacts',    href: '/contacts'   },
      { label: 'Engagement Agent',   href: '/engagement' },
    ],
    guide:   '/overview/engagement',
  },
  {
    title:   'Analytics',
    desc:    'Track AI token usage and cost, review draft evaluation scores, and inspect the RAG knowledge index.',
    links:   [
      { label: 'AI Usage',          href: '/analytics/ai-usage'  },
      { label: 'Email Evaluations', href: '/analytics/eval'      },
      { label: 'RAG Index',         href: '/analytics/rag-index' },
    ],
    guide:   '/overview/analytics',
  },
  {
    title:   'AI Agents',
    desc:    'Four AI agents automate first-reply drafting, ongoing reply drafting, campaign sequence generation, and draft evaluation.',
    links:   [],
    guide:   '/overview/agents',
  },
  {
    title:   'Settings & Team',
    desc:    'Manage Gmail connection, email signatures, and team access.',
    links:   [
      { label: 'Settings', href: '/settings' },
      { label: 'Team',     href: '/team'     },
    ],
    guide:   null,
  },
]

// ── Page ───────────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  return (
    <div className="max-w-[740px] mx-auto px-10 py-10 pb-20">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[22px] font-bold tracking-tight text-foreground mb-1">Overview</h1>
        <p className="text-[13px] text-muted-foreground">
          Platform guide and workflow map.
        </p>
        <p className="text-[13px] text-foreground/60 leading-relaxed mt-3 max-w-[520px]">
          This section explains how the TRS platform is organized, what each area does, and how the AI agents fit into the workflow. Use the left nav to navigate between sections.
        </p>
      </div>

      {/* Platform areas */}
      <div className="mb-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground mb-3">
          Platform areas
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {AREAS.map(area => (
            <div
              key={area.title}
              className="bg-card rounded-xl p-4 flex flex-col gap-3"
              style={{ boxShadow: 'var(--card-shadow)' }}
            >
              <div>
                <p className="text-[13.5px] font-semibold text-foreground mb-1">{area.title}</p>
                <p className="text-[12px] text-muted-foreground leading-relaxed">{area.desc}</p>
              </div>

              {area.links.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {area.links.map(l => (
                    <Link
                      key={l.href}
                      href={l.href}
                      className="inline-flex items-center text-[11.5px] font-medium px-2.5 py-1 rounded-md bg-muted/50 text-muted-foreground no-underline hover:bg-muted hover:text-foreground transition-colors"
                    >
                      {l.label}
                    </Link>
                  ))}
                </div>
              )}

              {area.guide && (
                <Link
                  href={area.guide}
                  className="inline-flex items-center gap-1 text-[12px] font-medium no-underline transition-colors mt-auto"
                  style={{ color: 'hsl(var(--primary))' }}
                >
                  Read guide <ArrowRight size={12} strokeWidth={2} />
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Workflow map entry */}
      <div className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground mb-3">
          How it works
        </p>
        <div className="bg-card rounded-xl p-5 flex items-start justify-between gap-4"
          style={{ boxShadow: 'var(--card-shadow)' }}>
          <div>
            <p className="text-[13.5px] font-semibold text-foreground mb-1">Platform Workflow</p>
            <p className="text-[12px] text-muted-foreground leading-relaxed max-w-[420px]">
              A step-by-step map of the full workflow — from capturing the first inbound enquiry to converting a client. Six stages, fully integrated.
            </p>
          </div>
          <Link
            href="/overview/workflow"
            className="flex-shrink-0 inline-flex items-center gap-1.5 text-[12px] font-semibold px-3.5 py-2 rounded-lg bg-muted/50 no-underline text-foreground hover:bg-muted transition-colors whitespace-nowrap"
          >
            View workflow <ArrowRight size={12} strokeWidth={2} />
          </Link>
        </div>
      </div>

      {/* AI agents + evals */}
      <div className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground mb-3">
          AI agents and evals
        </p>
        <div className="bg-card rounded-xl p-5 flex flex-col gap-4"
          style={{ boxShadow: 'var(--card-shadow)' }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[13.5px] font-semibold text-foreground mb-1">AI Agents</p>
              <p className="text-[12px] text-muted-foreground leading-relaxed max-w-[420px]">
                Four agents handle auto-drafting of first replies, ongoing reply drafting, campaign sequence generation, and draft evaluation. Each has defined inputs, guardrails, and a human handoff step.
              </p>
            </div>
            <Link
              href="/overview/agents"
              className="flex-shrink-0 inline-flex items-center gap-1.5 text-[12px] font-semibold px-3.5 py-2 rounded-lg bg-muted/50 no-underline text-foreground hover:bg-muted transition-colors whitespace-nowrap"
            >
              View agents <ArrowRight size={12} strokeWidth={2} />
            </Link>
          </div>

          <div className="pt-3 border-t border-[--border-subtle]">
            <p className="text-[12px] font-semibold text-foreground mb-1">How evals work</p>
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              Every time you edit an AI draft before sending, the system compares what the AI wrote to what you actually sent. If they match closely, the draft scores a 5/5. If you rewrote most of it, the AI scores lower and learns from the difference — extracting a specific rule it will apply to the next reply of the same type. High-scoring replies become future examples; low scores become training signal. View results at{' '}
              <Link href="/analytics/eval" className="text-foreground underline-offset-2 hover:underline">
                Analytics → Email Evaluations
              </Link>
              .
            </p>
          </div>
        </div>
      </div>

    </div>
  )
}
