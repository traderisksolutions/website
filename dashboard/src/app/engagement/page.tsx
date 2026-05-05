'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { Search, RefreshCw, ChevronDown, Copy, Check, X, Calendar, ArrowUpDown } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

type Lead = {
  id: string; created_at: string; source: string
  first_name: string | null; last_name: string | null
  email: string | null; phone: string | null; company: string | null
  department: string | null; contact_type: string | null
  topic: string | null; details: string | null; message: string | null
  page_url: string | null; status: string
}

type RealMsg = {
  id: string
  direction: 'inbound' | 'outbound'
  from_address: string | null
  subject: string | null
  body_text: string | null
  sent_at: string | null
  to: string[]
  cc: string[]
}

type ThreadState = {
  loading: boolean
  thread:  { id: string; subject: string | null; status: string; last_message_at: string | null; message_count: number } | null
  messages: RealMsg[]
  error:    string | null
}

type SortKey = 'last_activity' | 'newest' | 'oldest'

// ── Constants ─────────────────────────────────────────────────────────────────

const ENGAGED_STATUSES = new Set(['contacted', 'engaged', 'qualified', 'proposal', 'converted'])
const EMAIL_SOURCES    = new Set(['website_form', 'email', 'manual'])

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  contacted: { label: 'Contacted', color: '#b45309', bg: 'rgba(245,158,11,0.10)'  },
  engaged:   { label: 'Engaged',   color: '#2563eb', bg: 'rgba(37,99,235,0.10)'   },
  qualified: { label: 'Qualified', color: '#7c3aed', bg: 'rgba(124,58,237,0.10)'  },
  proposal:  { label: 'Proposal',  color: '#d97706', bg: 'rgba(217,119,6,0.10)'   },
  converted: { label: 'Converted', color: '#059669', bg: 'rgba(5,150,105,0.10)'   },
  dropped:   { label: 'Dropped',   color: '#4b5563', bg: 'rgba(107,114,128,0.10)' },
}
const ALL_STATUSES = ['contacted', 'engaged', 'qualified', 'proposal', 'converted', 'dropped']

const TRS_EMAIL = 'hello@trade-risksol.com'

// ── Demo data ─────────────────────────────────────────────────────────────────

const DEMO_LEADS: Lead[] = [
  {
    id: 'demo-1', created_at: '2026-04-28T01:15:00.000Z', source: 'email',
    first_name: 'Marcus', last_name: 'Tan', email: 'marcus.tan@pacificcargo.com.sg',
    phone: '+65 9123 4567', company: 'Pacific Cargo Pte Ltd',
    department: 'Finance', contact_type: 'Corporate', topic: 'Marine Cargo Insurance',
    details: null, message: 'Enquiry about marine cargo insurance for SEA shipping routes.',
    page_url: null, status: 'engaged',
  },
  {
    id: 'demo-2', created_at: '2026-04-22T03:20:00.000Z', source: 'website_form',
    first_name: 'Sarah', last_name: 'Lim', email: 'sarah.lim@synapseai.sg',
    phone: null, company: 'Synapse AI Pte Ltd',
    department: 'Risk', contact_type: 'Corporate', topic: 'Product Liability / Tech E&O',
    details: null, message: 'Need product liability insurance ahead of SaaS platform launch.',
    page_url: null, status: 'qualified',
  },
  {
    id: 'demo-3', created_at: '2026-05-02T06:00:00.000Z', source: 'email',
    first_name: 'David', last_name: 'Park', email: 'david.park@meridianfab.com',
    phone: '+65 9876 5432', company: 'Meridian Fabricators Pte Ltd',
    department: 'Operations', contact_type: 'Corporate', topic: "Workmen's Compensation & Equipment",
    details: null, message: 'Reviewing WC and equipment breakdown insurance for fabrication facility.',
    page_url: null, status: 'contacted',
  },
]

const DEMO_THREADS: Record<string, { thread: ThreadState['thread']; messages: RealMsg[] }> = {
  'demo-1': {
    thread: { id: 'th-demo-1', subject: 'Marine Cargo Insurance Enquiry', status: 'open', last_message_at: '2026-05-03T00:45:00.000Z', message_count: 4 },
    messages: [
      {
        id: 'dm1-1', direction: 'inbound', from_address: 'marcus.tan@pacificcargo.com.sg',
        subject: 'Marine Cargo Insurance Enquiry', sent_at: '2026-04-28T01:15:00.000Z',
        to: [TRS_EMAIL], cc: [],
        body_text: `Hi Trade Risk Solutions,

I'm reaching out regarding marine cargo insurance for our shipping operations. Pacific Cargo handles approximately SGD 2M in goods monthly across Southeast Asia routes — primarily Singapore–Jakarta, Singapore–Manila, and Singapore–Ho Chi Minh City.

We're currently uninsured and looking to get coverage in place before Q3. Could you advise on what policies would be suitable and what documentation you'd need from our side?

Best regards,
Marcus Tan
CFO, Pacific Cargo Pte Ltd`,
      },
      {
        id: 'dm1-2', direction: 'outbound', from_address: TRS_EMAIL,
        subject: 'Re: Marine Cargo Insurance Enquiry', sent_at: '2026-04-28T06:32:00.000Z',
        to: ['marcus.tan@pacificcargo.com.sg'], cc: [],
        body_text: `Hi Marcus,

Thank you for reaching out to Trade Risk Solutions. Marine cargo across the SEA routes you've mentioned is very much our core expertise.

To put together an accurate quote, could you share:
1. The nature of goods being shipped (general cargo, perishables, electronics?)
2. Average shipment value per consignment
3. Whether you require All Risks or Institute Cargo Clauses B/C coverage
4. Any claims history in the past 3 years

We typically turn around quotes within 3–5 business days once we have the above information.

Best regards,
Trade Risk Solutions`,
      },
      {
        id: 'dm1-3', direction: 'inbound', from_address: 'marcus.tan@pacificcargo.com.sg',
        subject: 'Re: Marine Cargo Insurance Enquiry', sent_at: '2026-04-30T02:08:00.000Z',
        to: [TRS_EMAIL], cc: ['ops@pacificcargo.com.sg'],
        body_text: `Hi,

Thanks for the quick response. Here are the details:

1. Mixed cargo — primarily industrial equipment (60%) and electronics components (40%)
2. Average shipment value: SGD 80,000–120,000 per consignment, with occasional high-value loads up to SGD 350,000
3. We'd prefer All Risks coverage
4. No claims in the past 3 years — clean record

Also, do you provide coverage for delays or only physical loss/damage? And what's the typical premium range for our volume?

Thanks,
Marcus`,
      },
      {
        id: 'dm1-4', direction: 'inbound', from_address: 'marcus.tan@pacificcargo.com.sg',
        subject: 'Re: Marine Cargo Insurance Enquiry', sent_at: '2026-05-03T00:45:00.000Z',
        to: [TRS_EMAIL], cc: [],
        body_text: `Hi,

Just following up on my previous email. We have a board meeting next week where I'd like to present insurance options — it would be very helpful to have at least a ballpark figure by Thursday.

Please let me know if you need anything else from our side.

Marcus`,
      },
    ],
  },
  'demo-2': {
    thread: { id: 'th-demo-2', subject: 'Product Liability Insurance for SaaS Platform', status: 'open', last_message_at: '2026-04-25T02:30:00.000Z', message_count: 3 },
    messages: [
      {
        id: 'dm2-1', direction: 'inbound', from_address: 'sarah.lim@synapseai.sg',
        subject: 'Product Liability Insurance for SaaS Platform', sent_at: '2026-04-22T03:20:00.000Z',
        to: [TRS_EMAIL], cc: [],
        body_text: `Hi there,

I'm the Risk Manager at Synapse AI, a Singapore-based AI analytics company. We're launching a B2B SaaS platform next quarter and our enterprise clients are requiring us to carry product liability insurance — some are asking for SGD 5M in coverage.

We've never purchased this type of coverage before. Could you advise whether product liability is the right policy type, or whether we'd need Tech E&O / professional indemnity instead?

Best,
Sarah Lim
Risk Manager, Synapse AI Pte Ltd`,
      },
      {
        id: 'dm2-2', direction: 'outbound', from_address: TRS_EMAIL,
        subject: 'Re: Product Liability Insurance for SaaS Platform', sent_at: '2026-04-23T01:45:00.000Z',
        to: ['sarah.lim@synapseai.sg'], cc: [],
        body_text: `Hi Sarah,

Great timing to be thinking about this before your launch — many SaaS companies learn the hard way.

For a B2B AI analytics platform, you'd likely need a combination:

- Tech E&O (Errors & Omissions): covers claims arising from software failures or incorrect outputs that cause financial loss to your clients
- Cyber Liability: increasingly required alongside E&O for platforms handling client data
- Product liability in the traditional sense is less relevant for pure software

To properly scope the coverage, a few questions:
1. Do your clients upload their own data to your platform?
2. Are your AI outputs used for automated decision-making?
3. Which jurisdictions are your clients based in?

Best regards,
Trade Risk Solutions`,
      },
      {
        id: 'dm2-3', direction: 'outbound', from_address: TRS_EMAIL,
        subject: 'Re: Product Liability Insurance for SaaS Platform — Proposal Overview', sent_at: '2026-04-25T02:30:00.000Z',
        to: ['sarah.lim@synapseai.sg'], cc: [],
        body_text: `Hi Sarah,

Following up with our initial proposal overview based on your profile.

We'd recommend:
- Tech E&O: SGD 5M per occurrence / SGD 10M aggregate
- Cyber Liability: SGD 2M per occurrence
- Estimated combined premium: SGD 18,000–24,000/year

We're well-positioned to negotiate favourable terms given your clean track record and Singapore-domiciled enterprise clients. Shall we schedule a 30-minute call to walk through the policy terms in detail?

Best regards,
Trade Risk Solutions`,
      },
    ],
  },
  'demo-3': {
    thread: { id: 'th-demo-3', subject: 'Insurance for Manufacturing Operations', status: 'open', last_message_at: '2026-05-04T01:30:00.000Z', message_count: 2 },
    messages: [
      {
        id: 'dm3-1', direction: 'inbound', from_address: 'david.park@meridianfab.com',
        subject: 'Insurance for Manufacturing Operations', sent_at: '2026-05-02T06:00:00.000Z',
        to: [TRS_EMAIL], cc: ['hr@meridianfab.com'],
        body_text: `Hi,

We run a precision fabrication facility in Tuas with about 85 staff. We're looking to review our workmen's compensation and potentially add equipment breakdown insurance — we've recently installed a new CNC machining line worth SGD 1.8M.

Are these the right types of coverage to consider? And can TRS handle both under one policy, or would they be separate?

David Park
Operations Director, Meridian Fabricators Pte Ltd`,
      },
      {
        id: 'dm3-2', direction: 'inbound', from_address: 'david.park@meridianfab.com',
        subject: 'Re: Insurance for Manufacturing Operations', sent_at: '2026-05-04T01:30:00.000Z',
        to: [TRS_EMAIL], cc: [],
        body_text: `Hi,

I sent an enquiry a few days ago and wanted to follow up. We're also wondering whether our existing public liability policy (held with a different insurer) can be folded in when we switch, or if we'd need to wait for renewal.

Happy to provide any documents you need — MOM licence, existing policy schedule, payroll records, etc.

David Park`,
      },
    ],
  },
}

const DEMO_SUMMARIES: Record<string, string> = {
  'demo-1': `SUMMARY
Marcus Tan (CFO, Pacific Cargo Pte Ltd) is enquiring about All Risks marine cargo insurance for ~SGD 2M/month in mixed industrial equipment and electronics across Singapore–Jakarta, Manila, and HCMC routes. Clean 3-year claims record. Consignment values SGD 80K–350K.

STATUS
Engaged — hot prospect with explicit board-meeting deadline. Client has provided full underwriting information and is actively following up.

LAST MESSAGE
Marcus is chasing a ballpark premium figure for a board presentation on Thursday.

NEXT ACTION
Send preliminary indication (est. SGD 14,000–19,000/year All Risks) today. Confirm delay coverage availability.`,

  'demo-2': `SUMMARY
Sarah Lim (Risk Manager, Synapse AI) needs Tech E&O + Cyber Liability ahead of a B2B SaaS launch next quarter. Enterprise clients are requiring SGD 5M coverage. TRS sent a proposal overview on 25 Apr with recommended coverage and estimated premium SGD 18K–24K/year. No client response since.

STATUS
Qualified — proposal sent, awaiting client confirmation on discovery call.

LAST MESSAGE
TRS sent proposal overview 10 days ago. Sarah has not responded.

NEXT ACTION
Follow up to confirm receipt and schedule a 30-minute call before their launch deadline.`,

  'demo-3': `SUMMARY
David Park (Operations Director, Meridian Fabricators) needs Workmen's Compensation (85 staff, Tuas facility) and Equipment Breakdown insurance for a new SGD 1.8M CNC machining line. Also asking about consolidating existing public liability policy. Has offered to provide MOM licence, policy schedule, and payroll records.

STATUS
Contacted — two inbound messages, no response from TRS yet. Warm lead with multiple coverage needs.

LAST MESSAGE
David following up, asking about folding in existing public liability, offers to share documentation immediately.

NEXT ACTION
Respond urgently — client is ready to engage. Request existing policy schedule and MOM licence to begin underwriting.`,
}

const DEMO_DRAFTS: Record<string, string> = {
  'demo-1': `Hi Marcus,

Thank you for your patience — and your follow-up is very timely. Based on the details you've shared (All Risks, SGD 80K–350K per consignment, mixed industrial equipment and electronics, clean 3-year claims record), we're looking at an estimated annual premium of SGD 14,000–19,000. The final figure will depend on insurer appetite and the full route schedule.

I'll have a formal written indication ready by Wednesday so you're well-prepared for your board meeting on Thursday. In the meantime, if you can share any existing policy schedules or packing list samples, that would help us sharpen the numbers.

Best regards,
Trade Risk Solutions`,

  'demo-2': `Hi Sarah,

I hope you're well. I wanted to follow up on the coverage proposal we sent over on 25 April — has the team had a chance to review it?

We believe the Tech E&O + Cyber package outlined will meet your enterprise clients' SGD 5M requirements and put you in a strong position ahead of your platform launch. If it would help, I'm happy to arrange a 30-minute call to walk through the policy terms and answer any questions before your Q3 go-live.

Are you free for a quick call this week or next?

Best regards,
Trade Risk Solutions`,

  'demo-3': `Hi David,

Thank you for your patience — I apologise for the delay in getting back to you.

To answer your questions: Workmen's Compensation and Equipment Breakdown would be separate policy types, but we can coordinate both under a single client account with aligned renewal dates for simplicity. As for your existing public liability policy, we can review it at renewal and consolidate everything with one insurer if the terms are competitive — no need to wait.

Please do send over your MOM licence, existing policy schedule, and payroll records at your convenience. We'll aim to have preliminary terms across both lines ready within 5 business days of receiving those.

Best regards,
Trade Risk Solutions`,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fullName(l: Lead) {
  return [l.first_name, l.last_name].filter(Boolean).join(' ') || l.email || '—'
}

function timeAgo(iso: string | null) {
  if (!iso) return '—'
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7)  return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })
}

function fmtDateTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-SG', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })
}

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

function matchesSearch(lead: Lead, q: string): boolean {
  if (!q) return true
  const lower = q.toLowerCase()
  return [lead.first_name, lead.last_name, lead.email, lead.company, lead.topic, lead.department, lead.details, lead.message]
    .some(v => v?.toLowerCase().includes(lower))
}

function inDateRange(iso: string, from: string, to: string): boolean {
  if (!from && !to) return true
  const d  = new Date(iso).getTime()
  const lo = from ? new Date(from).getTime()           : -Infinity
  const hi = to   ? new Date(to).getTime() + 86399999 :  Infinity
  return d >= lo && d <= hi
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// ── API helpers ───────────────────────────────────────────────────────────────

async function fetchLeads(): Promise<Lead[]> {
  const res = await fetch('/api/leads', { cache: 'no-store' })
  if (!res.ok) return []
  const raw = await res.json()
  const all: Lead[] = Array.isArray(raw) ? raw : []
  return all.filter(l => EMAIL_SOURCES.has(l.source) && ENGAGED_STATUSES.has(l.status))
}

async function patchStatus(id: string, status: string) {
  await fetch('/api/leads', {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ id, status }),
  })
}

async function fetchThread(email: string): Promise<{ thread: ThreadState['thread']; messages: RealMsg[] }> {
  const res = await fetch(`/api/engagement/thread?email=${encodeURIComponent(email)}`, { cache: 'no-store' })
  if (!res.ok) return { thread: null, messages: [] }
  const data = await res.json()
  return {
    thread:   data.thread   ?? null,
    messages: Array.isArray(data.messages) ? data.messages : [],
  }
}

// ── Email card ────────────────────────────────────────────────────────────────

function EmailCard({ msg, defaultOpen }: { msg: RealMsg; defaultOpen: boolean }) {
  const [open,   setOpen]   = useState(defaultOpen)
  const [copied, setCopied] = useState<string | null>(null)
  const isOut = msg.direction === 'outbound'

  function copy(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(text)
    setTimeout(() => setCopied(null), 1500)
  }

  const senderLabel = isOut ? TRS_EMAIL : (msg.from_address ?? '—')
  const bodyLines   = (msg.body_text ?? '').split('\n')

  return (
    <div style={{
      border: '1px solid #e8e8e8', borderRadius: 10, overflow: 'hidden', background: '#fff',
      marginLeft: isOut ? 32 : 0, marginRight: isOut ? 0 : 32,
    }}>
      <div
        style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setOpen(v => !v)}
      >
        <div style={{
          width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700,
          background: isOut ? 'rgba(59,130,246,0.10)' : '#f4f4f5',
          color: isOut ? '#1d4ed8' : '#555',
        }}>
          {isOut ? 'TRS' : (msg.from_address?.[0] ?? '?').toUpperCase()}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#111' }}>{senderLabel}</span>
            {isOut && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 10, background: 'rgba(34,197,94,0.10)', color: '#15803d' }}>Sent</span>
            )}
            {msg.cc.length > 0 && !open && (
              <span style={{ fontSize: 10, color: '#bbb' }}>CC: {msg.cc.length}</span>
            )}
          </div>
          {!open && (
            <p style={{ margin: 0, fontSize: 11, color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {bodyLines.find(l => l.trim()) ?? ''}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: '#bbb' }}>{fmtDateTime(msg.sent_at)}</span>
          <span style={{ fontSize: 11, color: '#ccc' }}>{open ? '▲' : '▽'}</span>
        </div>
      </div>

      {open && (
        <div style={{ borderTop: '1px solid #f0f0f0' }}>
          <div style={{ padding: '10px 14px', background: '#fafafa', borderBottom: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {[{ lbl: 'From', val: msg.from_address ?? '—' }].map(({ lbl, val }) => (
              <div key={lbl} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#aaa', width: 44, flexShrink: 0 }}>{lbl}</span>
                <span style={{ fontSize: 11, color: '#333' }}>{val}</span>
                <button onClick={() => copy(val)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                  {copied === val ? <Check size={10} style={{ color: '#22c55e' }} /> : <Copy size={10} style={{ color: '#ddd' }} />}
                </button>
              </div>
            ))}
            {msg.to.length > 0 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#aaa', width: 44, flexShrink: 0 }}>To</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {msg.to.map(a => <span key={a} style={{ fontSize: 11, background: '#f0f0f0', color: '#333', padding: '1px 7px', borderRadius: 12 }}>{a}</span>)}
                </div>
              </div>
            )}
            {msg.cc.length > 0 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#aaa', width: 44, flexShrink: 0 }}>CC</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {msg.cc.map(a => (
                    <span key={a} style={{ fontSize: 11, background: 'rgba(59,130,246,0.08)', color: '#1d4ed8', padding: '1px 7px', borderRadius: 12, border: '1px solid rgba(59,130,246,0.15)' }}>{a}</span>
                  ))}
                </div>
              </div>
            )}
            {msg.subject && (
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#aaa', width: 44, flexShrink: 0 }}>Subj</span>
                <span style={{ fontSize: 11, color: '#555' }}>{msg.subject}</span>
              </div>
            )}
          </div>
          <div style={{ padding: '14px 14px 16px' }}>
            <p style={{ margin: 0, fontSize: 13, color: '#333', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{msg.body_text ?? ''}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── AI Summary strip ──────────────────────────────────────────────────────────

function AISummaryStrip({ lead, messages, demoMode }: { lead: Lead; messages: RealMsg[]; demoMode?: boolean }) {
  const [open,    setOpen]    = useState(true)
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [error,   setError]   = useState<string | null>(null)

  // Reset when lead changes
  useEffect(() => { setSummary(null); setError(null) }, [lead.id])

  async function generate() {
    setLoading(true); setError(null)
    try {
      if (demoMode) {
        await sleep(1200)
        setSummary(DEMO_SUMMARIES[lead.id] ?? 'Demo summary not available.')
        return
      }
      const res = await fetch('/api/engagement/summarize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactName: fullName(lead), company: lead.company,
          topic: lead.topic, leadStatus: lead.status,
          messages: messages.map(m => ({ direction: m.direction, from_address: m.from_address, body_text: m.body_text, sent_at: m.sent_at })),
        }),
      })
      const data = await res.json()
      if (data.error) setError(data.error)
      else setSummary(data.summary ?? '')
    } catch { setError('Failed to generate summary') }
    finally { setLoading(false) }
  }

  return (
    <div style={{ borderBottom: '1px solid #e8e8e8', flexShrink: 0, background: '#fafafa' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#3b82f6' }}>AI Analysis</span>
          <span style={{ fontSize: 11, color: '#bbb' }}>· engagement summary</span>
        </div>
        <span style={{ fontSize: 11, color: '#bbb' }}>{open ? '▲' : '▽'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 16px 12px' }}>
          {!summary && !loading && (
            <button
              onClick={generate}
              style={{ fontSize: 11, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              {messages.length > 0 ? 'Generate analysis from email thread' : 'No email thread — analysis unavailable'}
            </button>
          )}
          {loading && <p style={{ margin: 0, fontSize: 12, color: '#aaa' }}>Analysing thread…</p>}
          {error   && <p style={{ margin: 0, fontSize: 12, color: '#ef4444' }}>{error}</p>}
          {summary && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {summary.split('\n').map((line, i) => {
                  if (!line.trim()) return null
                  const isHeader = /^[A-Z ]{3,}$/.test(line.trim())
                  return (
                    <p key={i} style={{
                      margin: isHeader ? '6px 0 1px' : '1px 0',
                      fontSize: isHeader ? 11 : 12,
                      fontWeight: isHeader ? 700 : 400,
                      color: isHeader ? '#111' : '#555',
                      lineHeight: 1.6,
                    }}>{line}</p>
                  )
                })}
              </div>
              <button onClick={generate} disabled={loading} style={{ marginTop: 6, fontSize: 11, color: '#bbb', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                {loading ? 'Refreshing…' : '↺ Refresh'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── AI Draft panel ────────────────────────────────────────────────────────────

function AIDraftPanel({
  lead, thread, messages, demoMode,
}: {
  lead:     Lead
  thread:   ThreadState['thread']
  messages: RealMsg[]
  demoMode?: boolean
}) {
  const lastMsg    = messages.at(-1)
  const needsReply = lastMsg?.direction === 'inbound'

  const [draftId,  setDraftId]  = useState<string | null>(null)
  const [content,  setContent]  = useState('')
  const [loading,  setLoading]  = useState<'gen' | 'send' | 'reject' | null>(null)
  const [sent,     setSent]     = useState(false)
  const [rejected, setRejected] = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  // Reset when lead changes
  useEffect(() => { setDraftId(null); setContent(''); setSent(false); setRejected(false); setError(null) }, [lead.id])

  async function generate() {
    if (!lead.email && !demoMode) { setError('Lead has no email address — cannot generate draft'); return }
    setLoading('gen'); setError(null)
    try {
      if (demoMode) {
        await sleep(1500)
        setDraftId('demo-draft-' + lead.id)
        setContent(DEMO_DRAFTS[lead.id] ?? 'Demo draft not available.')
        return
      }
      const res = await fetch('/api/engagement/draft', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id, contactName: fullName(lead), contactEmail: lead.email,
          company: lead.company, topic: lead.topic, leadStatus: lead.status,
          threadId: thread?.id ?? null,
          messages: messages.map(m => ({ direction: m.direction, from_address: m.from_address, body_text: m.body_text, sent_at: m.sent_at })),
        }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setDraftId(data.draftId); setContent(data.content)
    } catch { setError('Failed to generate draft') }
    finally { setLoading(null) }
  }

  async function handleSend() {
    setLoading('send')
    try {
      if (demoMode) { await sleep(600); setSent(true); return }
      if (draftId) {
        await fetch('/api/engagement/draft', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ draftId, status: 'sent', content }),
        })
      }
      setSent(true)
    } finally { setLoading(null) }
  }

  async function handleReject() {
    setLoading('reject')
    try {
      if (!demoMode && draftId) {
        await fetch('/api/engagement/draft', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ draftId, status: 'rejected', rejection_note: 'Rejected by user' }),
        })
      }
      setRejected(true); setContent(''); setDraftId(null)
    } finally { setLoading(null) }
  }

  if (sent) return (
    <div style={{ borderTop: '1px solid #e8e8e8', background: '#f9fafb', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
      <span style={{ fontSize: 12, color: '#15803d' }}>✓ Draft approved{demoMode ? ' (demo)' : ''}</span>
      <button onClick={() => { setSent(false); setContent(''); setDraftId(null) }} style={{ fontSize: 11, color: '#aaa', background: 'none', border: 'none', cursor: 'pointer' }}>New draft</button>
    </div>
  )

  if (!content && !rejected) return (
    <div style={{ borderTop: '1px solid #e8e8e8', background: '#f9fafb', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
      <span style={{ fontSize: 12, color: needsReply ? '#b45309' : '#aaa', fontStyle: needsReply ? 'normal' : 'italic', fontWeight: needsReply ? 500 : 400 }}>
        {needsReply ? '⚡ Client replied — generate a response' : 'No pending draft'}
      </span>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {error && <span style={{ fontSize: 11, color: '#ef4444' }}>{error}</span>}
        <button onClick={generate} disabled={!!loading} style={{ fontSize: 11, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap' }}>
          {loading === 'gen' ? 'Generating…' : 'Generate AI reply'}
        </button>
      </div>
    </div>
  )

  if (rejected) return (
    <div style={{ borderTop: '1px solid #e8e8e8', background: '#f9fafb', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
      <span style={{ fontSize: 12, color: '#aaa' }}>Draft rejected</span>
      <button onClick={() => { setRejected(false); generate() }} style={{ fontSize: 11, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer' }}>Regenerate</button>
    </div>
  )

  return (
    <div style={{ borderTop: '1px solid #e8e8e8', background: '#f9fafb', flexShrink: 0 }}>
      <div style={{ padding: '8px 16px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#3b82f6' }}>AI Draft</span>
          {lastMsg?.sent_at && (
            <span style={{ fontSize: 11, color: '#bbb' }}>— replying to {lastMsg.from_address} · {timeAgo(lastMsg.sent_at)}</span>
          )}
        </div>
        <button onClick={generate} disabled={!!loading} style={{ fontSize: 11, color: '#aaa', background: 'none', border: 'none', cursor: 'pointer' }}>
          {loading === 'gen' ? 'Regenerating…' : '↺ Regenerate'}
        </button>
      </div>

      {lastMsg && (
        <div style={{ margin: '0 16px 6px', padding: '8px 10px', background: '#f0f0f0', borderRadius: 7, borderLeft: '3px solid #ddd' }}>
          <p style={{ margin: 0, fontSize: 11, color: '#888', lineHeight: 1.5 }}>
            {(lastMsg.body_text ?? '').split('\n').find(l => l.trim())?.slice(0, 120)}…
          </p>
        </div>
      )}

      <div style={{ padding: '0 16px 8px' }}>
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          rows={5}
          style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, color: '#333', lineHeight: 1.65, border: '1px solid #e8e8e8', borderRadius: 8, padding: '10px 12px', resize: 'none', background: '#fff', outline: 'none', fontFamily: 'inherit' }}
        />
      </div>
      <div style={{ padding: '0 16px 12px', display: 'flex', gap: 8 }}>
        <button onClick={handleReject} disabled={!!loading} style={{ padding: '7px 16px', fontSize: 12, fontWeight: 500, border: '1px solid #e8e8e8', borderRadius: 8, background: '#fff', color: '#666', cursor: 'pointer', opacity: loading ? 0.5 : 1 }}>
          {loading === 'reject' ? 'Rejecting…' : 'Reject'}
        </button>
        <button onClick={handleSend} disabled={!!loading || !content.trim()} style={{ flex: 1, padding: '7px 16px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 8, background: '#111', color: '#fff', cursor: 'pointer', opacity: (loading || !content.trim()) ? 0.5 : 1 }}>
          {loading === 'send' ? 'Saving…' : 'Approve & Send Reply'}
        </button>
      </div>
    </div>
  )
}

// ── Contact panel ─────────────────────────────────────────────────────────────

function ContactPanel({
  lead, messages, onStatus,
}: {
  lead:      Lead
  messages:  RealMsg[]
  onStatus:  (id: string, s: string) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [copied,   setCopied]   = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const st = STATUS_MAP[lead.status] ?? STATUS_MAP.contacted
  const lastInbound  = [...messages].reverse().find(m => m.direction === 'inbound')
  const needsReply   = messages.at(-1)?.direction === 'inbound'
  const allCcs = Array.from(new Set(messages.flatMap(m => m.cc)))

  function copy(text: string, k: string) {
    navigator.clipboard.writeText(text); setCopied(k); setTimeout(() => setCopied(null), 1500)
  }

  useEffect(() => {
    if (!menuOpen) return
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [menuOpen])

  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#bbb', margin: '0 0 4px' }
  const val: React.CSSProperties = { fontSize: 12, color: '#333', margin: 0, wordBreak: 'break-all' }

  return (
    <div style={{ width: 248, flexShrink: 0, borderLeft: '1px solid #e8e8e8', background: '#fff', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', background: needsReply ? '#fffbeb' : '#fff' }}>
        {needsReply ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: '#b45309' }}>Awaiting your reply</span>
          </div>
        ) : messages.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: '#15803d' }}>We replied last</span>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#e5e7eb', flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: '#aaa' }}>No emails yet</span>
          </div>
        )}
        {messages.length > 0 && (
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <div><p style={lbl}>Emails</p><p style={{ ...val, fontSize: 14, fontWeight: 700 }}>{messages.length}</p></div>
            <div><p style={lbl}>Days open</p><p style={{ ...val, fontSize: 14, fontWeight: 700 }}>{daysSince(lead.created_at)}</p></div>
            {lastInbound?.sent_at && <div><p style={lbl}>Last reply</p><p style={{ ...val, fontSize: 11 }}>{timeAgo(lastInbound.sent_at)}</p></div>}
          </div>
        )}
      </div>

      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
        <p style={lbl}>Lead Status</p>
        <div style={{ position: 'relative' }} ref={menuRef}>
          <button onClick={() => setMenuOpen(v => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 8, border: '1px solid #e8e8e8', background: st.bg, color: st.color, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {st.label} <ChevronDown size={12} strokeWidth={2.5} />
          </button>
          {menuOpen && (
            <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#fff', border: '1px solid #e8e8e8', borderRadius: 10, boxShadow: '0 4px 24px rgba(0,0,0,0.10)', zIndex: 50, padding: '4px 0' }}>
              {ALL_STATUSES.map(s => {
                const sc = STATUS_MAP[s]
                return (
                  <button key={s} onClick={() => { onStatus(lead.id, s); setMenuOpen(false) }} style={{ width: '100%', textAlign: 'left', padding: '7px 12px', fontSize: 12, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: lead.status === s ? sc.color : '#555' }}>
                    <span style={{ width: 6, height: 6, borderRadius: 3, background: sc.color, flexShrink: 0 }} />
                    {sc.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
        <p style={lbl}>Contact</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(lead.first_name || lead.last_name) && <div><p style={lbl}>Name</p><p style={val}>{fullName(lead)}</p></div>}
          {lead.email && (
            <div><p style={lbl}>Email</p>
              <button onClick={() => copy(lead.email!, 'email')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 12, color: '#333', wordBreak: 'break-all', textAlign: 'left' }}>{lead.email}</span>
                {copied === 'email' ? <Check size={10} style={{ color: '#22c55e', flexShrink: 0 }} /> : <Copy size={9} style={{ color: '#ccc', flexShrink: 0 }} />}
              </button>
            </div>
          )}
          {lead.phone && (
            <div><p style={lbl}>Phone</p>
              <button onClick={() => copy(lead.phone!, 'phone')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 12, color: '#333' }}>{lead.phone}</span>
                {copied === 'phone' ? <Check size={10} style={{ color: '#22c55e', flexShrink: 0 }} /> : <Copy size={9} style={{ color: '#ccc', flexShrink: 0 }} />}
              </button>
            </div>
          )}
          {lead.company && <div><p style={lbl}>Company</p><p style={val}>{lead.company}</p></div>}
        </div>
      </div>

      {allCcs.length > 0 && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
          <p style={lbl}>CC Participants</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {allCcs.map(addr => (
              <div key={addr} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(59,130,246,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#1d4ed8', flexShrink: 0 }}>
                  {addr[0].toUpperCase()}
                </span>
                <span style={{ fontSize: 11, color: '#555', wordBreak: 'break-all', flex: 1 }}>{addr}</span>
                <span style={{ fontSize: 9, color: '#bbb', background: '#f4f4f5', padding: '1px 5px', borderRadius: 4 }}>CC</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
        <p style={lbl}>Lead Info</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {lead.department   && <div><p style={lbl}>Department</p><p style={val}>{lead.department}</p></div>}
          {lead.topic        && <div><p style={lbl}>Topic</p><p style={val}>{lead.topic}</p></div>}
          {lead.contact_type && <div><p style={lbl}>Type</p><p style={val}>{lead.contact_type}</p></div>}
          <div><p style={lbl}>Lead since</p><p style={val}>{new Date(lead.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}</p></div>
        </div>
      </div>

      <div style={{ padding: '12px 16px', flex: 1 }}>
        <p style={lbl}>Internal Notes</p>
        <textarea placeholder="Add notes…" rows={4} style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, color: '#333', lineHeight: 1.6, border: '1px solid #e8e8e8', borderRadius: 8, padding: '8px 10px', resize: 'none', background: '#fafafa', outline: 'none', fontFamily: 'inherit' }} />
      </div>
    </div>
  )
}

// ── Thread view ───────────────────────────────────────────────────────────────

function ThreadView({
  lead, threadState, onStatus, demoMode,
}: {
  lead:        Lead
  threadState: ThreadState
  onStatus:    (id: string, s: string) => void
  demoMode:    boolean
}) {
  const { thread, messages, loading, error } = threadState
  const st         = STATUS_MAP[lead.status] ?? STATUS_MAP.contacted
  const needsReply = messages.at(-1)?.direction === 'inbound'
  const initialMsg = lead.details || lead.message

  return (
    <div style={{ flex: 1, display: 'flex', minWidth: 0, overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e8e8e8', background: '#fff', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>{fullName(lead)}</span>
                {lead.company && <span style={{ fontSize: 12, color: '#aaa' }}>· {lead.company}</span>}
                {needsReply && (
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'rgba(245,158,11,0.10)', color: '#b45309' }}>⚡ Needs reply</span>
                )}
              </div>
              {(thread?.subject || lead.topic) && (
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#888' }}>{thread?.subject ?? `Enquiry — ${lead.topic}`}</p>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: st.bg, color: st.color }}>{st.label}</span>
              {messages.length > 0 && (
                <span style={{ fontSize: 11, color: '#bbb' }}>{messages.length} email{messages.length !== 1 ? 's' : ''}</span>
              )}
            </div>
          </div>
        </div>

        <AISummaryStrip lead={lead} messages={messages} demoMode={demoMode} />

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading && <div style={{ textAlign: 'center', padding: '48px 0', fontSize: 12, color: '#bbb' }}>Loading email thread…</div>}
          {!loading && error && <div style={{ textAlign: 'center', padding: '32px 0', fontSize: 12, color: '#ef4444' }}>{error}</div>}
          {!loading && !error && messages.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ textAlign: 'center', padding: '24px 0 8px', fontSize: 12, color: '#bbb' }}>
                No email thread found for {lead.email ?? 'this contact'}.
              </div>
              {initialMsg && (
                <div style={{ border: '1px solid #e8e8e8', borderRadius: 10, padding: 14, background: '#fff' }}>
                  <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 600, color: '#aaa' }}>Original message from lead form</p>
                  <p style={{ margin: 0, fontSize: 13, color: '#333', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{initialMsg}</p>
                </div>
              )}
            </div>
          )}
          {!loading && messages.map((msg, i) => (
            <EmailCard key={msg.id} msg={msg} defaultOpen={i === messages.length - 1} />
          ))}
        </div>

        <AIDraftPanel lead={lead} thread={thread} messages={messages} demoMode={demoMode} />
      </div>

      <ContactPanel lead={lead} messages={messages} onStatus={onStatus} />
    </div>
  )
}

// ── Lead list item ─────────────────────────────────────────────────────────────

function LeadListItem({
  lead, isActive, threadState, onClick,
}: {
  lead:        Lead
  isActive:    boolean
  threadState: ThreadState | undefined
  onClick:     () => void
}) {
  const st          = STATUS_MAP[lead.status] ?? STATUS_MAP.contacted
  const msgs        = threadState?.messages ?? []
  const lastMsg     = msgs.at(-1)
  const needsReply  = lastMsg?.direction === 'inbound'
  const msgCount    = msgs.length

  const previewText = lastMsg
    ? `${lastMsg.direction === 'outbound' ? 'You: ' : ''}${(lastMsg.body_text ?? '').split('\n').find(l => l.trim()) ?? ''}`
    : (lead.details || lead.message || lead.topic || '—')

  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', padding: '11px 14px',
        borderBottom: '1px solid #f0f0f0', background: isActive ? '#f7f7f7' : '#fff',
        border: 'none', cursor: 'pointer', display: 'block',
        borderLeftWidth: 3, borderLeftStyle: 'solid', borderLeftColor: isActive ? st.color : 'transparent',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#111' }}>{fullName(lead)}</span>
            {lead.company && <span style={{ fontSize: 11, color: '#aaa' }}>· {lead.company}</span>}
          </div>
          {lead.topic && <p style={{ margin: '0 0 2px', fontSize: 11, color: '#777' }}>— {lead.topic}</p>}
          <p style={{ margin: 0, fontSize: 11, color: '#bbb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {previewText}
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: '#bbb' }}>{timeAgo(lastMsg?.sent_at ?? lead.created_at)}</span>
          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: st.bg, color: st.color }}>{st.label}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {msgCount > 0 && <span style={{ fontSize: 10, color: '#bbb' }}>{msgCount} email{msgCount !== 1 ? 's' : ''}</span>}
            {needsReply && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b' }} />}
          </div>
        </div>
      </div>
    </button>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EngagementPage() {
  const [leads,      setLeads]      = useState<Lead[]>([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search,     setSearch]     = useState('')
  const [sortKey,    setSortKey]    = useState<SortKey>('last_activity')
  const [dateFrom,   setDateFrom]   = useState('')
  const [dateTo,     setDateTo]     = useState('')
  const [sortOpen,   setSortOpen]   = useState(false)
  const [threadMap,  setThreadMap]  = useState<Record<string, ThreadState>>({})
  const [demoMode,   setDemoMode]   = useState(false)

  const sortRef = useRef<HTMLDivElement>(null)

  // Build a full threadMap from demo data
  const demoThreadMap = useMemo<Record<string, ThreadState>>(() =>
    Object.fromEntries(
      DEMO_LEADS.map(l => [
        l.id,
        { loading: false, thread: DEMO_THREADS[l.id]?.thread ?? null, messages: DEMO_THREADS[l.id]?.messages ?? [], error: null },
      ])
    ), [])

  function enableDemo() {
    setDemoMode(true)
    setLeads(DEMO_LEADS)
    setThreadMap(demoThreadMap)
    setSelectedId(DEMO_LEADS[0].id)
    setLoading(false)
  }

  function disableDemo() {
    setDemoMode(false)
    setLeads([])
    setThreadMap({})
    setSelectedId(null)
    setLoading(true)
    load()
  }

  const load = useCallback(async (spinner = false) => {
    if (spinner) setRefreshing(true)
    try {
      const data = await fetchLeads()
      setLeads(data)
      setSelectedId(prev => prev ?? (data[0]?.id ?? null))
    } finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(() => { if (!demoMode) load() }, 30_000)
    return () => clearInterval(t)
  }, [load]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sortOpen) return
    const h = (e: MouseEvent) => { if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [sortOpen])

  // Load thread lazily (real mode only)
  useEffect(() => {
    if (demoMode) return
    if (!selectedId) return
    const lead = leads.find(l => l.id === selectedId)
    if (!lead?.email) return
    if (threadMap[selectedId]) return

    setThreadMap(prev => ({ ...prev, [selectedId]: { loading: true, thread: null, messages: [], error: null } }))
    fetchThread(lead.email).then(({ thread, messages }) => {
      setThreadMap(prev => ({ ...prev, [selectedId]: { loading: false, thread, messages, error: null } }))
    }).catch(err => {
      setThreadMap(prev => ({ ...prev, [selectedId]: { loading: false, thread: null, messages: [], error: err?.message ?? 'Error loading thread' } }))
    })
  }, [selectedId, leads, demoMode]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleStatus(id: string, status: string) {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l))
    if (!demoMode) patchStatus(id, status)
  }

  function clearFilters() { setSearch(''); setDateFrom(''); setDateTo('') }
  const hasFilters = search || dateFrom || dateTo

  const visible = useMemo(() => {
    let list = leads.filter(l => matchesSearch(l, search) && inDateRange(l.created_at, dateFrom, dateTo))
    if (sortKey === 'newest') list = [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    else if (sortKey === 'oldest') list = [...list].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    else {
      list = [...list].sort((a, b) => {
        const ta = threadMap[a.id]?.messages.at(-1)?.sent_at ?? a.created_at
        const tb = threadMap[b.id]?.messages.at(-1)?.sent_at ?? b.created_at
        return new Date(tb).getTime() - new Date(ta).getTime()
      })
    }
    return list
  }, [leads, search, dateFrom, dateTo, sortKey, threadMap])

  const selectedLead   = leads.find(l => l.id === selectedId) ?? null
  const selectedThread = selectedId ? threadMap[selectedId] : undefined
  const needsReplyCount = Object.values(threadMap).filter(t => t.messages.at(-1)?.direction === 'inbound').length

  const SORT_LABELS: Record<SortKey, string> = {
    last_activity: 'Last activity',
    newest:        'Newest lead',
    oldest:        'Oldest lead',
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', flexDirection: 'column' }}>

      {/* Demo banner */}
      {demoMode && (
        <div style={{ background: '#fef9c3', borderBottom: '1px solid #fde047', padding: '6px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Demo Mode</span>
            <span style={{ fontSize: 12, color: '#78350f' }}>Showing 3 sample conversations — no real data is read or written</span>
          </div>
          <button onClick={disableDemo} style={{ fontSize: 11, fontWeight: 600, color: '#92400e', background: 'rgba(0,0,0,0.06)', border: 'none', borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}>
            Exit Demo
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Left panel ── */}
        <div style={{ width: 320, flexShrink: 0, borderRight: '1px solid #e8e8e8', background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid #e8e8e8', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>Engagement Agent</span>
                {!loading && needsReplyCount > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: 'rgba(245,158,11,0.12)', color: '#b45309' }}>
                    {needsReplyCount} need reply
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {!demoMode && (
                  <button
                    onClick={enableDemo}
                    title="Load sample data to preview the full UI flow"
                    style={{ fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 6, border: '1px solid #fde047', background: '#fef9c3', color: '#92400e', cursor: 'pointer', letterSpacing: '0.02em' }}
                  >
                    Demo
                  </button>
                )}
                <button onClick={() => !demoMode && load(true)} style={{ background: 'none', border: 'none', cursor: demoMode ? 'default' : 'pointer', color: '#bbb', display: 'flex', opacity: demoMode ? 0.3 : 1 }}>
                  <RefreshCw size={13} strokeWidth={2} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f4f4f5', borderRadius: 8, padding: '0 10px', height: 34, marginBottom: 8 }}>
              <Search size={13} style={{ color: '#aaa', flexShrink: 0 }} strokeWidth={2} />
              <input
                type="text" placeholder="Search name, email, company, topic…" value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 12, color: '#333', fontFamily: 'inherit' }}
              />
              {search && (
                <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                  <X size={12} style={{ color: '#aaa' }} />
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <div style={{ position: 'relative' }} ref={sortRef}>
                <button onClick={() => setSortOpen(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#555', background: '#fff', border: '1px solid #e8e8e8', borderRadius: 7, padding: '5px 9px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <ArrowUpDown size={11} strokeWidth={2} style={{ color: '#aaa' }} />
                  {SORT_LABELS[sortKey]}
                  <ChevronDown size={10} strokeWidth={2} style={{ color: '#bbb' }} />
                </button>
                {sortOpen && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, background: '#fff', border: '1px solid #e8e8e8', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.10)', zIndex: 50, padding: '4px 0', minWidth: 150 }}>
                    {(Object.entries(SORT_LABELS) as [SortKey, string][]).map(([k, lbl]) => (
                      <button key={k} onClick={() => { setSortKey(k); setSortOpen(false) }} style={{ width: '100%', textAlign: 'left', padding: '7px 12px', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', color: sortKey === k ? '#3b82f6' : '#333', fontWeight: sortKey === k ? 600 : 400 }}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                <Calendar size={11} style={{ color: '#bbb', flexShrink: 0 }} />
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  style={{ flex: 1, fontSize: 10, border: '1px solid #e8e8e8', borderRadius: 6, padding: '4px 5px', color: '#555', background: '#fff', outline: 'none', fontFamily: 'inherit', minWidth: 0 }} />
                <span style={{ fontSize: 10, color: '#bbb' }}>–</span>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  style={{ flex: 1, fontSize: 10, border: '1px solid #e8e8e8', borderRadius: 6, padding: '4px 5px', color: '#555', background: '#fff', outline: 'none', fontFamily: 'inherit', minWidth: 0 }} />
              </div>
            </div>

            {hasFilters && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {search && <span style={{ fontSize: 10, background: 'rgba(59,130,246,0.08)', color: '#1d4ed8', padding: '2px 8px', borderRadius: 12, border: '1px solid rgba(59,130,246,0.15)' }}>"{search}"</span>}
                {(dateFrom || dateTo) && <span style={{ fontSize: 10, background: 'rgba(59,130,246,0.08)', color: '#1d4ed8', padding: '2px 8px', borderRadius: 12, border: '1px solid rgba(59,130,246,0.15)' }}>{dateFrom || '…'} → {dateTo || '…'}</span>}
                <button onClick={clearFilters} style={{ fontSize: 10, color: '#aaa', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Clear all</button>
              </div>
            )}
          </div>

          <div style={{ padding: '6px 14px', borderBottom: '1px solid #f0f0f0', flexShrink: 0, background: '#fafafa' }}>
            <span style={{ fontSize: 11, color: '#aaa' }}>
              {loading ? 'Loading…' : `${visible.length} conversation${visible.length !== 1 ? 's' : ''}${hasFilters ? ' matching' : ''}${demoMode ? ' · sample data' : ''}`}
            </span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 12, color: '#bbb' }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: 12, color: '#bbb', marginBottom: 8 }}>
                  {hasFilters ? 'No conversations match your search.' : 'No engaged conversations yet.'}
                </p>
                {hasFilters
                  ? <button onClick={clearFilters} style={{ fontSize: 11, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer' }}>Clear filters</button>
                  : <button onClick={enableDemo} style={{ fontSize: 11, color: '#92400e', background: '#fef9c3', border: '1px solid #fde047', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontWeight: 600 }}>Try Demo Mode</button>
                }
              </div>
            ) : (
              visible.map(lead => (
                <LeadListItem
                  key={lead.id}
                  lead={lead}
                  isActive={lead.id === selectedId}
                  threadState={threadMap[lead.id]}
                  onClick={() => setSelectedId(lead.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* ── Right: thread detail ── */}
        {selectedLead ? (
          <ThreadView
            lead={selectedLead}
            threadState={selectedThread ?? { loading: !selectedLead.email, thread: null, messages: [], error: selectedLead.email ? null : 'No email address on this lead' }}
            onStatus={handleStatus}
            demoMode={demoMode}
          />
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#bbb', gap: 8 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#888' }}>Select a conversation</p>
            <p style={{ margin: 0, fontSize: 12, color: '#bbb' }}>
              {loading ? 'Loading…' : leads.length === 0 ? 'No engaged leads yet. Change a lead status to Contacted or above.' : 'Choose from the list on the left.'}
            </p>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
