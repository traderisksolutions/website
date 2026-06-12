'use client'

import { useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

type Section = {
  id:      string
  title:   string
  emoji:   string
  content: React.ReactNode
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function H2({ children }: { children: React.ReactNode }) {
  return <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: '#111', letterSpacing: '-0.02em' }}>{children}</h2>
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: '0 0 12px', fontSize: 13, color: '#444', lineHeight: 1.75 }}>{children}</p>
}

function Lead({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: '0 0 20px', fontSize: 14, color: '#666', lineHeight: 1.7 }}>{children}</p>
}

function Callout({ color, children }: { color: string; children: React.ReactNode }) {
  const colors: Record<string, { bg: string; border: string; text: string }> = {
    blue:   { bg: '#eff6ff', border: '#93c5fd', text: '#1d4ed8' },
    amber:  { bg: '#fffbeb', border: '#fcd34d', text: '#92400e' },
    green:  { bg: '#f0fdf4', border: '#86efac', text: '#15803d' },
    purple: { bg: '#f5f3ff', border: '#c4b5fd', text: '#6d28d9' },
  }
  const c = colors[color] ?? colors.blue
  return (
    <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderLeft: `4px solid ${c.border}`, borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
      <p style={{ margin: 0, fontSize: 13, color: c.text, lineHeight: 1.65 }}>{children}</p>
    </div>
  )
}

function Steps({ items }: { items: { title: string; body: React.ReactNode }[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 20 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', background: '#1677FF',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0,
            }}>
              {i + 1}
            </div>
            {i < items.length - 1 && (
              <div style={{ width: 2, flex: 1, background: '#e8e8e8', margin: '4px 0' }} />
            )}
          </div>
          <div style={{ paddingBottom: i < items.length - 1 ? 20 : 0, paddingTop: 4 }}>
            <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: '#111' }}>{item.title}</p>
            <div style={{ fontSize: 13, color: '#555', lineHeight: 1.65 }}>{item.body}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function Badge({ label, color }: { label: string; color: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    blue:   { bg: '#E6F4FF',              text: '#1677FF' },
    amber:  { bg: 'rgba(245,158,11,0.12)', text: '#b45309' },
    purple: { bg: 'rgba(124,58,237,0.10)', text: '#7c3aed' },
    orange: { bg: 'rgba(217,119,6,0.10)',  text: '#d97706' },
    green:  { bg: 'rgba(5,150,105,0.10)',  text: '#059669' },
    gray:   { bg: 'rgba(107,114,128,0.10)', text: '#4b5563' },
  }
  const c = map[color] ?? map.blue
  return (
    <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: c.bg, color: c.text, marginRight: 6, marginBottom: 4 }}>
      {label}
    </span>
  )
}

function Divider() {
  return <div style={{ height: 1, background: '#f0f0f0', margin: '20px 0' }} />
}

function CollapsibleSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginBottom: 2 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          width: '100%', textAlign: 'left', background: open ? '#f9fafb' : 'transparent',
          border: 'none', borderRadius: 6, cursor: 'pointer',
          padding: '7px 10px', margin: '0',
          transition: 'background 0.1s',
        }}
      >
        <span style={{
          fontSize: 10, color: '#aaa', flexShrink: 0, display: 'inline-block',
          transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s',
          lineHeight: 1,
        }}>▶</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: open ? '#111' : '#333', letterSpacing: '-0.01em' }}>
          {title}
        </span>
      </button>
      {open && (
        <div style={{ paddingLeft: 24, paddingTop: 8, paddingBottom: 4 }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ── Section content ───────────────────────────────────────────────────────────

const SECTIONS: Section[] = [

  // 1. INBOUND LEADS
  {
    id:    'inbound',
    title: 'Inbound Leads',
    emoji: '📥',
    content: (
      <div>
        <H2>Inbound Leads</H2>
        <Lead>
          This is your first point of contact — people who've shown interest by filling out the TRS website form or emailing directly. Every new lead lands here before a conversation begins.
        </Lead>

        <Callout color="blue">
          The badge on "Email" in the sidebar counts leads still marked <strong>New</strong> — no one has replied yet. It clears once you send.
        </Callout>

        <CollapsibleSection title="What you'll see">
          <P>
            A table of every inbound lead — channel, name, company, topic, message preview, status, and time since contact. Leads with a <strong>blue dot</strong> are still New and are your priority.
          </P>
        </CollapsibleSection>

        <CollapsibleSection title="Lead statuses">
          <div style={{ marginBottom: 16 }}>
            <Badge label="New" color="blue" /> Just came in — not yet contacted.
            <br /><br />
            <Badge label="Contacted" color="amber" /> Initial reply sent. Moves here automatically after you send via the AI Reply panel.
            <br /><br />
            <Badge label="Engaged" color="blue" /> Active conversation ongoing.
            <br /><br />
            <Badge label="Qualified" color="purple" /> Requirements confirmed, quote in preparation.
            <br /><br />
            <Badge label="Proposal" color="orange" /> Formal proposal sent.
            <br /><br />
            <Badge label="Converted" color="green" /> Policy placed — now a client.
            <br /><br />
            <Badge label="Dropped" color="gray" /> Not proceeding.
          </div>
          <P>Change a lead's status at any time via the dropdown in the detail panel.</P>
        </CollapsibleSection>

        <CollapsibleSection title="Channels">
          <P>
            <strong>Website</strong> — via the TRS contact form at trade-risksol.com.<br />
            <strong>Email</strong> — sent directly to the TRS inbox.<br />
            <strong>WhatsApp</strong> — clicked the WhatsApp button on the website.<br />
            <strong>Manual</strong> — added by a team member directly.
          </P>
        </CollapsibleSection>

        <Divider />

        <CollapsibleSection title="Step-by-step: Replying to a new lead">
          <Steps items={[
            {
              title: 'Click a lead row',
              body: <p style={{ margin: 0 }}>The detail panel opens on the right — contact info, topic, and original message.</p>,
            },
            {
              title: 'Click "Generate Reply"',
              body: <p style={{ margin: 0 }}>The AI reads the lead's name, topic, and message, then drafts a warm first-contact reply. Takes 2–5 seconds.</p>,
            },
            {
              title: 'Review and edit',
              body: <p style={{ margin: 0 }}>The draft appears in a blue text box. Edit freely — change the tone, add details, or shorten it.</p>,
            },
            {
              title: 'Click "Send Reply"',
              body: <p style={{ margin: 0 }}>Sent from <strong>operations@trade-risksol.com</strong>. Status changes to Contacted, the unread badge decreases, and the lead is added to the Engagement Agent automatically.</p>,
            },
          ]} />
          <Callout color="green">
            After sending, the lead becomes a contact in the Engagement Agent automatically. No manual step needed.
          </Callout>
        </CollapsibleSection>

        <CollapsibleSection title="Filtering and searching">
          <P>
            Filter tabs at the top let you switch between All, New, Email/Form, and WhatsApp leads. The search bar finds anyone by name, email, phone, company, or topic keyword.
          </P>
        </CollapsibleSection>

        <CollapsibleSection title="Stat cards">
          <P>
            Four cards at the top: total leads, new, email/form, and WhatsApp. The <strong>New</strong> card highlights in blue when unread leads are waiting.
          </P>
        </CollapsibleSection>
      </div>
    ),
  },

  // 2. LEAD DISCOVERY
  {
    id:    'discovery',
    title: 'Lead Discovery',
    emoji: '🔍',
    content: (
      <div>
        <H2>Lead Discovery</H2>
        <Lead>
          Your outbound prospecting tool. Uses Apollo.io to find companies in a target industry, identify the right decision-makers, and retrieve verified work email addresses — in four steps.
        </Lead>

        <Callout color="blue">
          Every email retrieved here is automatically saved to the Lead Database. From there, add those leads to a Campaign to send an AI-drafted email sequence.
        </Callout>

        <CollapsibleSection title="The four steps">
          <Steps items={[
            {
              title: 'Search — define your target',
              body: <p style={{ margin: 0 }}>Enter a target industry (e.g. "Logistics", "Marine"), pick locations, optionally set headcount range, and choose a TRS product type. Optionally paste a news article URL for a topical outreach hook. Click <strong>Run Search</strong>.</p>,
            },
            {
              title: 'Companies — pick the ones you want',
              body: <p style={{ margin: 0 }}>Apollo returns a ranked list of matching companies. Tick the ones you want to pursue, then click <strong>Fetch People</strong>.</p>,
            },
            {
              title: 'People — select decision-makers',
              body: <p style={{ margin: 0 }}>A list of decision-makers appears — name, title, company, location, LinkedIn. Tick individuals and click <strong>Get Emails</strong>. Each lookup uses Apollo credits, so be selective.</p>,
            },
            {
              title: 'Emails — review results and save',
              body: <p style={{ margin: 0 }}>Results show found (green) or not found (grey). Everyone with a found email is automatically saved to the Lead Database.</p>,
            },
          ]} />
          <Callout color="amber">
            Apollo Basic allows 30,000 credits per month. Each lookup uses credits even if no email is found. Only select people you genuinely intend to contact.
          </Callout>
        </CollapsibleSection>

        <CollapsibleSection title="Search history">
          <P>
            Every search is saved in the <strong>Search History</strong> panel on the right. Click any past search to review its companies and people. History searches are read-only.
          </P>
        </CollapsibleSection>

        <CollapsibleSection title="Scheduled runs">
          <P>
            Set a search to run <strong>Weekly</strong> to automatically discover new companies and people each week and add them to the Lead Database.
          </P>
        </CollapsibleSection>

        <CollapsibleSection title="News hook">
          <P>
            Paste a news article URL in the search form and the AI uses it as the opening angle in Campaign emails — making outreach feel timely rather than generic. Leave it blank and the AI finds a relevant article automatically when you generate a Campaign sequence.
          </P>
        </CollapsibleSection>
      </div>
    ),
  },

  // 3. LEAD DATABASE
  {
    id:    'database',
    title: 'Lead Database',
    emoji: '📋',
    content: (
      <div>
        <H2>Lead Database</H2>
        <Lead>
          Every outbound lead discovered through Lead Discovery lands here. This is your working list of companies and decision-makers identified as prospective clients.
        </Lead>

        <CollapsibleSection title="What you'll see">
          <P>
            Each row shows name, job title, employer, email address, verification status, location, and outreach status. Click a row to expand and see more detail or add notes.
          </P>
          <P>
            Filter by All, New, Contacted, Replied, Qualified, or Disqualified. The search bar finds anyone by name, email, title, or company.
          </P>
        </CollapsibleSection>

        <CollapsibleSection title="Lead statuses">
          <div style={{ marginBottom: 16 }}>
            <Badge label="New" color="gray" /> Added — not yet contacted.
            <br /><br />
            <Badge label="Contacted" color="blue" /> Added to a campaign; emails are sending.
            <br /><br />
            <Badge label="Replied" color="amber" /> Replied to an outbound email. Your cue to engage them via the Engagement Agent.
            <br /><br />
            <Badge label="Qualified" color="green" /> Shown genuine interest — moved into the active pipeline.
            <br /><br />
            <Badge label="Disqualified" color="gray" /> Not a fit or opted out.
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Notes">
          <P>
            Each lead has a notes field. Expand any row and type context — current insurer, a conversation you had, a specific risk they mentioned. Notes save automatically.
          </P>
          <Callout color="green">
            Leads that opt out are flagged automatically and excluded from all future campaigns. No manual removal needed.
          </Callout>
        </CollapsibleSection>
      </div>
    ),
  },

  // 4. CAMPAIGNS
  {
    id:    'campaigns',
    title: 'Campaigns',
    emoji: '📣',
    content: (
      <div>
        <H2>Campaigns</H2>
        <Lead>
          Campaigns turn a list of outbound leads into a structured, multi-step email outreach. The AI writes a personalised email sequence; you review and approve it; the system sends each email automatically via Instantly, spaced out over days.
        </Lead>

        <Callout color="blue">
          Think of a Campaign as a timed sequence of emails to a targeted group. The first email uses a news hook; follow-ups add a gentle nudge or a new angle. You stay in control by approving every email before anything sends.
        </Callout>

        <CollapsibleSection title="Campaign statuses">
          <div style={{ marginBottom: 16 }}>
            <Badge label="Draft" color="amber" /> Just created — AI is writing the sequence.
            <br /><br />
            <Badge label="Review" color="blue" /> Ready for you to read and approve.
            <br /><br />
            <Badge label="Active" color="green" /> Emails sending on schedule.
            <br /><br />
            <Badge label="Paused" color="purple" /> Sending temporarily stopped. Resume any time.
            <br /><br />
            <Badge label="Completed" color="gray" /> All emails in the sequence sent.
            <br /><br />
            <Badge label="Archived" color="gray" /> Stored for reference — no longer active.
          </div>
        </CollapsibleSection>

        <Divider />

        <CollapsibleSection title="Step-by-step: Creating a campaign">
          <Steps items={[
            {
              title: 'Click "New Campaign"',
              body: <p style={{ margin: 0 }}>Name the campaign (e.g. "SG Logistics Q3 — Liability"), choose a TRS product type, and optionally paste a news article URL. Leave the URL blank and the AI finds a relevant hook automatically.</p>,
            },
            {
              title: 'Select leads',
              body: <p style={{ margin: 0 }}>In the <strong>Leads</strong> tab, add the outbound leads you want to target. These should already be in the Lead Database from a Discovery run.</p>,
            },
            {
              title: 'Generate the email sequence',
              body: <p style={{ margin: 0 }}>Go to the <strong>Sequence</strong> tab and click <strong>Generate with AI</strong>. The AI writes up to five emails — each with a subject line, body, and delay in days. The first uses the news hook as an opening angle.</p>,
            },
            {
              title: 'Review and approve each step',
              body: <p style={{ margin: 0 }}>Read every draft. Edit subject line or body. When happy, click <strong>Approve</strong>. The campaign won't launch until all steps are approved.</p>,
            },
            {
              title: 'Launch',
              body: <p style={{ margin: 0 }}>Click <strong>Launch via Instantly</strong>. Campaign moves to Active; emails begin sending according to the delay schedule.</p>,
            },
            {
              title: 'Monitor replies',
              body: <p style={{ margin: 0 }}>Dashboard shows Leads, Sent, Replies, and Reply Rate in real time. When a lead replies, their status updates to Replied — open the Engagement Agent to continue that conversation personally.</p>,
            },
          ]} />
          <Callout color="amber">
            Always read the full sequence before approving. The AI doesn't know your current premium rates, specific insurer relationships, or regulatory details. Add those yourself before launching.
          </Callout>
        </CollapsibleSection>

        <CollapsibleSection title="The news hook">
          <P>
            The first email references a recent relevant news article — a port disruption report, a regulatory change — giving the recipient a concrete reason to open it. Paste a URL to control which article is used; leave it blank to let the AI choose.
          </P>
        </CollapsibleSection>
      </div>
    ),
  },

  // 5. ENGAGEMENT AGENT
  {
    id:    'engagement',
    title: 'Engagement Agent',
    emoji: '🤖',
    content: (
      <div>
        <H2>Engagement Agent</H2>
        <Lead>
          Where ongoing conversations live. Once a lead has been contacted — from Inbound or via a Campaign reply — their full email thread appears here with AI-generated analysis and draft replies.
        </Lead>

        <Callout color="amber">
          An amber dot next to a conversation means the client has replied and is <strong>waiting for your response</strong>. These should be prioritised.
        </Callout>

        <CollapsibleSection title="What you'll see">
          <P>
            The screen is split into three parts:
          </P>
          <P>
            <strong>Left — Conversation list.</strong> All active contacts sorted by most recent activity. Each row shows subject, contact name/company, last message preview, and an amber dot if they're waiting for a reply.
          </P>
          <P>
            <strong>Middle — Email thread.</strong> Full back-and-forth email history. Your outbound emails appear on the right (indented); client emails on the left. Click any email header to expand or collapse it.
          </P>
          <P>
            <strong>Right — Contact panel.</strong> Name, email, phone, company, lead status, days open, and time since last client reply. Change status here.
          </P>
        </CollapsibleSection>

        <CollapsibleSection title="AI Analysis">
          <P>
            Above the email thread, a blue <strong>AI Analysis</strong> strip is automatically generated after every new inbound email — no action needed.
          </P>
          <P>
            <strong>Summary</strong> — who the contact is, what they need, what's been discussed, outstanding questions or deadlines. Saves you from re-reading the entire thread.
          </P>
          <P>
            <strong>Next Action</strong> — the AI's recommended next step shown in a blue box. Treat this as a suggestion, not a directive.
          </P>
          <P>
            If multiple analyses exist for the same thread, click "earlier summaries" to see history.
          </P>
        </CollapsibleSection>

        <Divider />

        <CollapsibleSection title="Step-by-step: Replying using the AI Draft">
          <Steps items={[
            {
              title: 'Select a conversation',
              body: <p style={{ margin: 0 }}>Click any contact to load their email thread. An amber "⚡ Needs reply" badge appears if they're waiting.</p>,
            },
            {
              title: 'Read the AI Analysis',
              body: <p style={{ margin: 0 }}>Check the blue strip at the top — it briefs you on the conversation and recommends the next action.</p>,
            },
            {
              title: 'Click "Generate AI reply"',
              body: <p style={{ margin: 0 }}>At the bottom of the thread, click "Generate AI reply". The AI reads the full thread and drafts a contextual reply — referencing coverage types, deadlines, amounts from the emails.</p>,
            },
            {
              title: 'Review and edit',
              body: <p style={{ margin: 0 }}>The draft appears in a rich text editor. Edit freely — formatting (bold, lists, links) is preserved in the email. Add context the AI couldn't know, like pricing confirmed with an insurer.</p>,
            },
            {
              title: 'Select your signature and send',
              body: <p style={{ margin: 0 }}>Choose who is sending from the <strong>Sign as</strong> dropdown — the signature appears in the editor. Click <strong>Approve &amp; Send</strong> to send from operations@trade-risksol.com. The amber indicator clears.</p>,
            },
            {
              title: 'Update lead status if needed',
              body: <p style={{ margin: 0 }}>In the right panel, update the status dropdown — e.g. move from Engaged to Qualified once you've confirmed requirements, or to Proposal after sending a quote.</p>,
            },
          ]} />
        </CollapsibleSection>

        <CollapsibleSection title="Draft evaluation — how the AI improves">
          <P>
            Every email you send is automatically compared to the original AI draft in the background. This never delays sending.
          </P>
          <P>
            After you send, the system:
          </P>
          <Steps items={[
            {
              title: 'Compares AI draft vs what you actually sent',
              body: <p style={{ margin: 0 }}>If the two are nearly identical (&gt;95% match), the draft scores a 5/5 automatically — no API call needed. If you made edits, Gemini evaluates the difference.</p>,
            },
            {
              title: 'Gemini scores the draft (1–5)',
              body: (
                <div>
                  <p style={{ margin: '0 0 6px' }}>5 = sent almost as-is. 4 = small but meaningful improvements. 3 = significant rewrites. 2 = major rewrite. 1 = started from scratch.</p>
                  <p style={{ margin: 0 }}>It also captures: what you changed, why your version was better, and a specific rule for future emails of that type.</p>
                </div>
              ),
            },
            {
              title: 'High-scoring replies become examples',
              body: <p style={{ margin: 0 }}>Scores 4–5 are saved as few-shot examples. The next time the AI drafts a reply of the same email type (e.g. PRICING, COVERAGE, RENEWAL), it references these examples to match your style and quality.</p>,
            },
          ]} />
          <Callout color="purple">
            View all evaluations, key learnings, and stored examples at <strong>Analytics → Draft Evals</strong>. The learnings tab shows specific rules the AI has extracted from your edits — grouped by email type.
          </Callout>
        </CollapsibleSection>

        <CollapsibleSection title="Lead statuses in Engagement">
          <div style={{ marginBottom: 16 }}>
            <Badge label="Contacted" color="amber" /> Initial reply sent, awaiting response.
            <br /><br />
            <Badge label="Engaged" color="blue" /> Active back-and-forth.
            <br /><br />
            <Badge label="Qualified" color="purple" /> Requirements confirmed, preparing terms.
            <br /><br />
            <Badge label="Proposal" color="orange" /> Formal quote or proposal sent.
            <br /><br />
            <Badge label="Converted" color="green" /> Policy placed — deal closed.
            <br /><br />
            <Badge label="Dropped" color="gray" /> Gone silent or decided not to proceed.
          </div>
          <Callout color="blue">
            The sidebar shows a live count of leads in each stage as coloured pills under "Active Contacts".
          </Callout>
        </CollapsibleSection>

        <CollapsibleSection title="Draft auto-save">
          <P>
            Edits to the AI draft are auto-saved after 2 seconds of inactivity. Close the thread, come back — your draft is still there. A small "Autosaved" indicator confirms this.
          </P>
        </CollapsibleSection>

        <CollapsibleSection title="Sorting and filtering conversations">
          <P>
            Use the sort control (slider icon, top left of the conversation list) to switch between:
          </P>
          <P>
            <strong>Last activity</strong> — most recently emailed first. Best for daily use.<br />
            <strong>Newest lead</strong> — most recently acquired contacts first.<br />
            <strong>Oldest lead</strong> — useful for spotting contacts overdue for follow-up.
          </P>
          <P>
            Filter by date range to see only conversations started within a specific period.
          </P>
        </CollapsibleSection>

        <CollapsibleSection title="CC participants">
          <P>
            If a contact CC'd others (e.g. their finance team), those addresses appear in the right panel under "CC Participants" — useful for knowing who else is involved in the decision.
          </P>
        </CollapsibleSection>
      </div>
    ),
  },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DocumentationPage() {
  const [activeId, setActiveId] = useState(SECTIONS[0].id)
  const active = SECTIONS.find(s => s.id === activeId) ?? SECTIONS[0]

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--content-bg)' }}>

      {/* Sidebar nav */}
      <div style={{ width: 220, flexShrink: 0, background: '#fff', borderRight: '1px solid #e8e8e8', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid #f0f0f0' }}>
          <p style={{ margin: '0 0 2px', fontSize: 11, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Documentation</p>
          <p style={{ margin: 0, fontSize: 11, color: '#ccc', lineHeight: 1.4 }}>Workflow order: top → bottom</p>
        </div>
        <nav style={{ padding: '8px' }}>
          {SECTIONS.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setActiveId(s.id)}
              style={{
                width: '100%', textAlign: 'left', padding: '8px 10px',
                borderRadius: 6, border: 'none', cursor: 'pointer',
                background: activeId === s.id ? '#E6F4FF' : 'transparent',
                color:      activeId === s.id ? '#1677FF' : '#555',
                fontSize: 13, fontWeight: activeId === s.id ? 600 : 400,
                display: 'flex', alignItems: 'center', gap: 8,
                borderLeft: `3px solid ${activeId === s.id ? '#1677FF' : 'transparent'}`,
                marginBottom: 2,
                transition: 'all 0.1s',
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color: activeId === s.id ? '#1677FF' : '#bbb', minWidth: 14, textAlign: 'right', flexShrink: 0 }}>
                {i + 1}
              </span>
              <span style={{ fontSize: 15, flexShrink: 0 }}>{s.emoji}</span>
              {s.title}
            </button>
          ))}
        </nav>
        <div style={{ flex: 1 }} />
        <div style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0' }}>
          <p style={{ margin: 0, fontSize: 11, color: '#ccc', lineHeight: 1.5 }}>
            TRS Internal Dashboard<br />Documentation v1.2
          </p>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: 740, margin: '0 auto', padding: '40px 48px 80px' }}>
          {active.content}
        </div>
      </div>
    </div>
  )
}
