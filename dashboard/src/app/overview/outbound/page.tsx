'use client'

import Link from 'next/link'
import {
  H2, H3, Lead, Callout, Steps, Badge, Divider, CollapsibleSection,
} from '@/components/DocComponents'

export default function OutboundPage() {
  return (
    <div className="max-w-[740px] mx-auto px-10 py-10 pb-20">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6 text-[12px] text-muted-foreground">
        <Link href="/overview" className="no-underline hover:text-foreground transition-colors">Overview</Link>
        <span>/</span>
        <span className="text-foreground">Outbound Leads</span>
      </div>

      <H2>Outbound Leads</H2>
      <Lead>
        The outbound workflow has three connected areas: Lead Discovery finds prospective clients, the Lead Database stores them, and Campaigns turn them into targeted email outreach.
      </Lead>

      {/* ── Lead Discovery ── */}
      <H3>Lead Discovery</H3>
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
            body: <p className="m-0">Enter a target industry (e.g. &ldquo;Logistics&rdquo;, &ldquo;Marine&rdquo;), pick locations, optionally set headcount range, and choose a TRS product type. Optionally paste a news article URL for a topical outreach hook. Click <strong>Run Search</strong>.</p>,
          },
          {
            title: 'Companies — pick the ones you want',
            body: <p className="m-0">Apollo returns a ranked list of matching companies. Tick the ones you want to pursue, then click <strong>Fetch People</strong>.</p>,
          },
          {
            title: 'People — select decision-makers',
            body: <p className="m-0">A list of decision-makers appears — name, title, company, location, LinkedIn. Tick individuals and click <strong>Get Emails</strong>. Each lookup uses Apollo credits, so be selective.</p>,
          },
          {
            title: 'Emails — review results and save',
            body: <p className="m-0">Results show found (green) or not found (grey). Everyone with a found email is automatically saved to the Lead Database.</p>,
          },
        ]} />
        <Callout color="amber">
          Apollo Basic allows 30,000 credits per month. Each lookup uses credits even if no email is found. Only select people you genuinely intend to contact.
        </Callout>
      </CollapsibleSection>

      <CollapsibleSection title="Search history">
        <p className="text-[13px] text-foreground/70 leading-[1.75] mb-3">
          Every search is saved in the <strong>Search History</strong> panel on the right. Click any past search to review its companies and people. History searches are read-only.
        </p>
      </CollapsibleSection>

      <CollapsibleSection title="Scheduled runs">
        <p className="text-[13px] text-foreground/70 leading-[1.75] mb-3">
          Set a search to run <strong>Weekly</strong> to automatically discover new companies and people each week and add them to the Lead Database.
        </p>
      </CollapsibleSection>

      <CollapsibleSection title="News hook">
        <p className="text-[13px] text-foreground/70 leading-[1.75] mb-3">
          Paste a news article URL in the search form and the AI uses it as the opening angle in Campaign emails — making outreach feel timely rather than generic. Leave it blank and the AI finds a relevant article automatically when you generate a Campaign sequence.
        </p>
      </CollapsibleSection>

      <Divider />

      {/* ── Lead Database ── */}
      <H3>Lead Database</H3>
      <Lead>
        Every outbound lead discovered through Lead Discovery lands here. This is your working list of companies and decision-makers identified as prospective clients.
      </Lead>

      <CollapsibleSection title="What you'll see">
        <p className="text-[13px] text-foreground/70 leading-[1.75] mb-3">
          Each row shows name, job title, employer, email address, verification status, location, and outreach status. Click a row to expand and see more detail or add notes.
        </p>
        <p className="text-[13px] text-foreground/70 leading-[1.75] mb-3">
          Filter by All, New, Contacted, Replied, Qualified, or Disqualified. The search bar finds anyone by name, email, title, or company.
        </p>
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
        <p className="text-[13px] text-foreground/70 leading-[1.75] mb-3">
          Each lead has a notes field. Expand any row and type context — current insurer, a conversation you had, a specific risk they mentioned. Notes save automatically.
        </p>
        <Callout color="green">
          Leads that opt out are flagged automatically and excluded from all future campaigns. No manual removal needed.
        </Callout>
      </CollapsibleSection>

      <Divider />

      {/* ── Campaigns ── */}
      <H3>Campaigns</H3>
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

      <CollapsibleSection title="Step-by-step: Creating a campaign">
        <Steps items={[
          {
            title: 'Click "New Campaign"',
            body: <p className="m-0">Name the campaign, choose a TRS product type, and optionally paste a news article URL. Leave the URL blank and the AI finds a relevant hook automatically.</p>,
          },
          {
            title: 'Select leads',
            body: <p className="m-0">In the <strong>Leads</strong> tab, add the outbound leads you want to target. These should already be in the Lead Database from a Discovery run.</p>,
          },
          {
            title: 'Generate the email sequence',
            body: <p className="m-0">Go to the <strong>Sequence</strong> tab and click <strong>Generate with AI</strong>. The AI writes up to five emails — each with a subject line, body, and delay in days. The first uses the news hook as an opening angle.</p>,
          },
          {
            title: 'Review and approve each step',
            body: <p className="m-0">Read every draft. Edit subject line or body. When happy, click <strong>Approve</strong>. The campaign won&apos;t launch until all steps are approved.</p>,
          },
          {
            title: 'Launch',
            body: <p className="m-0">Click <strong>Launch via Instantly</strong>. Campaign moves to Active; emails begin sending according to the delay schedule.</p>,
          },
          {
            title: 'Monitor replies',
            body: <p className="m-0">Dashboard shows Leads, Sent, Replies, and Reply Rate in real time. When a lead replies, their status updates to Replied — open the Engagement Agent to continue that conversation.</p>,
          },
        ]} />
        <Callout color="amber">
          Always read the full sequence before approving. The AI doesn&apos;t know your current premium rates, specific insurer relationships, or regulatory details. Add those yourself before launching.
        </Callout>
      </CollapsibleSection>

      <CollapsibleSection title="The news hook">
        <p className="text-[13px] text-foreground/70 leading-[1.75] mb-3">
          The first email references a recent relevant news article — a port disruption report, a regulatory change — giving the recipient a concrete reason to open it. Paste a URL to control which article is used; leave it blank to let the AI choose.
        </p>
      </CollapsibleSection>

      <div className="mt-8 pt-6 border-t border-[--border-subtle]">
        <Link href="/overview" className="text-[12px] text-muted-foreground no-underline hover:text-foreground transition-colors">
          ← Back to Overview
        </Link>
      </div>
    </div>
  )
}
