import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

const AGENTS = [
  {
    id:    '01',
    name:  'Inbound Auto-Draft',
    role:  'Drafts the first reply to every new inbound lead.',
    href:  '/overview/agents/inbound-auto-draft',
    where: 'Inbound Leads inbox',
    trigger: 'When you click "Generate Reply" on a new lead',
  },
  {
    id:    '02',
    name:  'Engagement Drafter',
    role:  'Drafts replies for all ongoing conversations after first contact.',
    href:  '/overview/agents/engagement-drafter',
    where: 'Engagement Agent',
    trigger: 'When you click "Generate AI reply" in an active thread',
  },
  {
    id:    '03',
    name:  'Campaign Drafter',
    role:  'Generates multi-step outbound email sequences for campaigns.',
    href:  '/overview/agents/campaign-drafter',
    where: 'Outbound → Campaigns',
    trigger: 'When you click "Generate with AI" in the Campaign Sequence tab',
  },
  {
    id:    '04',
    name:  'Evaluation Agent',
    role:  'Scores AI drafts after each email is sent and extracts learnings.',
    href:  '/overview/agents/evaluation-agent',
    where: 'Runs automatically after every sent email',
    trigger: 'Auto-triggered after every reply is sent',
  },
]

export default function AgentsLandingPage() {
  return (
    <div className="max-w-[740px] mx-auto px-10 py-10 pb-20">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6 text-[12px] text-muted-foreground">
        <Link href="/overview" className="no-underline hover:text-foreground transition-colors">Overview</Link>
        <span>/</span>
        <span className="text-foreground">AI Agents</span>
      </div>

      <h2 className="text-[20px] font-bold text-foreground tracking-tight mb-2">AI Agents</h2>
      <p className="text-[14px] text-muted-foreground leading-[1.7] mb-3 max-w-[520px]">
        Four AI agents run across the platform. Each one handles a specific task, uses defined inputs, and always requires a human to review and approve before anything is sent.
      </p>

      {/* Human-in-control callout */}
      <div
        className="rounded-lg px-4 py-3 mb-8"
        style={{
          background: 'rgba(15,61,145,0.05)',
          border: '1px solid rgba(15,61,145,0.18)',
          borderLeft: '4px solid rgba(15,61,145,0.4)',
        }}
      >
        <p className="text-[13px] leading-[1.65] m-0" style={{ color: '#0F3D91' }}>
          <strong>Humans remain in control.</strong> No agent sends an email on its own. Every output — draft reply, campaign sequence, or evaluation score — is surfaced for human review before any action is taken.
        </p>
      </div>

      {/* Why agents exist */}
      <div className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground mb-3">
          Why they exist
        </p>
        <div className="flex flex-col gap-2">
          {[
            { label: 'Speed',     body: 'A first reply reaches a lead within seconds of their enquiry, not hours. First impressions matter.' },
            { label: 'Context',   body: 'Agents read the full thread history, TRS knowledge base documents, and past high-quality examples before drafting — context a human would need time to gather.' },
            { label: 'Learning',  body: 'Every edit you make teaches the system. Over time, drafts require fewer changes because the agents have learned from real examples.' },
          ].map(r => (
            <div key={r.label} className="flex gap-3 items-start">
              <span
                className="flex-shrink-0 text-[11px] font-bold uppercase tracking-[0.06em] mt-px px-2 py-0.5 rounded"
                style={{ background: 'rgba(15,61,145,0.07)', color: '#0F3D91' }}
              >
                {r.label}
              </span>
              <p className="text-[13px] text-foreground/70 leading-relaxed m-0">{r.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Agent list */}
      <div className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground mb-3">
          The four agents
        </p>
        <div className="flex flex-col gap-3">
          {AGENTS.map(a => (
            <Link
              key={a.href}
              href={a.href}
              className="no-underline group"
            >
              <div
                className="bg-card border border-border rounded-xl p-4 flex items-start justify-between gap-3 transition-shadow hover:shadow-md"
                style={{ boxShadow: 'var(--card-shadow)' }}
              >
                <div className="flex gap-3 items-start">
                  <span className="text-[11px] font-bold text-muted-foreground/35 tabular-nums flex-shrink-0 mt-0.5">
                    {a.id}
                  </span>
                  <div>
                    <p className="text-[13.5px] font-semibold text-foreground mb-0.5">{a.name}</p>
                    <p className="text-[12px] text-muted-foreground leading-relaxed mb-1">{a.role}</p>
                    <p className="text-[11px] text-muted-foreground/60">
                      <span className="font-medium">Runs in:</span> {a.where}
                    </p>
                  </div>
                </div>
                <ArrowRight
                  size={14}
                  strokeWidth={2}
                  className="flex-shrink-0 text-muted-foreground/30 group-hover:text-muted-foreground/70 transition-colors mt-1"
                />
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Evals explainer link */}
      <div className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground mb-3">
          How the system improves
        </p>
        <Link href="/overview/agents/evals" className="no-underline group">
          <div
            className="bg-card border border-border rounded-xl p-4 flex items-start justify-between gap-3 transition-shadow hover:shadow-md"
            style={{ boxShadow: 'var(--card-shadow)' }}
          >
            <div>
              <p className="text-[13.5px] font-semibold text-foreground mb-0.5">How Evals Work</p>
              <p className="text-[12px] text-muted-foreground leading-relaxed">
                After every email you send, the system compares what the AI drafted to what you actually sent. Scores, learnings, and examples are accumulated automatically — no manual training step needed.
              </p>
            </div>
            <ArrowRight
              size={14}
              strokeWidth={2}
              className="flex-shrink-0 text-muted-foreground/30 group-hover:text-muted-foreground/70 transition-colors mt-1"
            />
          </div>
        </Link>
      </div>

      {/* Workflow cross-link */}
      <div className="pt-5 border-t border-border flex items-center justify-between">
        <Link
          href="/overview"
          className="text-[12px] text-muted-foreground no-underline hover:text-foreground transition-colors"
        >
          ← Back to Overview
        </Link>
        <Link
          href="/overview/workflow"
          className="text-[12px] text-muted-foreground no-underline hover:text-foreground transition-colors"
        >
          See workflow map →
        </Link>
      </div>

    </div>
  )
}
