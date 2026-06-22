'use client'

import Link from 'next/link'
import {
  H2, Lead, Callout, Steps, Badge, Divider, CollapsibleSection,
} from '@/components/DocComponents'

export default function InboundPage() {
  return (
    <div className="max-w-[740px] mx-auto px-10 py-10 pb-20">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6 text-[12px] text-muted-foreground">
        <Link href="/overview" className="no-underline hover:text-foreground transition-colors">Overview</Link>
        <span>/</span>
        <span className="text-foreground">Inbound Leads</span>
      </div>

      <H2>Inbound Leads</H2>
      <Lead>
        This is your first point of contact — people who&apos;ve shown interest by filling out the TRS website form or emailing directly. Every new lead lands here before a conversation begins.
      </Lead>

      <Callout color="blue">
        The badge on &ldquo;Email&rdquo; in the sidebar counts leads still marked <strong>New</strong> — no one has replied yet. It clears once you send.
      </Callout>

      <CollapsibleSection title="What you'll see">
        <p className="text-[13px] text-foreground/70 leading-[1.75] mb-3">
          A table of every inbound lead — channel, name, company, topic, message preview, status, and time since contact. Leads with a <strong>blue dot</strong> are still New and are your priority.
        </p>
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
        <p className="text-[13px] text-foreground/70 leading-[1.75] mb-3">
          Change a lead&apos;s status at any time via the dropdown in the detail panel.
        </p>
      </CollapsibleSection>

      <CollapsibleSection title="Channels">
        <p className="text-[13px] text-foreground/70 leading-[1.75] mb-3">
          <strong>Website</strong> — via the TRS contact form at trade-risksol.com.<br />
          <strong>Email</strong> — sent directly to the TRS inbox.<br />
          <strong>WhatsApp</strong> — clicked the WhatsApp button on the website.<br />
          <strong>Manual</strong> — added by a team member directly.
        </p>
      </CollapsibleSection>

      <Divider />

      <CollapsibleSection title="Step-by-step: Replying to a new lead">
        <Steps items={[
          {
            title: 'Click a lead row',
            body: <p className="m-0">The detail panel opens on the right — contact info, topic, and original message.</p>,
          },
          {
            title: 'Click "Generate Reply"',
            body: <p className="m-0">The AI reads the lead&apos;s name, topic, and message, then drafts a warm first-contact reply. Takes 2–5 seconds.</p>,
          },
          {
            title: 'Review and edit',
            body: <p className="m-0">The draft appears in a blue text box. Edit freely — change the tone, add details, or shorten it.</p>,
          },
          {
            title: 'Click "Send Reply"',
            body: <p className="m-0">Sent from <strong>operations@trade-risksol.com</strong>. Status changes to Contacted, the unread badge decreases, and the lead is added to the Engagement Agent automatically.</p>,
          },
        ]} />
        <Callout color="green">
          After sending, the lead becomes a contact in the Engagement Agent automatically. No manual step needed.
        </Callout>
      </CollapsibleSection>

      <CollapsibleSection title="Filtering and searching">
        <p className="text-[13px] text-foreground/70 leading-[1.75] mb-3">
          Filter tabs at the top let you switch between All, New, Email/Form, and WhatsApp leads. The search bar finds anyone by name, email, phone, company, or topic keyword.
        </p>
      </CollapsibleSection>

      <CollapsibleSection title="Stat cards">
        <p className="text-[13px] text-foreground/70 leading-[1.75] mb-3">
          Four cards at the top: total leads, new, email/form, and WhatsApp. The <strong>New</strong> card highlights in blue when unread leads are waiting.
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
