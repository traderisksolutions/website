import Link from 'next/link'

export default function InboundAutoDraftPage() {
  return (
    <div className="max-w-[680px] mx-auto px-10 py-10 pb-20">

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 mb-6 text-[12px] text-muted-foreground flex-wrap">
        <Link href="/overview" className="no-underline hover:text-foreground transition-colors">Overview</Link>
        <span>/</span>
        <Link href="/overview/agents" className="no-underline hover:text-foreground transition-colors">AI Agents</Link>
        <span>/</span>
        <span className="text-foreground">Inbound Auto-Draft</span>
      </div>

      {/* Header */}
      <div className="mb-7">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground/55 mb-1">Agent 01 · Gemini 2.5 Flash</p>
        <h1 className="text-[20px] font-bold tracking-tight text-foreground mb-2">Inbound Auto-Draft</h1>
        <p className="text-[14px] text-muted-foreground leading-[1.7]">
          Drafts the first reply to every new inbound lead. Runs after a lead submits a website form, sends a direct email, or contacts via WhatsApp.
        </p>
      </div>

      {/* What triggers it */}
      <AgentSection label="What triggers it">
        <p className="text-[13px] text-foreground/75 leading-[1.7] m-0">
          You click <strong>Generate Reply</strong> on any lead in the Inbound Leads inbox. The agent does not send anything automatically — the trigger is always a human action in the inbox.
        </p>
      </AgentSection>

      {/* What it reads */}
      <AgentSection label="What it reads">
        <ul className="m-0 pl-0 list-none flex flex-col gap-2">
          {[
            { label: "Lead's message",     body: "The original enquiry text submitted by the contact." },
            { label: "Name and topic",     body: "Used to open the reply with 'Hi [Name],' and frame context appropriately." },
            { label: "Knowledge base",     body: "Relevant documents from Google Drive — FAQs, product sheets, coverage guides — retrieved via semantic search." },
            { label: "Strong examples",    body: "Past replies that scored 4 or 5 out of 5 in evaluation. These set the tone and quality bar." },
            { label: "Anti-patterns",      body: "Low-scoring past replies (1–3). The agent uses these to avoid mistakes it or others have made before." },
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

      {/* What it produces */}
      <AgentSection label="What it produces">
        <p className="text-[13px] text-foreground/75 leading-[1.7] mb-3">
          A 3–5 sentence first-contact reply. The draft:
        </p>
        <ul className="m-0 pl-0 list-none flex flex-col gap-1.5">
          {[
            'Opens with "Hi [Name]," — never "Dear" or "Hello"',
            'Acknowledges what the contact asked about',
            'Provides a relevant but cautious answer — no pricing, no policy specifics',
            'Ends with a clear next step (e.g. a question or offer to call)',
            'Does not include a signature — you add that when you send',
          ].map(item => (
            <li key={item} className="flex gap-2.5 items-start">
              <span className="flex-shrink-0 text-foreground/30 mt-0.5 text-[11px]">—</span>
              <span className="text-[13px] text-foreground/75 leading-relaxed">{item}</span>
            </li>
          ))}
        </ul>
      </AgentSection>

      {/* Guardrails */}
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
            The agent is designed to <strong>never quote pricing, premium amounts, or specific policy numbers</strong>. If a draft contains this kind of information, treat it as an error and edit before sending.
          </p>
        </div>
        <ul className="m-0 pl-0 list-none flex flex-col gap-1.5">
          {[
            'Temperature 0.4 — controlled output, not creative or unpredictable',
            'Will not process leads that have no email address (e.g. WhatsApp-only contacts without a provided email)',
            'Does not access external websites or real-time data — only the knowledge base and stored examples',
          ].map(item => (
            <li key={item} className="flex gap-2.5 items-start">
              <span className="flex-shrink-0 text-foreground/30 mt-0.5 text-[11px]">—</span>
              <span className="text-[13px] text-foreground/75 leading-relaxed">{item}</span>
            </li>
          ))}
        </ul>
      </AgentSection>

      {/* Human review */}
      <AgentSection label="Human review and handoff">
        <p className="text-[13px] text-foreground/75 leading-[1.7] mb-3">
          The draft appears in the right panel of the Inbound Leads inbox. No email is sent until you act.
        </p>
        <div className="flex flex-col gap-2.5">
          {[
            { n: '1', step: 'Read the draft', body: 'Check that the tone matches, the answer is appropriate, and nothing is fabricated or overstated.' },
            { n: '2', step: 'Edit if needed', body: 'The reply box is fully editable. Change anything — the agent will not object or override.' },
            { n: '3', step: 'Click Send Reply', body: 'The email is sent from operations@trade-risksol.com. The lead status changes from New → Contacted, and the thread is added to the Engagement Agent automatically.' },
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
      </AgentSection>

      {/* Where in platform */}
      <AgentSection label="Where it appears">
        <div className="flex flex-col gap-2">
          <PlatformLink href="/inbound/email" label="Inbound Leads → Email Inbox" desc="Where leads arrive and where you review the draft" />
          <PlatformLink href="/overview/workflow" label="Platform Workflow" desc="See where this fits in the end-to-end flow" />
        </div>
      </AgentSection>

      {/* Footer nav */}
      <div className="pt-5 border-t border-[--border-subtle] flex items-center justify-between flex-wrap gap-3">
        <Link href="/overview/agents" className="text-[12px] text-muted-foreground no-underline hover:text-foreground transition-colors">
          ← AI Agents
        </Link>
        <Link href="/overview/agents/engagement-drafter" className="text-[12px] text-muted-foreground no-underline hover:text-foreground transition-colors">
          Next: Engagement Drafter →
        </Link>
      </div>

    </div>
  )
}

function AgentSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground/55 mb-2">
        {label}
      </h2>
      <div className="pl-0">{children}</div>
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
