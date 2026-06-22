import Link from 'next/link'

export default function CampaignDrafterPage() {
  return (
    <div className="max-w-[680px] mx-auto px-10 py-10 pb-20">

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 mb-6 text-[12px] text-muted-foreground flex-wrap">
        <Link href="/overview" className="no-underline hover:text-foreground transition-colors">Overview</Link>
        <span>/</span>
        <Link href="/overview/agents" className="no-underline hover:text-foreground transition-colors">AI Agents</Link>
        <span>/</span>
        <span className="text-foreground">Campaign Drafter</span>
      </div>

      {/* Header */}
      <div className="mb-7">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground/55 mb-1">Agent 03 · Gemini 2.5 Flash</p>
        <h1 className="text-[20px] font-bold tracking-tight text-foreground mb-2">Campaign Drafter</h1>
        <p className="text-[14px] text-muted-foreground leading-[1.7]">
          Generates a multi-step outbound email sequence for a campaign. Each step is personalised to the lead profiles in the campaign and grounded in a relevant news hook.
        </p>
      </div>

      <AgentSection label="What triggers it">
        <p className="text-[13px] text-foreground/75 leading-[1.7] m-0">
          You click <strong>Generate with AI</strong> in the Campaign Sequence tab of an outbound campaign. The campaign must already have a target lead set assigned before generating.
        </p>
      </AgentSection>

      <AgentSection label="What it reads">
        <ul className="m-0 pl-0 list-none flex flex-col gap-2">
          {[
            { label: 'Campaign product type',   body: 'The type of insurance or product this campaign is targeting — used to frame the angle and relevance of each email.' },
            { label: 'Lead profiles',           body: 'Title, company name, industry, and employee headcount for each selected lead. The agent uses these to personalise each step.' },
            { label: 'News hook URL',           body: 'A relevant industry news article. If not provided manually, the agent attempts to retrieve one automatically based on the campaign topic.' },
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

      <AgentSection label="What it produces">
        <p className="text-[13px] text-foreground/75 leading-[1.7] mb-3">
          A 3–5 step email sequence displayed in the Campaign Sequence tab. For each step:
        </p>
        <ul className="m-0 pl-0 list-none flex flex-col gap-1.5">
          {[
            'A subject line appropriate to that step in the sequence',
            'An email body personalised to the lead profiles assigned to the campaign',
            'A send delay (in days) from the previous step',
            'The first email references the news hook to establish relevance',
          ].map(item => (
            <li key={item} className="flex gap-2.5 items-start">
              <span className="flex-shrink-0 text-foreground/30 mt-0.5 text-[11px]">—</span>
              <span className="text-[13px] text-foreground/75 leading-relaxed">{item}</span>
            </li>
          ))}
        </ul>
        <p className="text-[13px] text-foreground/70 leading-[1.7] mt-3 mb-0">
          The sequence targets the lead set as a group — it is not personalised at the individual email level. Personalisation tokens (first name, company) are filled by Instantly at send time.
        </p>
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
            <strong>Nothing is sent until a human reviews and approves every step.</strong> The campaign launch button is only available after all steps have been reviewed.
          </p>
        </div>
        <ul className="m-0 pl-0 list-none flex flex-col gap-1.5">
          {[
            'Each generated sequence is a draft — it has no effect until you approve and click Launch',
            'You can edit any step, delete steps, or regenerate specific steps before launching',
            'The agent does not have access to previous campaign sequences or reply data — each generation starts fresh',
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
          The generated sequence appears in the Campaign Sequence tab for step-by-step review. No email leaves the platform until you approve and launch.
        </p>
        <div className="flex flex-col gap-2.5">
          {[
            { n: '1', step: 'Review each step',       body: 'Read the subject line and body for every step in the sequence. Check relevance, tone, and factual accuracy.' },
            { n: '2', step: 'Edit as needed',          body: 'Each step is editable in place. Adjust the angle, add specifics, or rewrite sections that do not fit.' },
            { n: '3', step: 'Adjust send delays',      body: 'Set how many days pass between each step in the sequence. Defaults are generated but can be changed.' },
            { n: '4', step: 'Click Launch',            body: 'Activates the campaign in Instantly. Emails are scheduled and delivered automatically to the assigned lead set.' },
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
            When a lead replies to a campaign email, that reply is routed into the Engagement Agent automatically. From that point the Engagement Drafter handles follow-up replies.
          </p>
        </div>
      </AgentSection>

      <AgentSection label="Where it appears">
        <div className="flex flex-col gap-2">
          <PlatformLink href="/outbound/campaigns"  label="Outbound → Campaigns"       desc="Where you build, generate, and launch campaign sequences" />
          <PlatformLink href="/outbound/leads"      label="Outbound → Lead Database"   desc="The lead set you assign to a campaign before generating" />
          <PlatformLink href="/overview/workflow"   label="Platform Workflow"           desc="See where outbound fits in the end-to-end flow" />
        </div>
      </AgentSection>

      <div className="pt-5 border-t border-[--border-subtle] flex items-center justify-between flex-wrap gap-3">
        <Link href="/overview/agents/engagement-drafter" className="text-[12px] text-muted-foreground no-underline hover:text-foreground transition-colors">
          ← Engagement Drafter
        </Link>
        <Link href="/overview/agents/evaluation-agent" className="text-[12px] text-muted-foreground no-underline hover:text-foreground transition-colors">
          Next: Evaluation Agent →
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
