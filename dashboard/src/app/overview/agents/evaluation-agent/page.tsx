import Link from 'next/link'

const SCORE_LEVELS = [
  { score: '5 / 5', label: 'Sent almost as written',   color: '#16a34a', desc: 'The AI draft was accurate enough that you sent it with minimal changes. The draft is saved as a positive example for future use.'          },
  { score: '4 / 5', label: 'Small but useful edits',   color: '#16a34a', desc: 'You improved the draft with meaningful but limited changes. Also saved as a positive example.'                                             },
  { score: '3 / 5', label: 'Significant rewrites',     color: '#d97706', desc: 'Substantial changes were made. The system captures what changed and why to avoid similar patterns.'                                         },
  { score: '2 / 5', label: 'Major rewrite',            color: '#dc2626', desc: 'Most of the draft was replaced. The system extracts a specific rule for this email type and injects it into future prompts automatically.'  },
  { score: '1 / 5', label: 'Started from scratch',     color: '#dc2626', desc: 'The sent email bore little resemblance to the AI draft. A stronger anti-pattern is captured and applied immediately.'                      },
]

export default function EvaluationAgentPage() {
  return (
    <div className="max-w-[680px] mx-auto px-10 py-10 pb-20">

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 mb-6 text-[12px] text-muted-foreground flex-wrap">
        <Link href="/overview" className="no-underline hover:text-foreground transition-colors">Overview</Link>
        <span>/</span>
        <Link href="/overview/agents" className="no-underline hover:text-foreground transition-colors">AI Agents</Link>
        <span>/</span>
        <span className="text-foreground">Evaluation Agent</span>
      </div>

      {/* Header */}
      <div className="mb-7">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground/55 mb-1">Agent 04 · Gemini 2.5 Flash</p>
        <h1 className="text-[20px] font-bold tracking-tight text-foreground mb-2">Evaluation Agent</h1>
        <p className="text-[14px] text-muted-foreground leading-[1.7]">
          Automatically scores AI drafts after each email is sent. Compares what the AI wrote to what you actually sent, then extracts learnings that improve future drafts.
        </p>
      </div>

      <AgentSection label="What triggers it">
        <p className="text-[13px] text-foreground/75 leading-[1.7] mb-2">
          Automatically after every reply is sent from the platform — inbound replies and engagement replies both. You do not need to take any action to trigger it.
        </p>
        <p className="text-[13px] text-foreground/75 leading-[1.7] m-0">
          It only runs when an AI draft exists for the sent email. If you wrote a reply from scratch without generating a draft first, there is nothing to evaluate.
        </p>
      </AgentSection>

      <AgentSection label="What it reads">
        <ul className="m-0 pl-0 list-none flex flex-col gap-2">
          {[
            { label: 'AI draft body',        body: 'What the agent originally produced. Signatures are stripped before comparison so they do not affect the score.' },
            { label: 'Sent email body',      body: 'What you actually sent. Signatures are stripped here too.' },
            { label: 'Original enquiry',     body: 'The client\'s inbound email that prompted the draft — gives context for what the reply was trying to achieve.' },
            { label: 'Email type',           body: 'PRICING, COVERAGE, RENEWAL, DOCUMENT, CLAIMS, or CONVERSATION — determines which type-specific rules to apply when extracting learnings.' },
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
          For each evaluated email, the agent records:
        </p>
        <ul className="m-0 pl-0 list-none flex flex-col gap-1.5 mb-4">
          {[
            'A score from 1 to 5',
            'What the human changed in the draft (summary)',
            'Why the human version was better',
            'A key learning — a specific rule for this email type',
            'A context summary of the conversation',
          ].map(item => (
            <li key={item} className="flex gap-2.5 items-start">
              <span className="flex-shrink-0 text-foreground/30 mt-0.5 text-[11px]">—</span>
              <span className="text-[13px] text-foreground/75 leading-relaxed">{item}</span>
            </li>
          ))}
        </ul>
        <p className="text-[13px] text-foreground/70 leading-[1.7] m-0">
          All results are visible at <Link href="/analytics/eval" className="underline-offset-2 hover:underline" style={{ color: '#0F3D91' }}>Analytics → Email Evaluations</Link>.
        </p>
      </AgentSection>

      <AgentSection label="The 1–5 score scale">
        <div className="flex flex-col gap-2">
          {SCORE_LEVELS.map(s => (
            <div key={s.score} className="flex gap-3 items-start">
              <span
                className="flex-shrink-0 text-[11px] font-bold px-2 py-0.5 rounded tabular-nums"
                style={{ background: s.color + '14', color: s.color, minWidth: 36, textAlign: 'center' }}
              >
                {s.score}
              </span>
              <div>
                <p className="text-[12.5px] font-semibold text-foreground m-0 mb-0.5">{s.label}</p>
                <p className="text-[12px] text-foreground/65 leading-relaxed m-0">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </AgentSection>

      <AgentSection label="Guardrails and technical notes">
        <ul className="m-0 pl-0 list-none flex flex-col gap-2">
          {[
            { label: 'Temperature 0',               body: 'The evaluation is fully deterministic. The same inputs will always produce the same score — there is no randomness in the judgment.' },
            { label: '95% overlap threshold',       body: 'If the sent email matches the AI draft at 95% or above, a score of 5 is assigned automatically without calling the model. This saves API cost and ensures high-confidence identical drafts are not unnecessarily evaluated.' },
            { label: 'Score ≤ 3 → anti-pattern',   body: 'Key learnings from low-scoring drafts are automatically injected into future prompts for that email type as AVOID patterns. No manual step needed.' },
            { label: 'Score ≥ 4 → positive example', body: 'The sent reply is saved as a few-shot example. Future drafts of that email type reference it to calibrate tone and structure.' },
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

      <AgentSection label="Human review and handoff">
        <p className="text-[13px] text-foreground/75 leading-[1.7] mb-3">
          No approval is needed — the evaluation runs and its outputs are applied automatically. Humans interact with the results in two ways:
        </p>
        <div className="flex flex-col gap-2">
          <div
            className="rounded-lg px-3.5 py-2.5 flex gap-2.5 items-start"
            style={{ background: 'rgba(15,61,145,0.05)', border: '1px solid rgba(15,61,145,0.15)' }}
          >
            <span className="flex-shrink-0 text-[11px] font-bold text-primary mt-0.5">REVIEW</span>
            <p className="text-[12.5px] text-foreground/75 leading-relaxed m-0">
              Visit <Link href="/analytics/eval" className="underline-offset-2 hover:underline font-medium" style={{ color: '#0F3D91' }}>Analytics → Email Evaluations</Link> to see all scores, what changed in each draft, and the key learnings grouped by email type.
            </p>
          </div>
          <div
            className="rounded-lg px-3.5 py-2.5 flex gap-2.5 items-start"
            style={{ background: 'rgba(15,61,145,0.05)', border: '1px solid rgba(15,61,145,0.15)' }}
          >
            <span className="flex-shrink-0 text-[11px] font-bold text-primary mt-0.5">IMPROVE</span>
            <p className="text-[12.5px] text-foreground/75 leading-relaxed m-0">
              The <strong>Synthesise Prompt Improvements</strong> button on that page runs an additional pass that groups all learnings per email type and writes refined, consolidated rules directly into the prompt.
            </p>
          </div>
        </div>
      </AgentSection>

      <AgentSection label="Where it appears">
        <div className="flex flex-col gap-2">
          <PlatformLink href="/analytics/eval"       label="Analytics → Email Evaluations" desc="All scores, learnings, examples, and the synthesis tool" />
          <PlatformLink href="/overview/agents/evals" label="How Evals Work"               desc="Plain-language explainer of the full eval cycle" />
          <PlatformLink href="/overview/workflow"     label="Platform Workflow"             desc="See where evaluation fits in the end-to-end flow" />
        </div>
      </AgentSection>

      <div className="pt-5 border-t border-border flex items-center justify-between flex-wrap gap-3">
        <Link href="/overview/agents/campaign-drafter" className="text-[12px] text-muted-foreground no-underline hover:text-foreground transition-colors">
          ← Campaign Drafter
        </Link>
        <Link href="/overview/agents/evals" className="text-[12px] text-muted-foreground no-underline hover:text-foreground transition-colors">
          Next: How Evals Work →
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
      className="flex items-start gap-3 px-3.5 py-2.5 rounded-lg border border-border bg-card no-underline hover:border-muted-foreground/30 transition-colors"
      style={{ boxShadow: 'var(--card-shadow)' }}
    >
      <div>
        <p className="text-[12.5px] font-semibold text-foreground m-0 mb-0.5">{label}</p>
        <p className="text-[11.5px] text-muted-foreground m-0">{desc}</p>
      </div>
    </Link>
  )
}
