'use client'

import { useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

type Section = {
  id:       string
  title:    string
  emoji:    string
  content:  React.ReactNode
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function H2({ children }: { children: React.ReactNode }) {
  return <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: '#111', letterSpacing: '-0.02em' }}>{children}</h2>
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 style={{ margin: '24px 0 8px', fontSize: 14, fontWeight: 700, color: '#111', letterSpacing: '-0.01em' }}>{children}</h3>
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
    blue:   { bg: '#E6F4FF', text: '#1677FF' },
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
  return <div style={{ height: 1, background: '#f0f0f0', margin: '28px 0' }} />
}

// ── Section content ───────────────────────────────────────────────────────────

const SECTIONS: Section[] = [
  {
    id:    'inbound',
    title: 'Inbound Leads',
    emoji: '📥',
    content: (
      <div>
        <H2>Inbound Leads</H2>
        <Lead>
          This section captures people who have shown interest in TRS — either by filling out the contact form on the website or by sending an email directly. Think of it as your first point of contact before a conversation begins.
        </Lead>

        <Callout color="blue">
          The number badge on "Email" in the sidebar counts how many leads are still marked <strong>New</strong> — meaning no one has replied yet. It disappears once you send a reply.
        </Callout>

        <H3>What you'll see</H3>
        <P>
          The main view is a table listing every inbound lead. Each row shows the channel they came from, their name, company, the insurance topic they mentioned, a preview of their message, their current status, and how long ago they got in touch.
        </P>
        <P>
          Leads with a <strong>blue dot</strong> next to their channel badge are still <strong>New</strong> — they haven't been replied to yet. These are your priority.
        </P>

        <H3>Lead statuses</H3>
        <P>Every lead carries a status that tells you where they are in the process:</P>
        <div style={{ marginBottom: 16 }}>
          <Badge label="New" color="blue" /> Someone just came in — not yet contacted.
          <br /><br />
          <Badge label="Contacted" color="amber" /> You've sent an initial reply. The lead moves here automatically after you send via the AI Reply panel.
          <br /><br />
          <Badge label="Engaged" color="blue" /> Conversation is ongoing.
          <br /><br />
          <Badge label="Qualified" color="purple" /> Needs have been confirmed, a quote is being prepared.
          <br /><br />
          <Badge label="Proposal" color="orange" /> A formal proposal has been sent.
          <br /><br />
          <Badge label="Converted" color="green" /> Policy placed — lead is now a client.
          <br /><br />
          <Badge label="Dropped" color="gray" /> Not proceeding.
        </div>
        <P>You can change a lead's status at any time using the dropdown in the detail panel on the right.</P>

        <H3>Channels</H3>
        <P>
          <strong>Website</strong> — came in via the TRS contact form at trade-risksol.com.<br />
          <strong>Email</strong> — sent an email directly to the TRS inbox.<br />
          <strong>WhatsApp</strong> — clicked the WhatsApp button on the website.<br />
          <strong>Manual</strong> — added by a team member directly.
        </P>

        <Divider />

        <H3>Step-by-step: Replying to a new lead</H3>
        <Steps items={[
          {
            title: 'Click a lead row',
            body: <p style={{ margin: 0 }}>The detail panel opens on the right. You'll see their contact info, what topic they mentioned, and their original message.</p>,
          },
          {
            title: 'Read their message',
            body: <p style={{ margin: 0 }}>The "Original Message" section shows exactly what they wrote. Use this to understand what they're looking for before drafting a reply.</p>,
          },
          {
            title: 'Click "Generate Reply"',
            body: <p style={{ margin: 0 }}>The AI reads the lead's name, topic, and message, then drafts a warm first-contact reply from TRS. This takes 2–5 seconds.</p>,
          },
          {
            title: 'Review and edit the draft',
            body: <p style={{ margin: 0 }}>The draft appears in a blue text box. You can edit any part of it — change the tone, add specific details, or shorten it. The AI gives you a starting point, not a final product.</p>,
          },
          {
            title: 'Click "Send Reply"',
            body: <p style={{ margin: 0 }}>The email is sent from <strong>operations@trade-risksol.com</strong> to the lead. The lead's status automatically changes to <strong>Contacted</strong>, the unread badge in the sidebar decreases, and the lead is added to the Engagement Agent for ongoing tracking.</p>,
          },
        ]} />

        <Callout color="green">
          After you send a reply, the lead is automatically created as a contact in the Engagement Agent. You don't need to do anything manually — just open the Engagement Agent to continue the conversation.
        </Callout>

        <H3>Filtering and searching</H3>
        <P>
          Use the filter tabs at the top to switch between All Leads, New only, Email/Form leads, or WhatsApp leads. The search bar lets you find anyone by name, email, phone number, company, or topic keyword.
        </P>

        <H3>The stat cards</H3>
        <P>
          At the top of the page, four cards give you a quick summary: total leads, how many are new, how many came via email/form, and how many via WhatsApp. The <strong>New</strong> card is highlighted in blue when there are unread leads.
        </P>
      </div>
    ),
  },
  {
    id:    'engagement',
    title: 'Engagement Agent',
    emoji: '🤖',
    content: (
      <div>
        <H2>Engagement Agent</H2>
        <Lead>
          The Engagement Agent is where ongoing conversations live. Once a lead has been contacted — either from the Inbound section or directly via email — their full email thread appears here, along with AI-generated analysis and draft replies.
        </Lead>

        <Callout color="amber">
          An amber dot next to a conversation means the client has replied and is <strong>waiting for your response</strong>. These should be prioritised.
        </Callout>

        <H3>What you'll see</H3>
        <P>
          The screen is split into three parts:
        </P>
        <P>
          <strong>Left — Conversation list.</strong> All active contacts sorted by most recent activity. Each row shows the email subject or topic, the contact's name and company, a preview of the last message, and an amber dot if they're waiting for a reply.
        </P>
        <P>
          <strong>Middle — Email thread.</strong> The full back-and-forth email history with this contact. Your outbound emails appear on the right (indented), client emails on the left. Click any email header to expand or collapse it.
        </P>
        <P>
          <strong>Right — Contact panel.</strong> Name, email, phone, company, lead status, days the conversation has been open, and how long since the client last replied. You can change the lead status here.
        </P>

        <H3>AI Analysis</H3>
        <P>
          Above the email thread, there is a blue <strong>AI Analysis</strong> strip. This is automatically generated by the AI after every new inbound email — you don't need to click anything.
        </P>
        <P>
          It contains two things:
        </P>
        <P>
          <strong>Summary</strong> — a concise description of who the contact is, what they need, what's been discussed, and any outstanding questions or deadlines. This saves you from reading the entire thread every time.
        </P>
        <P>
          <strong>Next Action</strong> — the AI's recommended next step, shown in a blue box. For example: "Send preliminary premium indication by Wednesday — client has a board meeting." Treat this as a suggestion, not a directive.
        </P>
        <P>
          If there have been multiple AI analyses for the same thread (one per email), you can click "earlier summaries" to see the history.
        </P>

        <Divider />

        <H3>Step-by-step: Replying using the AI Draft</H3>
        <Steps items={[
          {
            title: 'Select a conversation from the left panel',
            body: <p style={{ margin: 0 }}>Click any contact to load their email thread in the middle. If the client is waiting for a reply, you'll see an amber "⚡ Needs reply" badge next to the subject.</p>,
          },
          {
            title: 'Read the AI Analysis',
            body: <p style={{ margin: 0 }}>Check the blue AI Analysis strip at the top. It summarises the conversation and tells you what the recommended next action is. This is your briefing before drafting.</p>,
          },
          {
            title: 'Scroll down and click "Generate AI reply"',
            body: <p style={{ margin: 0 }}>At the bottom of the thread, in the blue panel, click "Generate AI reply". The AI reads the entire conversation and drafts a contextual reply. It references specific details — coverage types, deadlines, amounts — from the emails.</p>,
          },
          {
            title: 'Review and edit the draft',
            body: <p style={{ margin: 0 }}>The draft appears in an editable text box. Read it carefully. You can change any part of it. The AI may not know everything — add context it couldn't have, like pricing you've confirmed with an insurer.</p>,
          },
          {
            title: 'Approve & Send, or Reject',
            body: <p style={{ margin: 0 }}><strong>Approve & Send Reply</strong> — sends the email from operations@trade-risksol.com, logs the action, and updates the thread. The amber "waiting" indicator clears.<br /><br /><strong>Reject</strong> — discards the draft. You can then click "Regenerate" to try again, or write your reply manually in your email client.</p>,
          },
          {
            title: 'Update the lead status if needed',
            body: <p style={{ margin: 0 }}>In the right panel, use the status dropdown to update where this lead is in the pipeline. For example, move from Engaged to Qualified once you've confirmed their requirements, or to Proposal after sending a quote.</p>,
          },
        ]} />

        <H3>Lead statuses in Engagement</H3>
        <P>The same statuses from Inbound apply here, but the focus is on tracking the deal:</P>
        <div style={{ marginBottom: 16 }}>
          <Badge label="Contacted" color="amber" /> Initial reply sent, awaiting their response.
          <br /><br />
          <Badge label="Engaged" color="blue" /> Active back-and-forth — conversation is live.
          <br /><br />
          <Badge label="Qualified" color="purple" /> Requirements confirmed, preparing terms.
          <br /><br />
          <Badge label="Proposal" color="orange" /> Formal quote or proposal sent.
          <br /><br />
          <Badge label="Converted" color="green" /> Policy placed — deal closed.
          <br /><br />
          <Badge label="Dropped" color="gray" /> Contact has gone silent or decided not to proceed.
        </div>

        <Callout color="blue">
          The sidebar shows a live count of leads in each stage (Engaged, Qualified, Proposal, Converted) as coloured pills under "Active Contacts". This gives the whole team a quick view of where the pipeline stands.
        </Callout>

        <H3>Draft auto-save</H3>
        <P>
          When you edit the AI draft, your changes are automatically saved after 2 seconds of inactivity. If you close the thread and come back, the draft will still be there — you won't lose your edits. A small "Autosaved" indicator appears when this happens.
        </P>

        <H3>Sorting and filtering conversations</H3>
        <P>
          Use the sort control (the slider icon, top left of the conversation list) to switch between:
        </P>
        <P>
          <strong>Last activity</strong> — most recently emailed conversations appear first. Best for day-to-day use.<br />
          <strong>Newest lead</strong> — most recently acquired contacts first.<br />
          <strong>Oldest lead</strong> — useful for spotting contacts who haven't been followed up in a while.
        </P>
        <P>
          You can also filter by a date range to see only conversations that started within a specific period.
        </P>

        <H3>CC participants</H3>
        <P>
          If a contact CC'd other people (e.g. their finance team) in their emails, those addresses appear in the right panel under "CC Participants". This helps you know who else is involved in the decision.
        </P>
      </div>
    ),
  },
  {
    id:    'discovery',
    title: 'Lead Discovery',
    emoji: '🔍',
    content: (
      <div>
        <H2>Lead Discovery</H2>
        <Lead>
          Lead Discovery is your outbound prospecting tool. It uses Apollo.io to search for companies in a target industry, find the decision-makers you want to reach, and retrieve their verified work email addresses — all in four steps.
        </Lead>

        <Callout color="blue">
          Every email you retrieve here is automatically saved to the Lead Database. From there you can add those leads to a Campaign to send them an AI-drafted email sequence.
        </Callout>

        <H3>The four steps</H3>
        <Steps items={[
          {
            title: 'Search — define your target',
            body: <p style={{ margin: 0 }}>Enter your target industry (e.g. "Logistics", "Marine"), pick one or more locations, optionally set a company headcount range, and choose the TRS product type (Business Assets, Liabilities, Workforce, or API). You can also paste a news article URL to give the AI a topical hook for outreach emails. Click <strong>Run Search</strong>.</p>,
          },
          {
            title: 'Companies — pick the ones you want',
            body: <p style={{ margin: 0 }}>Apollo returns a ranked list of companies matching your criteria. Tick the ones you want to pursue, then click <strong>Fetch People</strong>. Apollo will find the relevant decision-makers at each selected company.</p>,
          },
          {
            title: 'People — select decision-makers',
            body: <p style={{ margin: 0 }}>A list of decision-makers appears — name, title, company, location, and LinkedIn profile. Tick the individuals you want to contact and click <strong>Get Emails</strong>. Apollo looks up each person's verified work email. Each lookup uses Apollo credits, so be selective.</p>,
          },
          {
            title: 'Emails — review results and save',
            body: <p style={{ margin: 0 }}>Results show which emails were found (green) or not found (grey). Every person with a found email is automatically saved to the Lead Database. Click <strong>View Lead Database</strong> to see them there and start building a campaign.</p>,
          },
        ]} />

        <Callout color="amber">
          Apollo Basic allows 30,000 credits per month. Each email lookup consumes credits even if no email is found. Only select people you genuinely intend to contact.
        </Callout>

        <H3>Search history</H3>
        <P>
          Every search is saved and visible in the <strong>Search History</strong> panel on the right side of the Search screen. Click any past search to review its companies and people. History searches are read-only — you cannot request new emails from a history view.
        </P>

        <H3>Scheduled runs</H3>
        <P>
          When setting up a search you can set a <strong>Scheduled Run</strong> to "Weekly". This repeats the same search automatically each week and adds any newly discovered companies and people to the Lead Database.
        </P>

        <H3>News hook</H3>
        <P>
          If you paste a news article URL in the search form, the AI uses that article as the opening angle in Campaign emails — "I came across this article on [topic]…" This makes outreach feel timely and relevant rather than generic. If you leave it blank, the AI finds a relevant article automatically when you later generate a Campaign sequence.
        </P>
      </div>
    ),
  },
  {
    id:    'database',
    title: 'Lead Database',
    emoji: '📋',
    content: (
      <div>
        <H2>Lead Database</H2>
        <Lead>
          The Lead Database holds every outbound lead discovered through Lead Discovery. It's your working list of companies and decision-makers that TRS has identified as prospective clients.
        </Lead>

        <H3>What you'll see</H3>
        <P>
          Each row shows a lead's name (or company name), job title, current employer, email address, email verification status, location, and their current outreach status. Click a row to expand it and see more detail or add notes.
        </P>
        <P>
          Use the filter tabs to switch between All, New, Contacted, Replied, Qualified, and Disqualified. The search bar lets you find anyone by name, email, title, or company.
        </P>

        <H3>Lead statuses</H3>
        <P>Outbound leads have their own status track, separate from inbound leads:</P>
        <div style={{ marginBottom: 16 }}>
          <Badge label="New" color="gray" /> Added to the database — not yet contacted.
          <br /><br />
          <Badge label="Contacted" color="blue" /> Added to a campaign; emails are being sent.
          <br /><br />
          <Badge label="Replied" color="amber" /> The lead has replied to an outbound email. Your cue to engage them directly via the Engagement Agent.
          <br /><br />
          <Badge label="Qualified" color="green" /> Shown genuine interest — moved into the active pipeline.
          <br /><br />
          <Badge label="Disqualified" color="gray" /> Not a fit, or the lead has opted out.
        </div>

        <H3>Notes</H3>
        <P>
          Each lead has a notes field. Expand any row and type relevant context — the insurer they currently use, a conversation you had, or a specific risk they mentioned. Notes save automatically.
        </P>

        <Callout color="green">
          Leads that opt out are flagged automatically and excluded from all future campaigns. You do not need to remove them manually.
        </Callout>
      </div>
    ),
  },
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
          Think of a Campaign as a carefully timed sequence of emails sent to a targeted group of leads. The first email introduces TRS using a news hook; follow-ups add a gentle nudge or a new angle. You stay in control by approving every email before anything sends.
        </Callout>

        <H3>Campaign statuses</H3>
        <div style={{ marginBottom: 16 }}>
          <Badge label="Draft" color="amber" /> Just created — the AI is writing the email sequence.
          <br /><br />
          <Badge label="Review" color="blue" /> Sequence is ready for you to read and approve.
          <br /><br />
          <Badge label="Active" color="green" /> Emails are sending on schedule.
          <br /><br />
          <Badge label="Paused" color="purple" /> Sending is temporarily stopped. You can resume at any time.
          <br /><br />
          <Badge label="Completed" color="gray" /> All emails in the sequence have been sent.
          <br /><br />
          <Badge label="Archived" color="gray" /> Stored for reference — no longer active.
        </div>

        <Divider />

        <H3>Step-by-step: Creating a campaign</H3>
        <Steps items={[
          {
            title: 'Click "New Campaign"',
            body: <p style={{ margin: 0 }}>Give the campaign a descriptive name (e.g. "SG Logistics Q3 — Liability"), choose the TRS product type, and optionally paste a news article URL. If you leave the URL blank, the AI will find a relevant insurance news hook automatically.</p>,
          },
          {
            title: 'Select leads from the Lead Database',
            body: <p style={{ margin: 0 }}>On the campaign detail screen, go to the <strong>Leads</strong> tab. Add the outbound leads you want this campaign to target. These should already be in the Lead Database from a Lead Discovery run.</p>,
          },
          {
            title: 'Generate the email sequence',
            body: <p style={{ margin: 0 }}>Go to the <strong>Sequence</strong> tab and click <strong>Generate with AI</strong>. The AI writes up to five emails — each with a subject line, body, and a delay in days from the previous one. The first email uses the news hook as the opening angle.</p>,
          },
          {
            title: 'Review and approve each step',
            body: <p style={{ margin: 0 }}>Read every draft carefully. You can edit the subject line or body of any email. When you are happy with a step, click <strong>Approve</strong>. The campaign will not launch until all steps are approved.</p>,
          },
          {
            title: 'Launch the campaign',
            body: <p style={{ margin: 0 }}>Once all steps are approved, click <strong>Launch via Instantly</strong>. The campaign moves to Active and emails begin sending to your lead list according to the delay schedule.</p>,
          },
          {
            title: 'Monitor replies',
            body: <p style={{ margin: 0 }}>The campaign dashboard shows Leads, Sent, Replies, and Reply Rate in real time. When a lead replies, their status in the Lead Database updates to Replied — your cue to open the Engagement Agent and continue the conversation personally.</p>,
          },
        ]} />

        <H3>The news hook</H3>
        <P>
          The first email in every sequence references a recent, relevant news article — for example, a port disruption report or a regulatory change affecting a specific sector. This gives the recipient a concrete reason to open the email beyond a generic introduction.
        </P>
        <P>
          If you paste a URL when creating the campaign, the AI uses that article. If you leave it blank, the AI searches for the most relevant recent news for your target industry and product type.
        </P>

        <Callout color="amber">
          Always read the full sequence before approving. The AI does not know your current premium rates, specific insurer relationships, or regulatory details unique to TRS. Add those details yourself before launching.
        </Callout>
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
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Documentation</p>
        </div>
        <nav style={{ padding: '8px' }}>
          {SECTIONS.map(s => (
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
              <span style={{ fontSize: 15 }}>{s.emoji}</span>
              {s.title}
            </button>
          ))}
        </nav>
        <div style={{ flex: 1 }} />
        <div style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0' }}>
          <p style={{ margin: 0, fontSize: 11, color: '#ccc', lineHeight: 1.5 }}>
            TRS Internal Dashboard<br />Documentation v1.1
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
