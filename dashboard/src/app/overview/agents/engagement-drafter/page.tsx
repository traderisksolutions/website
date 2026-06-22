import Link from 'next/link'

const EMAIL_TYPES = [
  { type: 'PRICING',      color: '#2563eb', desc: 'Requests for quotes, premiums, or cost information'     },
  { type: 'COVERAGE',     color: '#7c3aed', desc: 'Questions about what a policy does or does not cover'   },
  { type: 'RENEWAL',      color: '#d97706', desc: 'Renewal reminders, terms changes, or continuation'      },
  { type: 'DOCUMENT',     color: '#0891b2', desc: 'Requests for certificates, policy copies, or paperwork' },
  { type: 'CLAIMS',       color: '#dc2626', desc: 'Incidents, notifications, or claims-related queries'    },
  { type: 'CONVERSATION', color: '#059669', desc: 'General follow-ups that do not fit another category'    },
]

export default function EngagementDrafterPage() {
  return (
    <div className="max-w-[680px] mx-auto px-10 py-10 pb-20">

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 mb-6 text-[12px] text-muted-foreground flex-wrap">
        <Link href="/overview" className="no-underline hover:text-foreground transition-colors">Overview</Link>
        <span>/</span>
        <Link href="/overview/agents" className="no-underline hover:text-foreground transition-colors">AI Agents</Link>
        <span>/</span>
        <span className="text-foreground">Engagement Drafter</span>
      </div>

      {/* Header */}
      <div className="mb-7">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground/55 mb-1">Agent 02 · Gemini 2.5 Flash</p>
        <h1 className="text-[20px] font-bold tracking-tight text-foreground mb-2">Engagement Drafter</h1>
        <p className="text-[14px] text-muted-foreground leading-[1.7]">
          Drafts replies for all ongoing conversations after first contact. Reads the full thread history before producing each draft.
        </p>
      </div>

      <AgentSection label="What triggers it">
        <p className="text-[13px] text-foreground/75 leading-[1.7] m-0">
          You click <strong>Generate AI reply</strong> at the bottom of any active thread in the Engagement Agent. The agent reads the conversation, then produces a draft. This can be triggered as many times as needed in a single thread.
        </p>
      </AgentSection>

      <AgentSection label="What it reads">
        <ul className="m-0 pl-0 list-none flex flex-col gap-2">
          {[
            { label: 'Full thread history',    body: 'Up to 15 messages in the conversation — client emails and your outbound replies, in order.' },
            { label: 'Knowledge base',         body: 'TRS Google Drive documents — FAQs, coverage guides, product specs — retrieved by semantic relevance to the conversation.' },
            { label: 'Email type',             body: 'The agent classifies the client\'s email into one of six categories (see below) and applies category-specific writing rules.' },
            { label: 'Strong examples',        body: 'Past replies scoring 4 or 5 that match the detected email type. These guide tone and structure.' },
            { label: 'Anti-patterns',          body: 'Past replies scoring 1–3 for this email type. The agent avoids patterns that led to heavy editing.' },
            { label: 'Campaign context',       body: 'If the contact was originally an outbound lead, campaign information is included to maintain sequence consistency.' },
          ].map(i => (
            <li key={i.label} className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-foreground/25 mt-2" />
              <span className="text-[13px] leading-relaxed text-foreground/75">
                <strong className="text-foreground font-semibold">{i.label}</strong> — {i.body}
              </span>
            </li>
          ))}
        </ul>
      </AgentSection>

      <AgentSection label="Email type classification">
        <p className="text-[13px] text-foreground/75 leading-[1.7] mb-3">
          The agent identifies which type of email the client sent and applies category-specific writing rules before drafting.
        </p>
        <div className="flex flex-col gap-1.5">
          {EMAIL_TYPES.map(t => (
            <div key={t.type} className="flex items-start gap-3">
              <span
                className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded tabular-nums uppercase tracking-wide mt-0.5"
                style={{ background: t.color + '14', color: t.color }}
              >
                {t.type}
              </span>
              <span className="text-[12.5px] text-foreground/70 leading-snug">{t.desc}</span>
            </div>
          ))}
        </div>
      </AgentSection>

      <AgentSection label="What it produces">
        <p className="text-[13px] text-foreground/75 leading-[1.7] mb-3">
          A contextual follow-up reply appropriate to the detected email type. The draft:
        </p>
        <ul className="m-0 pl-0 list-none flex flex-col gap-1.5">
          {[
            'Picks up directly from where the conversation left off',
            'References specific details from the thread (amounts, dates, cover types mentioned)',
            'Does not include a closing line ("Kind regards", etc.) — you add that via the Sign as selector',
            'Does not include a signature — selected separately before sending',
            'Is structured for professional email — no casual phrasing unless the thread established that tone',
          ].map(item => (
            <li key={item} className="flex gap-2.5 items-start">
              <span className="flex-shrink-0 text-foreground/30 mt-0.5 text-[11px]">—</span>
              <span className="text-[13px] text-foreground/75 leading-relaxed">{item}</span>
            </li>
          ))}
        </ul>
      </AgentSection>

      <AgentSection label="Guardrails and boundaries">
        <div
          className="rounded-lg px-4 py-3 mb-3"
          style={{
            background: 'rgba(194,122,7,0.05)',
            border: '1px solid rgba(194,122,7,0.22)',
            borderLeft: '4px solid rgba(194,122,7,0.4)',
          }}
        >
          <p className="text-[12.5px] leading-[1.65] m-0" style={{ color: '#92400e' }}>
            <strong>The agent will not fabricate coverage terms, policy numbers, or pricing</strong> that are not present in the knowledge base or thread. If a draft includes this, edit before sending.
          </p>
        </div>
        <ul className="m-0 pl-0 list-none flex flex-col gap-1.5">
          {[
            'Temperature 0.3 — tighter and more conservative than the inbound agent',
            'For CLAIMS emails: designed to acknowledge the situation without making promises about outcomes or coverage decisions',
            'Enforces a banned phrases list to avoid language that could create legal or regulatory risk',
            'Does not access external websites or real-time data during drafting',
          ].map(item => (
            <li key={item} className="flex gap-2.5 items-start">
              <span className="flex-shrink-0 text-foreground/30 mt-0.5 text-[11px]">—</span>
              <span className="text-[13px] text-foreground/75 leading-relaxed">{item}</span>
            </li>
          ))}
        </ul>
      </AgentSection>

      <AgentSection label="Human review and handoff">
        <p className="text-[13px] text-foreground/75 leading-[1.7] mb-3">
          The draft appears in the compose panel at the bottom of the thread. No email is sent until you click Approve &amp; Send.
        </p>
        <div className="flex flex-col gap-2.5">
          {[
            { n: '1', step: 'Read the draft',         body: 'Check that the content is accurate, the tone is right, and that nothing has been invented or overstated.' },
            { n: '2', step: 'Edit freely',             body: 'The compose panel is a full rich text editor. Bold, lists, and links are all preserved when the email is sent.' },
            { n: '3', step: 'Select your signature',   body: 'Use the Sign as dropdown to choose whose signature appears. The signature is added below the draft.' },
            { n: '4', step: 'Click Approve & Send',   body: 'Sent from operations@trade-risksol.com. The amber "Needs reply" indicator clears from the conversation list.' },
          ].map(s => (
            <div key={s.n} className="flex gap-3 items-start">
              <span
                className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold text-white mt-0.5"
                style={{ background: '#0F3D91' }}
              >
                {s.n}
              </span>
              <div>
                <p className="text-[12.5px] font-semibold text-foreground mb-0.5">{s.step}</p>
                <p className="text-[12.5px] text-foreground/65 leading-relaxed m-0">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
        <div
          className="mt-3 rounded-lg px-3.5 py-2.5"
          style={{ background: 'rgba(15,61,145,0.05)', border: '1px solid rgba(15,61,145,0.15)', borderLeft: '3px solid rgba(15,61,145,0.25)' }}
        >
          <p className="text-[12px] leading-relaxed m-0" style={{ color: '#0F3D91' }}>
            Draft edits auto-save after 2 seconds of inactivity. If you close the thread and come back, your in-progress edit is still there.
          </p>
        </div>
      </AgentSection>

      <AgentSection label="Where it appears">
        <div className="flex flex-col gap-2">
          <PlatformLink href="/engagement"         label="Engagement Agent"    desc="Where you manage active threads and generate drafts" />
          <PlatformLink href="/contacts"           label="Active Contacts"     desc="Pipeline view — all contacts by stage" />
          <PlatformLink href="/overview/workflow"  label="Platform Workflow"   desc="See where this fits in the end-to-end flow" />
        </div>
      </AgentSection>

      <div className="pt-5 border-t border-[--border-subtle] flex items-center justify-between flex-wrap gap-3">
        <Link href="/overview/agents/inbound-auto-draft" className="text-[12px] text-muted-foreground no-underline hover:text-foreground transition-colors">
          ← Inbound Auto-Draft
        </Link>
        <Link href="/overview/agents/campaign-drafter" className="text-[12px] text-muted-foreground no-underline hover:text-foreground transition-colors">
          Next: Campaign Drafter →
        </Link>
      </div>

    </div>
  )
}

function AgentSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground/55 mb-2">{label}</h2>
      <div>{children}</div>
    </div>
  )
}

function PlatformLink({ href, label, desc }: { href: string; label: string; desc: string }) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 px-3.5 py-2.5 rounded-lg bg-card no-underline hover:bg-accent/60 transition-colors"
      style={{ boxShadow: 'var(--card-shadow)' }}
    >
      <div>
        <p className="text-[12.5px] font-semibold text-foreground m-0 mb-0.5">{label}</p>
        <p className="text-[11.5px] text-muted-foreground m-0">{desc}</p>
      </div>
    </Link>
  )
}
