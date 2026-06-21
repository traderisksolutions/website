import Link from 'next/link'

export default function EvalsExplainerPage() {
  return (
    <div className="max-w-[680px] mx-auto px-10 py-10 pb-20">

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 mb-6 text-[12px] text-muted-foreground flex-wrap">
        <Link href="/overview" className="no-underline hover:text-foreground transition-colors">Overview</Link>
        <span>/</span>
        <Link href="/overview/agents" className="no-underline hover:text-foreground transition-colors">AI Agents</Link>
        <span>/</span>
        <span className="text-foreground">How Evals Work</span>
      </div>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[20px] font-bold tracking-tight text-foreground mb-2">How Evals Work</h1>
        <p className="text-[14px] text-muted-foreground leading-[1.7]">
          Every email you send teaches the AI. This page explains how that works in plain language — no technical background needed.
        </p>
      </div>

      {/* What is an eval */}
      <Section label="What is an eval?">
        <p className="text-[13px] text-foreground/75 leading-[1.7] m-0">
          An eval (short for evaluation) is what happens automatically after every email you send. The system looks at two things: what the AI drafted and what you actually sent. It compares the two and records a score between 1 and 5.
        </p>
      </Section>

      {/* Why the comparison matters */}
      <Section label="Why compare the draft to what you sent?">
        <p className="text-[13px] text-foreground/75 leading-[1.7] mb-3">
          Every time you edit an AI draft before sending, you are implicitly telling the system something: <em>this draft wasn&apos;t quite right</em>. Every time you send it mostly unchanged, you are saying: <em>this draft was good</em>.
        </p>
        <p className="text-[13px] text-foreground/75 leading-[1.7] m-0">
          The evaluation captures that signal automatically. You do not need to write feedback or rate anything manually — your editing behaviour is the feedback.
        </p>
      </Section>

      {/* Score scale */}
      <Section label="What the scores mean">
        <div className="flex flex-col gap-0 rounded-xl overflow-hidden border border-border" style={{ boxShadow: 'var(--card-shadow)' }}>
          {[
            { score: '5',  bg: '#dcfce7', fg: '#15803d', label: 'Sent almost as written',   body: 'The draft was accurate and appropriate. You sent it with minimal changes. The AI got it right.' },
            { score: '4',  bg: '#dcfce7', fg: '#15803d', label: 'Small but useful edits',   body: 'The draft was good but you improved it with meaningful tweaks. Still treated as a positive result.' },
            { score: '3',  bg: '#fef9c3', fg: '#a16207', label: 'Significant rewrites',     body: 'You changed a lot — different approach, restructured content, or corrected something material.' },
            { score: '2',  bg: '#fee2e2', fg: '#b91c1c', label: 'Major rewrite',            body: 'Most of the draft was replaced. The AI missed the mark on tone, content, or approach.' },
            { score: '1',  bg: '#fee2e2', fg: '#b91c1c', label: 'Started from scratch',     body: 'What you sent looked nothing like what the AI produced. The draft wasn\'t usable at all.' },
          ].map((s, i, arr) => (
            <div
              key={s.score}
              className="flex items-start gap-3 px-4 py-3"
              style={{ borderBottom: i < arr.length - 1 ? '1px solid hsl(var(--border))' : 'none' }}
            >
              <span
                className="flex-shrink-0 text-[13px] font-bold w-7 h-7 rounded-full flex items-center justify-center mt-0.5"
                style={{ background: s.bg, color: s.fg }}
              >
                {s.score}
              </span>
              <div>
                <p className="text-[12.5px] font-semibold text-foreground m-0 mb-0.5">{s.label}</p>
                <p className="text-[12px] text-foreground/65 leading-relaxed m-0">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* What happens with results */}
      <Section label="What happens after the score is recorded?">
        <div className="flex flex-col gap-3 mb-3">

          <div
            className="rounded-xl px-4 py-3.5"
            style={{ background: 'rgba(15,138,95,0.05)', border: '1px solid rgba(15,138,95,0.18)', borderLeft: '4px solid rgba(15,138,95,0.4)' }}
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.07em] mb-1.5 m-0" style={{ color: '#0F8A5F' }}>
              Score 4 or 5 — the draft becomes an example
            </p>
            <p className="text-[13px] leading-relaxed m-0" style={{ color: 'rgba(16,24,40,0.75)' }}>
              The sent reply is saved as a high-quality example for that email type (e.g. PRICING, COVERAGE, CLAIMS). Next time the AI drafts a reply of the same type, it references this example to match your style and standard.
            </p>
          </div>

          <div
            className="rounded-xl px-4 py-3.5"
            style={{ background: 'rgba(194,122,7,0.05)', border: '1px solid rgba(194,122,7,0.22)', borderLeft: '4px solid rgba(194,122,7,0.4)' }}
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.07em] mb-1.5 m-0" style={{ color: '#C27A07' }}>
              Score 1, 2, or 3 — a rule is extracted
            </p>
            <p className="text-[13px] leading-relaxed m-0" style={{ color: 'rgba(16,24,40,0.75)' }}>
              The system reads what changed and why, then writes a specific rule — for example, <em>&ldquo;do not open COVERAGE emails with the client&apos;s company name&rdquo;</em>. That rule is automatically added to the AI&apos;s prompt for that email type. The next draft of the same type will avoid that pattern.
            </p>
          </div>

        </div>
        <p className="text-[13px] text-foreground/65 leading-[1.7] m-0">
          Both loops run after every single email sent. There is no batch processing or manual trigger required — it all happens in the background.
        </p>
      </Section>

      {/* The shortcut */}
      <Section label="The 95% shortcut">
        <p className="text-[13px] text-foreground/75 leading-[1.7] m-0">
          If the email you sent matches the AI draft at 95% or above — meaning you barely changed anything — the system assigns a score of 5 automatically without calling the AI model. This keeps costs low and avoids unnecessary processing for drafts that were clearly good enough.
        </p>
      </Section>

      {/* Prompt improvement */}
      <Section label="Synthesise Prompt Improvements">
        <p className="text-[13px] text-foreground/75 leading-[1.7] mb-3">
          As evaluations accumulate, individual rules can stack up. The <Link href="/analytics/eval" className="underline-offset-2 hover:underline font-medium" style={{ color: '#0F3D91' }}>Analytics → Email Evaluations</Link> page includes a <strong>Synthesise Prompt Improvements</strong> button that runs an additional pass: it groups all raw learnings per email type and rewrites them into a cleaner, more precise set of rules.
        </p>
        <p className="text-[13px] text-foreground/75 leading-[1.7] m-0">
          The synthesised rules replace the raw learnings in the prompt — making the AI&apos;s guidance sharper and more consistent. This is optional and only worth running once a meaningful number of evaluations have been recorded.
        </p>
      </Section>

      {/* What employees should know / not worry about */}
      <Section label="What you should and should not worry about">
        <div className="flex flex-col gap-3">
          <div
            className="rounded-xl px-4 py-3.5"
            style={{ background: 'rgba(15,61,145,0.05)', border: '1px solid rgba(15,61,145,0.15)' }}
          >
            <p className="text-[12.5px] font-semibold text-foreground mb-2">Worth knowing</p>
            <ul className="m-0 pl-0 list-none flex flex-col gap-1.5">
              {[
                'Editing AI drafts is good — it makes future drafts better. Do not avoid editing to keep scores high.',
                'The scores measure AI draft quality, not your performance. A score of 2 means the AI missed the mark, not you.',
                'The more you use the platform and edit drafts, the faster the AI improves.',
              ].map(item => (
                <li key={item} className="flex gap-2.5 items-start">
                  <span className="flex-shrink-0 text-foreground/30 mt-0.5 text-[11px]">—</span>
                  <span className="text-[13px] text-foreground/75 leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div
            className="rounded-xl px-4 py-3.5"
            style={{ background: 'rgba(20,30,50,0.03)', border: '1px solid rgba(20,30,50,0.10)' }}
          >
            <p className="text-[12.5px] font-semibold text-foreground mb-2">Not worth worrying about</p>
            <ul className="m-0 pl-0 list-none flex flex-col gap-1.5">
              {[
                'Low scores on individual emails are normal, especially early on. The system needs a range of examples to learn from.',
                'You do not need to track scores manually — results and learnings are collected automatically in Analytics.',
                'You do not need to re-evaluate anything. Evaluations run once per sent email and the result is stored permanently.',
              ].map(item => (
                <li key={item} className="flex gap-2.5 items-start">
                  <span className="flex-shrink-0 text-foreground/30 mt-0.5 text-[11px]">—</span>
                  <span className="text-[13px] text-foreground/75 leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* Footer */}
      <div className="pt-5 border-t border-border flex items-center justify-between flex-wrap gap-3">
        <Link href="/overview/agents/evaluation-agent" className="text-[12px] text-muted-foreground no-underline hover:text-foreground transition-colors">
          ← Evaluation Agent
        </Link>
        <Link href="/analytics/eval" className="text-[12px] text-muted-foreground no-underline hover:text-foreground transition-colors">
          View Email Evaluations →
        </Link>
      </div>

    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-7">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground/55 mb-2.5">{label}</h2>
      <div>{children}</div>
    </div>
  )
}
