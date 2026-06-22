'use client'

import Link from 'next/link'
import {
  H2, Lead, Callout, Steps, Badge, Divider, CollapsibleSection,
} from '@/components/DocComponents'

export default function EngagementPage() {
  return (
    <div className="max-w-[740px] mx-auto px-10 py-10 pb-20">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6 text-[12px] text-muted-foreground">
        <Link href="/overview" className="no-underline hover:text-foreground transition-colors">Overview</Link>
        <span>/</span>
        <span className="text-foreground">Engagement</span>
      </div>

      <H2>Engagement</H2>
      <Lead>
        Where ongoing conversations live. Once a lead has been contacted — from Inbound or via a Campaign reply — their full email thread appears here with AI-generated analysis and draft replies.
      </Lead>

      <Callout color="amber">
        An amber dot next to a conversation means the client has replied and is <strong>waiting for your response</strong>. These should be prioritised.
      </Callout>

      <CollapsibleSection title="What you'll see">
        <p className="text-[13px] text-foreground/70 leading-[1.75] mb-3">
          The screen is split into three parts:
        </p>
        <p className="text-[13px] text-foreground/70 leading-[1.75] mb-3">
          <strong>Left — Conversation list.</strong> All active contacts sorted by most recent activity. Each row shows subject, contact name/company, last message preview, and an amber dot if they&apos;re waiting for a reply.
        </p>
        <p className="text-[13px] text-foreground/70 leading-[1.75] mb-3">
          <strong>Middle — Email thread.</strong> Full back-and-forth email history. Your outbound emails appear on the right (indented); client emails on the left. Click any email header to expand or collapse it.
        </p>
        <p className="text-[13px] text-foreground/70 leading-[1.75] mb-3">
          <strong>Right — Contact panel.</strong> Name, email, phone, company, lead status, days open, and time since last client reply. Change status here.
        </p>
      </CollapsibleSection>

      <CollapsibleSection title="AI Analysis">
        <p className="text-[13px] text-foreground/70 leading-[1.75] mb-3">
          Above the email thread, a blue <strong>AI Analysis</strong> strip is automatically generated after every new inbound email — no action needed.
        </p>
        <p className="text-[13px] text-foreground/70 leading-[1.75] mb-3">
          <strong>Summary</strong> — who the contact is, what they need, what&apos;s been discussed, outstanding questions or deadlines. Saves you from re-reading the entire thread.
        </p>
        <p className="text-[13px] text-foreground/70 leading-[1.75] mb-3">
          <strong>Next Action</strong> — the AI&apos;s recommended next step shown in a blue box. Treat this as a suggestion, not a directive.
        </p>
        <p className="text-[13px] text-foreground/70 leading-[1.75] mb-3">
          If multiple analyses exist for the same thread, click &ldquo;earlier summaries&rdquo; to see history.
        </p>
      </CollapsibleSection>

      <Divider />

      <CollapsibleSection title="Step-by-step: Replying using the AI Draft">
        <Steps items={[
          {
            title: 'Select a conversation',
            body: <p className="m-0">Click any contact to load their email thread. An amber &ldquo;⚡ Needs reply&rdquo; badge appears if they&apos;re waiting.</p>,
          },
          {
            title: 'Read the AI Analysis',
            body: <p className="m-0">Check the blue strip at the top — it briefs you on the conversation and recommends the next action.</p>,
          },
          {
            title: 'Click "Generate AI reply"',
            body: <p className="m-0">At the bottom of the thread, click &ldquo;Generate AI reply&rdquo;. The AI reads the full thread and drafts a contextual reply — referencing coverage types, deadlines, amounts from the emails.</p>,
          },
          {
            title: 'Review and edit',
            body: <p className="m-0">The draft appears in a rich text editor. Edit freely — formatting (bold, lists, links) is preserved in the email. Add context the AI couldn&apos;t know, like pricing confirmed with an insurer.</p>,
          },
          {
            title: 'Select your signature and send',
            body: <p className="m-0">Choose who is sending from the <strong>Sign as</strong> dropdown — the signature appears in the editor. Click <strong>Approve &amp; Send</strong> to send from operations@trade-risksol.com. The amber indicator clears.</p>,
          },
          {
            title: 'Update lead status if needed',
            body: <p className="m-0">In the right panel, update the status dropdown — e.g. move from Engaged to Qualified once you&apos;ve confirmed requirements, or to Proposal after sending a quote.</p>,
          },
        ]} />
      </CollapsibleSection>

      <CollapsibleSection title="Draft evaluation — how the AI improves">
        <p className="text-[13px] text-foreground/70 leading-[1.75] mb-3">
          Every email you send is automatically compared to the original AI draft in the background. This never delays sending.
        </p>
        <Steps items={[
          {
            title: 'Compares AI draft vs what you actually sent',
            body: <p className="m-0">If the two are nearly identical (&gt;95% match), the draft scores a 5/5 automatically — no API call needed. If you made edits, Gemini evaluates the difference.</p>,
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
            body: <p className="m-0">Scores 4–5 are saved as few-shot examples. The next time the AI drafts a reply of the same email type (e.g. PRICING, COVERAGE, RENEWAL), it references these examples to match your style and quality.</p>,
          },
        ]} />
        <Callout color="purple">
          View all evaluations, key learnings, and stored examples at <strong>Analytics → Email Evaluations</strong>. The learnings tab shows specific rules the AI has extracted from your edits — grouped by email type.
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
          The sidebar shows a live count of leads in each stage as coloured pills under &ldquo;Active Contacts&rdquo;.
        </Callout>
      </CollapsibleSection>

      <CollapsibleSection title="Draft auto-save">
        <p className="text-[13px] text-foreground/70 leading-[1.75] mb-3">
          Edits to the AI draft are auto-saved after 2 seconds of inactivity. Close the thread, come back — your draft is still there. A small &ldquo;Autosaved&rdquo; indicator confirms this.
        </p>
      </CollapsibleSection>

      <CollapsibleSection title="Sorting and filtering conversations">
        <p className="text-[13px] text-foreground/70 leading-[1.75] mb-3">
          Use the sort control (slider icon, top left of the conversation list) to switch between:
        </p>
        <p className="text-[13px] text-foreground/70 leading-[1.75] mb-3">
          <strong>Last activity</strong> — most recently emailed first. Best for daily use.<br />
          <strong>Newest lead</strong> — most recently acquired contacts first.<br />
          <strong>Oldest lead</strong> — useful for spotting contacts overdue for follow-up.
        </p>
        <p className="text-[13px] text-foreground/70 leading-[1.75] mb-3">
          Filter by date range to see only conversations started within a specific period.
        </p>
      </CollapsibleSection>

      <CollapsibleSection title="CC participants">
        <p className="text-[13px] text-foreground/70 leading-[1.75] mb-3">
          If a contact CC&apos;d others (e.g. their finance team), those addresses appear in the right panel under &ldquo;CC Participants&rdquo; — useful for knowing who else is involved in the decision.
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
