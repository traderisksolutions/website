export type NodeKind = 'trigger' | 'ai' | 'human' | 'data' | 'output'

export type WFNodeDetail = {
  stage: string
  description: string
  ai?: string
  human?: string
  outcome?: string
  appLink?: { href: string; label: string }
  docsLink?: { href: string; label: string }
  note?: string
}

export type WFNode = {
  id: string
  kind: NodeKind
  label: string
  sublabel?: string
  position: { x: number; y: number }
  detail: WFNodeDetail
}

export type WFEdge = {
  id: string
  source: string
  target: string
  label?: string
}

// Node width = 168px. Y spacing = 120px between rows.
// Inbound track:  x = 30
// Outbound track: x = 430
// Merged track:   x = 230

export const WORKFLOW_NODES: WFNode[] = [
  // ── Inbound track ─────────────────────────────────────────────────
  {
    id: 'inbound-trigger',
    kind: 'trigger',
    label: 'Inbound Enquiry',
    sublabel: 'Email / WhatsApp / Website',
    position: { x: 30, y: 30 },
    detail: {
      stage: 'Capture',
      description:
        'A lead submits a website form, sends a direct email, or messages via WhatsApp. All three channels feed into the same inbox automatically — no manual forwarding required.',
      human: 'Nothing required at this step. All channels are monitored continuously.',
      outcome: 'A new lead record is created with the original message and channel attached.',
      appLink:  { href: '/inbound/email',   label: 'Open Inbound Inbox'  },
      docsLink: { href: '/overview/inbound', label: 'Inbound Leads guide' },
    },
  },
  {
    id: 'inbound-inbox',
    kind: 'human',
    label: 'Inbound Inbox',
    sublabel: 'Where new leads arrive',
    position: { x: 30, y: 150 },
    detail: {
      stage: 'Capture',
      description:
        'All new inbound leads appear here. Status is "New" until a reply is sent. Leads can be filtered by channel, date, and status.',
      human:
        'Review new leads as they arrive. The AI first-reply draft is generated automatically — you do not need to trigger it.',
      outcome: 'Lead status moves from "New" → "Contacted" after the first reply is sent.',
      appLink:  { href: '/inbound/email',   label: 'Open Inbox'           },
      docsLink: { href: '/overview/inbound', label: 'Inbound Leads guide'  },
    },
  },
  {
    id: 'ai-first-draft',
    kind: 'ai',
    label: 'AI First Reply Draft',
    sublabel: 'Agent 01 — Inbound Auto-Draft',
    position: { x: 30, y: 270 },
    detail: {
      stage: 'Draft',
      description:
        "Agent 01 reads the lead's name, email, topic, and original message, then searches the knowledge base for relevant FAQs. It generates a personalised 3–5 sentence opening reply.",
      ai:
        'Pulls relevant context from Google Drive PDFs. References high-scoring past replies as examples and low-scoring ones as anti-patterns. Temperature 0.4 — controlled output, not creative.',
      human: 'The draft appears in the lead detail panel. You read it, edit if needed, and send.',
      outcome: 'Draft saved with status "pending". Becomes "sent" once the human sends it.',
      appLink:  { href: '/inbound/email',  label: 'Review Drafts'    },
      docsLink: { href: '/overview/agents/inbound-auto-draft', label: 'Inbound Auto-Draft docs'  },
      note: 'The AI never quotes pricing, premiums, or policy numbers. If it does, edit before sending.',
    },
  },
  {
    id: 'human-review-inbound',
    kind: 'human',
    label: 'Human Reviews & Sends',
    sublabel: 'First reply to the lead',
    position: { x: 30, y: 390 },
    detail: {
      stage: 'Send',
      description:
        'You review the AI draft, make any edits, and hit Send. The reply goes out via the connected Gmail account.',
      human:
        'Open the lead, review the draft in the right panel, edit as needed, then click Send. The email is delivered immediately.',
      ai:
        'After you send, the Evaluation Agent runs automatically in the background to compare the draft to what you actually sent.',
      outcome:
        'Reply sent. Lead thread created in Engagement. Evaluation score recorded in Analytics.',
      appLink:  { href: '/inbound/email',   label: 'Open Inbox'            },
      docsLink: { href: '/overview/inbound', label: 'Inbound Leads guide'   },
    },
  },

  // ── Outbound track ────────────────────────────────────────────────
  {
    id: 'apollo',
    kind: 'human',
    label: 'Apollo Lead Discovery',
    sublabel: 'Prospecting tool',
    position: { x: 430, y: 30 },
    detail: {
      stage: 'Prospect',
      description:
        'Apollo.io searches thousands of companies and decision-makers. You filter by sector, headcount, location, and job title, then select leads to add to the database.',
      human:
        'Run an Apollo search, review the results, and click "Add to Database" for each lead you want to pursue. Apollo retrieves verified email addresses automatically.',
      outcome: 'Selected leads are saved to the Lead Database for campaign use.',
      appLink:  { href: '/outbound/agent',   label: 'Open Lead Discovery'  },
      docsLink: { href: '/overview/outbound', label: 'Outbound Leads guide' },
    },
  },
  {
    id: 'lead-db',
    kind: 'data',
    label: 'Lead Database',
    sublabel: 'Curated outbound leads',
    position: { x: 430, y: 150 },
    detail: {
      stage: 'Prospect',
      description:
        'Curated list of outbound leads sourced from Apollo. Each lead has a verified email, company, title, and industry. Leads are assigned to campaigns from here.',
      human:
        'Review leads, exclude any that are not relevant, then build a campaign with the remaining set.',
      outcome: 'Lead set ready to be assigned to a campaign sequence.',
      appLink:  { href: '/outbound/leads',   label: 'View Lead Database'   },
      docsLink: { href: '/overview/outbound', label: 'Outbound Leads guide' },
    },
  },
  {
    id: 'campaign-ai',
    kind: 'ai',
    label: 'Campaign AI Draft',
    sublabel: 'Agent 03 — Sequence Drafter',
    position: { x: 430, y: 270 },
    detail: {
      stage: 'Draft',
      description:
        'Agent 03 generates a personalised 3–5 step email sequence for the campaign. The first email references a relevant industry news hook (auto-fetched or manually provided).',
      ai:
        'Generates subject lines, email bodies, and send delays for each step. Personalises each step per lead profile — title, company, industry, and headcount all influence the output.',
      human:
        'Click "Generate with AI" in the Campaign Sequence tab. Review each step and edit before approving.',
      outcome: 'A complete draft campaign sequence ready for human review and approval.',
      appLink:  { href: '/outbound/campaigns', label: 'View Campaigns'   },
      docsLink: { href: '/overview/agents/campaign-drafter', label: 'Campaign Drafter docs' },
    },
  },
  {
    id: 'human-approve',
    kind: 'human',
    label: 'Human Approves & Launches',
    sublabel: 'Campaign activation',
    position: { x: 430, y: 390 },
    detail: {
      stage: 'Send',
      description:
        'You review the AI-drafted campaign sequence step by step. Once approved, the campaign is activated and Instantly handles delivery, scheduling, and reply tracking.',
      human:
        'Review each email step in the Campaign Sequence tab. Edit subject lines and body copy as needed. Click Launch when ready.',
      outcome:
        'Campaign is live. Instantly delivers emails on the defined schedule. Replies are routed back through Engagement.',
      appLink:  { href: '/outbound/campaigns', label: 'View Campaigns'    },
      docsLink: { href: '/overview/outbound',   label: 'Outbound Leads guide' },
      note: 'No email is ever sent without your approval. The AI drafts; you approve and launch.',
    },
  },

  // ── Shared downstream ─────────────────────────────────────────────
  {
    id: 'engagement-ai',
    kind: 'ai',
    label: 'Engagement AI Draft',
    sublabel: 'Agent 02 — Engagement Drafter',
    position: { x: 230, y: 510 },
    detail: {
      stage: 'Engage',
      description:
        'For every reply in an active conversation, Agent 02 reads the full thread (up to 15 messages), searches the TRS knowledge base, and generates a contextual follow-up draft.',
      ai:
        'Classifies the email type: Pricing, Coverage, Renewal, Document, Claims, or General. Applies type-specific writing rules. References high-scoring past replies. Temperature 0.3.',
      human:
        'Click "Generate AI Reply" in the Engagement Agent for any thread. Review the draft in the compose panel.',
      outcome: 'Draft ready in compose panel. Auto-saves after 2 seconds of inactivity. You send when satisfied.',
      appLink:  { href: '/engagement',          label: 'Open Engagement Agent' },
      docsLink: { href: '/overview/engagement', label: 'Engagement guide'       },
    },
  },
  {
    id: 'human-replies',
    kind: 'human',
    label: 'Human Reviews & Replies',
    sublabel: 'Ongoing conversation',
    position: { x: 230, y: 630 },
    detail: {
      stage: 'Engage',
      description:
        'You review the AI draft in the compose panel, make any edits, and send. This cycle repeats for every round of a conversation.',
      human:
        'Read the AI draft. Edit for tone, specific facts, or accuracy. Click Send. The Evaluation Agent scores the draft automatically after sending.',
      ai:
        'After you send, Evaluation Agent compares the AI draft to your sent email and records a 1–5 score plus specific learnings.',
      outcome:
        'Reply sent. Evaluation score recorded. If ≥4, that draft version is saved as a future example. If ≤3, a specific rule is extracted as an anti-pattern.',
      appLink:  { href: '/engagement',          label: 'Open Engagement Agent' },
      docsLink: { href: '/overview/engagement', label: 'Engagement guide'       },
    },
  },
  {
    id: 'pipeline',
    kind: 'data',
    label: 'Active Contacts Pipeline',
    sublabel: 'Stage-based contact tracking',
    position: { x: 230, y: 750 },
    detail: {
      stage: 'Track',
      description:
        'Every contact — inbound or outbound — is tracked here by stage: New, Contacted, Engaged, Qualified, Proposal, Converted, or Dropped. Provides the full pipeline view.',
      human:
        'Review the pipeline, update contact stages manually as deals progress, and use it to prioritise who to follow up with.',
      outcome: 'Single view of all active relationships and their current stage in the sales cycle.',
      appLink:  { href: '/contacts', label: 'View Pipeline' },
      docsLink: { href: '/overview',  label: 'Overview'      },
    },
  },
  {
    id: 'eval-agent',
    kind: 'ai',
    label: 'Evaluation Agent',
    sublabel: 'Agent 04 — Auto-triggered after send',
    position: { x: 60, y: 880 },
    detail: {
      stage: 'Learn',
      description:
        'Automatically triggered after every reply is sent. Compares the AI draft to the human-sent email. Assigns a score 1–5 and extracts specific learnings to improve future drafts.',
      ai:
        'Temperature 0 — fully deterministic. Strips signatures before comparison. Score 5 = near-identical. Score 1–2 = substantially rewritten. Extracts a type-specific rule per email classification.',
      human: 'Nothing required — runs automatically. View scores in Analytics → Email Evaluations.',
      outcome:
        'Score ≥4: draft saved as a few-shot example for future prompts. Score ≤3: key learning extracted as an anti-pattern rule applied to subsequent drafts of that email type.',
      appLink:  { href: '/analytics/eval', label: 'View Evaluations'  },
      docsLink: { href: '/overview/agents/evaluation-agent', label: 'Evaluation Agent docs'  },
      note: 'Scores improve over time as the agent accumulates examples and anti-patterns. There is no manual training step.',
    },
  },
  {
    id: 'analytics',
    kind: 'output',
    label: 'Analytics Dashboard',
    sublabel: 'AI usage, evals, pipeline data',
    position: { x: 400, y: 880 },
    detail: {
      stage: 'Track',
      description:
        'Aggregated view of AI usage, email evaluation scores, campaign performance, and pipeline conversion. Data updates automatically.',
      human:
        'Review metrics to understand which email types score well, which agents are used most, and how leads are converting.',
      outcome: 'Full visibility into platform performance and AI quality trends over time.',
      appLink:  { href: '/analytics',          label: 'Open Analytics'   },
      docsLink: { href: '/overview/analytics', label: 'Analytics guide'  },
    },
  },
]

export const WORKFLOW_EDGES: WFEdge[] = [
  { id: 'e1',  source: 'inbound-trigger',     target: 'inbound-inbox'        },
  { id: 'e2',  source: 'inbound-inbox',        target: 'ai-first-draft'       },
  { id: 'e3',  source: 'ai-first-draft',       target: 'human-review-inbound' },
  { id: 'e4',  source: 'human-review-inbound', target: 'engagement-ai'        },
  { id: 'e5',  source: 'apollo',               target: 'lead-db'              },
  { id: 'e6',  source: 'lead-db',              target: 'campaign-ai'          },
  { id: 'e7',  source: 'campaign-ai',          target: 'human-approve'        },
  { id: 'e8',  source: 'human-approve',        target: 'engagement-ai', label: 'Replies arrive in Engagement' },
  { id: 'e9',  source: 'engagement-ai',        target: 'human-replies'        },
  { id: 'e10', source: 'human-replies',        target: 'pipeline'             },
  { id: 'e11', source: 'human-replies',        target: 'eval-agent'           },
  { id: 'e12', source: 'pipeline',             target: 'analytics'            },
  { id: 'e13', source: 'eval-agent',           target: 'analytics'            },
]
