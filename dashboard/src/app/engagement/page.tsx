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

type EmailMsg = {
  id: string
  direction: 'inbound' | 'outbound'
  from: string
  to: string[]
  cc: string[]
  subject: string
  body: string
  time: string
  sent: boolean
}

type SortKey = 'last_activity' | 'newest' | 'oldest'

// ── Constants ─────────────────────────────────────────────────────────────────

const ENGAGED_STATUSES = new Set(['contacted', 'qualified', 'converted'])
const EMAIL_SOURCES    = new Set(['website_form', 'email', 'manual'])

const DEPT_COLOR: Record<string, string> = {
  'Sales':            '#3b82f6',
  'Customer Support': '#f59e0b',
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  contacted: { label: 'Contacted', color: '#b45309', bg: 'rgba(245,158,11,0.10)'  },
  qualified: { label: 'Qualified', color: '#15803d', bg: 'rgba(34,197,94,0.10)'   },
  converted: { label: 'Converted', color: '#7e22ce', bg: 'rgba(168,85,247,0.10)'  },
  dropped:   { label: 'Dropped',   color: '#4b5563', bg: 'rgba(107,114,128,0.10)' },
}
const ALL_STATUSES = ['contacted', 'qualified', 'converted', 'dropped']

// ── Helpers ───────────────────────────────────────────────────────────────────

function fullName(l: Lead) {
  return [l.first_name, l.last_name].filter(Boolean).join(' ') || l.email || '—'
}

function firstMsg(l: Lead) { return l.details || l.message || '' }

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7)  return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-SG', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

// Search match — checks name, email, company, topic, body
function matchesSearch(lead: Lead, q: string): boolean {
  if (!q) return true
  const lower = q.toLowerCase()
  return [
    fullName(lead),
    lead.email,
    lead.company,
    lead.topic,
    lead.department,
    firstMsg(lead),
  ].some(v => v?.toLowerCase().includes(lower))
}

// Date range filter
function inDateRange(iso: string, from: string, to: string): boolean {
  if (!from && !to) return true
  const d   = new Date(iso).getTime()
  const lo  = from ? new Date(from).getTime()                         : -Infinity
  const hi  = to   ? new Date(to).getTime() + 86400000 - 1           :  Infinity
  return d >= lo && d <= hi
}

// ── Mock thread builder ───────────────────────────────────────────────────────
// Builds a realistic multi-turn email thread with CC

function buildThread(lead: Lead): EmailMsg[] {
  const body      = firstMsg(lead)
  const fromEmail = lead.email || 'unknown@email.com'
  const company   = lead.company || ''
  const name      = lead.first_name || 'there'
  const topic     = lead.topic || 'your enquiry'
  const subject   = lead.topic ? `Enquiry — ${lead.topic}` : 'General Enquiry'

  // Generate plausible CC contacts based on context
  const companyCc = company
    ? `finance@${company.toLowerCase().replace(/\s+/g, '')}.com`
    : null
  const internalCc = 'ops@trade-risksol.com'

  const t0 = new Date(lead.created_at).getTime()

  const thread: EmailMsg[] = []

  // 1. Initial inbound email
  if (body) {
    thread.push({
      id: `${lead.id}-1`,
      direction: 'inbound',
      from: fromEmail,
      to: ['hello@trade-risksol.com'],
      cc: companyCc ? [companyCc] : [],
      subject,
      body,
      time: new Date(t0).toISOString(),
      sent: true,
    })
  }

  // 2. Our first reply (AI drafted, sent)
  thread.push({
    id: `${lead.id}-2`,
    direction: 'outbound',
    from: 'hello@trade-risksol.com',
    to: [fromEmail],
    cc: companyCc ? [companyCc, internalCc] : [internalCc],
    subject: `Re: ${subject}`,
    body: buildReply1(lead),
    time: new Date(t0 + 1.5 * 3600000).toISOString(),
    sent: true,
  })

  // 3. Their follow-up (only if qualified or converted)
  if (['qualified', 'converted'].includes(lead.status)) {
    thread.push({
      id: `${lead.id}-3`,
      direction: 'inbound',
      from: fromEmail,
      to: ['hello@trade-risksol.com'],
      cc: companyCc ? [companyCc] : [],
      subject: `Re: ${subject}`,
      body: buildFollowUp(lead),
      time: new Date(t0 + 26 * 3600000).toISOString(),
      sent: true,
    })

    // 4. Our qualification response
    thread.push({
      id: `${lead.id}-4`,
      direction: 'outbound',
      from: 'hello@trade-risksol.com',
      to: [fromEmail],
      cc: companyCc ? [companyCc, internalCc] : [internalCc],
      subject: `Re: ${subject}`,
      body: buildReply2(lead),
      time: new Date(t0 + 28 * 3600000).toISOString(),
      sent: true,
    })
  }

  // 5. Converted: add final closing exchange
  if (lead.status === 'converted') {
    thread.push({
      id: `${lead.id}-5`,
      direction: 'inbound',
      from: fromEmail,
      to: ['hello@trade-risksol.com'],
      cc: companyCc ? [companyCc] : [],
      subject: `Re: ${subject}`,
      body: `Hi,\n\nThat sounds good. Let's proceed with the option you recommended. Please send over the final documents for our signature.\n\nThanks,\n${fullName(lead)}`,
      time: new Date(t0 + 72 * 3600000).toISOString(),
      sent: true,
    })
    thread.push({
      id: `${lead.id}-6`,
      direction: 'outbound',
      from: 'hello@trade-risksol.com',
      to: [fromEmail],
      cc: companyCc ? [companyCc, internalCc] : [internalCc],
      subject: `Re: ${subject}`,
      body: `Hi ${name},\n\nExcellent! I've attached the policy documents and the debit authorisation form.\n\nOnce you've signed and returned, we'll activate the policy and send you the certificate of insurance within 1 business day.\n\nLooking forward to working with you.\n\nBest regards,\nTrade Risk Solutions`,
      time: new Date(t0 + 73 * 3600000).toISOString(),
      sent: true,
    })
  }

  return thread
}

function buildReply1(lead: Lead): string {
  const name  = lead.first_name || 'there'
  const topic = lead.topic || 'your enquiry'
  if (lead.department === 'Customer Support') {
    return `Hi ${name},\n\nThank you for reaching out. We've received your request regarding ${topic} and are reviewing it now.\n\nCould you please provide your policy number and the employee's details so we can process the change promptly?\n\nBest regards,\nTrade Risk Solutions`
  }
  return `Hi ${name},\n\nThank you for your interest in ${topic}. I'd love to help you find the right coverage.\n\nTo prepare an accurate quotation, could you share:\n1. Number of people to be covered (if group)\n2. Desired coverage start date\n3. Any specific requirements or exclusions you need\n\nLooking forward to your reply.\n\nBest regards,\nTrade Risk Solutions`
}

function buildFollowUp(lead: Lead): string {
  const topic = lead.topic || 'this'
  if (lead.department === 'Customer Support') {
    return `Hi,\n\nThe policy number is TRS-2024-${Math.floor(Math.random() * 90000 + 10000)}. The employee's last day was last Friday and her name is Rachel Lim, NRIC S9012345A.\n\nPlease let me know if you need anything else.\n\nThanks`
  }
  return `Hi,\n\nThanks for getting back to us. Here are the details:\n\n1. We have ${lead.department === 'Sales' ? '15' : '2'} people to be covered\n2. We're looking to start from 1st of next month\n3. We need ${topic.toLowerCase().includes('travel') ? 'adventure sports coverage included' : 'comprehensive coverage with no sub-limits'}\n\nCan you send a few options with pricing?\n\nThanks`
}

function buildReply2(lead: Lead): string {
  const name = lead.first_name || 'there'
  if (lead.department === 'Customer Support') {
    return `Hi ${name},\n\nThank you for the details. We've initiated the headcount removal for Rachel Lim effective last Friday.\n\nYou'll receive a revised policy schedule within 2 business days. A pro-rated refund of approximately $240 will be credited to your account in the next billing cycle.\n\nDo let us know if there's anything else we can help with.\n\nBest regards,\nTrade Risk Solutions`
  }
  return `Hi ${name},\n\nThank you — I've put together 3 options for your review:\n\n**Option A — Basic** $1,200/year\nCore coverage, $100K medical, standard terms\n\n**Option B — Standard** $1,800/year (recommended)\nEnhanced coverage, $300K medical, adventure sports included\n\n**Option C — Premium** $2,800/year\nFull coverage, $500K medical, worldwide 24/7 assistance\n\nOption B is our most popular for your profile. Happy to arrange a quick call to walk you through the details.\n\nBest regards,\nTrade Risk Solutions`
}

function buildAIDraft(lead: Lead, thread: EmailMsg[]): string {
  const name     = lead.first_name || 'there'
  const lastIn   = [...thread].reverse().find(m => m.direction === 'inbound')
  if (!lastIn) return ''

  if (lead.status === 'qualified') {
    return `Hi ${name},\n\nFollowing up on my previous email — have you had a chance to review the options I shared?\n\nI'm happy to jump on a 15-minute call this week to answer any questions and help you decide. Just let me know what time works best.\n\nAlternatively, if you'd like to proceed with Option B, I can have the documents ready by end of day.\n\nBest regards,\nTrade Risk Solutions`
  }
  if (lead.department === 'Customer Support') {
    return `Hi ${name},\n\nJust following up to confirm your recent request has been processed. Your updated policy schedule has been emailed to you.\n\nIs there anything else we can help with?\n\nBest regards,\nTrade Risk Solutions`
  }
  return `Hi ${name},\n\nThank you for the information. I'm putting together a tailored proposal for you and will have it ready within the next 24 hours.\n\nIn the meantime, do you have any preferred insurers or specific exclusions I should keep in mind?\n\nBest regards,\nTrade Risk Solutions`
}

function buildSummary(lead: Lead, thread: EmailMsg[]): string {
  const msgCount = thread.length
  const lastIn   = [...thread].reverse().find(m => m.direction === 'inbound')
  const lastOut  = [...thread].reverse().find(m => m.direction === 'outbound')
  const topic    = lead.topic || 'general enquiry'
  const dept     = lead.department || 'General'
  const st       = STATUS_MAP[lead.status]?.label || lead.status
  const days     = daysSince(lead.created_at)

  return [
    `**Conversation summary:** ${msgCount}-email thread over ${days} day${days !== 1 ? 's' : ''}. ${dept === 'Customer Support' ? 'Existing customer support case' : 'Active sales opportunity'} for ${topic}.`,
    '',
    `**Current status:** ${st}. ${
      lead.status === 'qualified'
        ? 'Proposal sent, awaiting decision.'
        : lead.status === 'converted'
        ? 'Policy confirmed and documents sent.'
        : 'Awaiting client details to prepare quote.'
    }`,
    '',
    `**Thread participants:**`,
    `• Client: ${fullName(lead)} (${lead.email || '—'})`,
    lead.company ? `• Company: ${lead.company}` : null,
    lastOut ? `• Last reply from us: ${timeAgo(lastOut.time)}` : null,
    lastIn ? `• Last message from client: ${timeAgo(lastIn.time)}` : null,
    '',
    `**AI recommended action:** ${
      lead.status === 'qualified'
        ? 'Send a follow-up if no reply in 24h. Offer a call to close — deals at this stage convert 2× faster with a live conversation.'
        : lead.status === 'converted'
        ? 'Set a 30-day check-in reminder. First renewal window is in 11 months.'
        : 'Reply to client\'s latest message with a detailed proposal. Include pricing options.'
    }`,
  ].filter(l => l !== null).join('\n')
}

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchLeads(): Promise<Lead[]> {
  const res = await fetch('/api/leads', { cache: 'no-store' })
  if (!res.ok) return []
  const all: Lead[] = await res.json()
  return all.filter(l => EMAIL_SOURCES.has(l.source) && ENGAGED_STATUSES.has(l.status))
}

async function patchStatus(id: string, status: string) {
  await fetch('/api/leads', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, status }),
  })
}

// ── Email card ────────────────────────────────────────────────────────────────

function EmailCard({ msg, defaultOpen }: { msg: EmailMsg; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const [copied, setCopied] = useState<string | null>(null)
  const isOut = msg.direction === 'outbound'

  function copy(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(text)
    setTimeout(() => setCopied(null), 1500)
  }

  const allRecipients = [...msg.to, ...msg.cc]

  return (
    <div style={{
      border: '1px solid #e8e8e8', borderRadius: 10, overflow: 'hidden', background: '#fff',
      marginLeft: isOut ? 32 : 0, marginRight: isOut ? 0 : 32,
    }}>
      {/* Collapsed header */}
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
          {isOut ? 'AI' : (msg.from[0] || '?').toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#111' }}>
              {isOut ? 'AI Agent (Trade Risk Solutions)' : msg.from}
            </span>
            {isOut && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 10, background: 'rgba(34,197,94,0.10)', color: '#15803d' }}>
                Sent
              </span>
            )}
            {msg.cc.length > 0 && !open && (
              <span style={{ fontSize: 10, color: '#bbb' }}>
                CC: {msg.cc.length}
              </span>
            )}
          </div>
          {!open && (
            <p style={{ margin: 0, fontSize: 11, color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {msg.body.split('\n').find(l => l.trim()) || ''}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: '#bbb' }}>{fmtDateTime(msg.time)}</span>
          <span style={{ fontSize: 11, color: '#ccc' }}>{open ? '▲' : '▽'}</span>
        </div>
      </div>

      {/* Expanded body */}
      {open && (
        <div style={{ borderTop: '1px solid #f0f0f0' }}>
          {/* Email metadata */}
          <div style={{ padding: '10px 14px', background: '#fafafa', borderBottom: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {/* From */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#aaa', width: 44, flexShrink: 0 }}>From</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: '#333' }}>{msg.from}</span>
                <button onClick={() => copy(msg.from)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                  {copied === msg.from ? <Check size={10} style={{ color: '#22c55e' }} /> : <Copy size={10} style={{ color: '#ddd' }} />}
                </button>
              </div>
            </div>
            {/* To */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#aaa', width: 44, flexShrink: 0 }}>To</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {msg.to.map(addr => (
                  <span key={addr} style={{ fontSize: 11, background: '#f0f0f0', color: '#333', padding: '1px 7px', borderRadius: 12 }}>{addr}</span>
                ))}
              </div>
            </div>
            {/* CC */}
            {msg.cc.length > 0 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#aaa', width: 44, flexShrink: 0 }}>CC</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {msg.cc.map(addr => (
                    <span key={addr} style={{ fontSize: 11, background: 'rgba(59,130,246,0.08)', color: '#1d4ed8', padding: '1px 7px', borderRadius: 12, border: '1px solid rgba(59,130,246,0.15)' }}>
                      {addr}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {/* Subject */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#aaa', width: 44, flexShrink: 0 }}>Subj</span>
              <span style={{ fontSize: 11, color: '#555' }}>{msg.subject}</span>
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: '14px 14px 16px' }}>
            <p style={{ margin: 0, fontSize: 13, color: '#333', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{msg.body}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── AI Summary strip ──────────────────────────────────────────────────────────

function AISummaryStrip({ lead, thread }: { lead: Lead; thread: EmailMsg[] }) {
  const [open, setOpen]       = useState(true)
  const [loading, setLoading] = useState(false)
  const summary = buildSummary(lead, thread)

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
          <div>
            {summary.split('\n').map((line, i) => {
              if (line.startsWith('**') && line.endsWith('**')) return <p key={i} style={{ margin: '6px 0 2px', fontWeight: 700, color: '#111', fontSize: 11 }}>{line.slice(2,-2)}</p>
              if (line.startsWith('**') && line.includes(':**')) {
                const ci = line.indexOf(':**')
                return <p key={i} style={{ margin: '5px 0 2px', fontSize: 12, color: '#333' }}><b>{line.slice(2,ci)}:</b>{line.slice(ci+3)}</p>
              }
              if (line.startsWith('• ')) return <p key={i} style={{ margin: '1px 0', fontSize: 12, color: '#666', paddingLeft: 10 }}>{line}</p>
              if (!line.trim()) return null
              return <p key={i} style={{ margin: '2px 0', fontSize: 12, color: '#555', lineHeight: 1.6 }}>{line}</p>
            })}
          </div>
          <button onClick={async () => { setLoading(true); await new Promise(r => setTimeout(r,800)); setLoading(false) }} disabled={loading} style={{ marginTop: 6, fontSize: 11, color: '#bbb', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            {loading ? 'Refreshing…' : '↺ Refresh analysis'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── AI Draft panel ────────────────────────────────────────────────────────────

function AIDraftPanel({ lead, thread }: { lead: Lead; thread: EmailMsg[] }) {
  const needsReply = thread.at(-1)?.direction === 'inbound'
  const initDraft  = needsReply ? buildAIDraft(lead, thread) : null

  const [draft,   setDraft]   = useState<string | null>(initDraft)
  const [content, setContent] = useState(initDraft || '')
  const [loading, setLoading] = useState<'send' | 'reject' | 'regen' | null>(null)
  const [sent,    setSent]    = useState(false)

  const lastInbound = [...thread].reverse().find(m => m.direction === 'inbound')

  async function handleSend() {
    setLoading('send'); await new Promise(r => setTimeout(r, 800))
    setSent(true); setDraft(null); setLoading(null)
  }
  async function handleReject() {
    setLoading('reject'); await new Promise(r => setTimeout(r, 400))
    setDraft(null); setLoading(null)
  }
  async function handleRegen() {
    setLoading('regen'); await new Promise(r => setTimeout(r, 1000))
    const nd = buildAIDraft(lead, thread); setDraft(nd); setContent(nd); setLoading(null)
  }

  if (sent) return (
    <div style={{ borderTop: '1px solid #e8e8e8', background: '#f9fafb', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
      <span style={{ fontSize: 12, color: '#15803d' }}>✓ Reply sent</span>
      <button onClick={() => { const nd = buildAIDraft(lead, thread); setDraft(nd); setContent(nd); setSent(false) }} style={{ fontSize: 11, color: '#aaa', background: 'none', border: 'none', cursor: 'pointer' }}>New draft</button>
    </div>
  )

  if (!draft) return (
    <div style={{ borderTop: '1px solid #e8e8e8', background: '#f9fafb', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
      <span style={{ fontSize: 12, color: needsReply ? '#b45309' : '#aaa', fontStyle: needsReply ? 'normal' : 'italic', fontWeight: needsReply ? 500 : 400 }}>
        {needsReply ? '⚡ Client replied — generate a response' : 'No pending draft'}
      </span>
      <button onClick={handleRegen} disabled={!!loading} style={{ fontSize: 11, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
        {loading === 'regen' ? 'Generating…' : 'Generate AI reply'}
      </button>
    </div>
  )

  return (
    <div style={{ borderTop: '1px solid #e8e8e8', background: '#f9fafb', flexShrink: 0 }}>
      <div style={{ padding: '8px 16px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#3b82f6' }}>AI Draft</span>
          {lastInbound && (
            <span style={{ fontSize: 11, color: '#bbb' }}>
              — replying to {lastInbound.from} · {timeAgo(lastInbound.time)}
            </span>
          )}
        </div>
        <button onClick={handleRegen} disabled={!!loading} style={{ fontSize: 11, color: '#aaa', background: 'none', border: 'none', cursor: 'pointer' }}>
          {loading === 'regen' ? 'Regenerating…' : '↺ Regenerate'}
        </button>
      </div>

      {/* Reply-to context */}
      {lastInbound && (
        <div style={{ margin: '0 16px 6px', padding: '8px 10px', background: '#f0f0f0', borderRadius: 7, borderLeft: '3px solid #ddd' }}>
          <p style={{ margin: 0, fontSize: 11, color: '#888', lineHeight: 1.5 }}>
            {lastInbound.body.split('\n').find(l => l.trim())?.slice(0, 120)}…
          </p>
        </div>
      )}

      <div style={{ padding: '0 16px 8px' }}>
        <textarea value={content} onChange={e => setContent(e.target.value)} rows={5}
          style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, color: '#333', lineHeight: 1.65, border: '1px solid #e8e8e8', borderRadius: 8, padding: '10px 12px', resize: 'none', background: '#fff', outline: 'none', fontFamily: 'inherit' }}
        />
      </div>
      <div style={{ padding: '0 16px 12px', display: 'flex', gap: 8 }}>
        <button onClick={handleReject} disabled={!!loading} style={{ padding: '7px 16px', fontSize: 12, fontWeight: 500, border: '1px solid #e8e8e8', borderRadius: 8, background: '#fff', color: '#666', cursor: 'pointer', opacity: loading ? 0.5 : 1 }}>
          {loading === 'reject' ? 'Rejecting…' : 'Reject'}
        </button>
        <button onClick={handleSend} disabled={!!loading || !content.trim()} style={{ flex: 1, padding: '7px 16px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 8, background: '#111', color: '#fff', cursor: 'pointer', opacity: (loading || !content.trim()) ? 0.5 : 1 }}>
          {loading === 'send' ? 'Sending…' : 'Approve & Send Reply'}
        </button>
      </div>
    </div>
  )
}

// ── Contact panel ─────────────────────────────────────────────────────────────

function ContactPanel({ lead, thread, onStatus }: { lead: Lead; thread: EmailMsg[]; onStatus: (id: string, s: string) => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [copied,   setCopied]   = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const deptColor = DEPT_COLOR[lead.department ?? ''] ?? '#9ca3af'
  const st = STATUS_MAP[lead.status] ?? STATUS_MAP.contacted

  function copy(text: string, k: string) { navigator.clipboard.writeText(text); setCopied(k); setTimeout(() => setCopied(null), 1500) }

  useEffect(() => {
    if (!menuOpen) return
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [menuOpen])

  // Collect all unique CC addresses across the thread
  const allCcs = Array.from(new Set(thread.flatMap(m => m.cc))).filter(Boolean)
  const allParticipants = Array.from(new Set(thread.flatMap(m => [...m.to, m.from]))).filter(a => a !== 'hello@trade-risksol.com' && a !== lead.email)

  const lastInbound = [...thread].reverse().find(m => m.direction === 'inbound')
  const lastOutbound = [...thread].reverse().find(m => m.direction === 'outbound')
  const needsReply  = thread.at(-1)?.direction === 'inbound'

  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#bbb', margin: '0 0 4px' }
  const val: React.CSSProperties = { fontSize: 12, color: '#333', margin: 0, wordBreak: 'break-all' }

  return (
    <div style={{ width: 248, flexShrink: 0, borderLeft: '1px solid #e8e8e8', background: '#fff', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

      {/* Conversation status */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', background: needsReply ? '#fffbeb' : '#fff' }}>
        {needsReply ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: '#b45309' }}>Awaiting your reply</span>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: '#15803d' }}>We replied last</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <div><p style={lbl}>Emails</p><p style={{ ...val, fontSize: 14, fontWeight: 700 }}>{thread.length}</p></div>
          <div><p style={lbl}>Days open</p><p style={{ ...val, fontSize: 14, fontWeight: 700 }}>{daysSince(lead.created_at)}</p></div>
          {lastInbound && <div><p style={lbl}>Last reply</p><p style={{ ...val, fontSize: 11 }}>{timeAgo(lastInbound.time)}</p></div>}
        </div>
      </div>

      {/* Status */}
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

      {/* Contact details */}
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

      {/* CC & participants */}
      {(allCcs.length > 0 || allParticipants.length > 0) && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
          <p style={lbl}>CC & Participants</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {allCcs.map(addr => (
              <div key={addr} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(59,130,246,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#1d4ed8', flexShrink: 0 }}>
                  {addr[0].toUpperCase()}
                </span>
                <span style={{ fontSize: 11, color: '#555', wordBreak: 'break-all', flex: 1 }}>{addr}</span>
                <span style={{ fontSize: 9, color: '#bbb', background: '#f4f4f5', padding: '1px 5px', borderRadius: 4, flexShrink: 0 }}>CC</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lead info */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
        <p style={lbl}>Lead Info</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {lead.department && (
            <div><p style={lbl}>Department</p>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '2px 7px', borderRadius: 5, background: `${deptColor}18`, color: deptColor }}>{lead.department}</span>
            </div>
          )}
          {lead.topic && <div><p style={lbl}>Topic</p><p style={val}>{lead.topic}</p></div>}
          {lead.contact_type && <div><p style={lbl}>Type</p><p style={val}>{lead.contact_type}</p></div>}
          <div><p style={lbl}>Lead since</p><p style={val}>{new Date(lead.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}</p></div>
        </div>
      </div>

      {/* Notes */}
      <div style={{ padding: '12px 16px', flex: 1 }}>
        <p style={lbl}>Internal Notes</p>
        <textarea placeholder="Add notes…" rows={4} style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, color: '#333', lineHeight: 1.6, border: '1px solid #e8e8e8', borderRadius: 8, padding: '8px 10px', resize: 'none', background: '#fafafa', outline: 'none', fontFamily: 'inherit' }} />
      </div>
    </div>
  )
}

// ── Thread view ───────────────────────────────────────────────────────────────

function ThreadView({ lead, onStatus }: { lead: Lead; onStatus: (id: string, s: string) => void }) {
  const thread    = useMemo(() => buildThread(lead), [lead.id])
  const deptColor = DEPT_COLOR[lead.department ?? ''] ?? '#9ca3af'
  const st        = STATUS_MAP[lead.status] ?? STATUS_MAP.contacted
  const needsReply = thread.at(-1)?.direction === 'inbound'

  return (
    <div style={{ flex: 1, display: 'flex', minWidth: 0, overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

        {/* Thread header */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e8e8e8', background: '#fff', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {lead.department && (
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '2px 6px', borderRadius: 5, background: `${deptColor}18`, color: deptColor }}>
                    {lead.department}
                  </span>
                )}
                <span style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>{fullName(lead)}</span>
                {lead.company && <span style={{ fontSize: 12, color: '#aaa' }}>· {lead.company}</span>}
                {needsReply && (
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'rgba(245,158,11,0.10)', color: '#b45309' }}>
                    ⚡ Needs reply
                  </span>
                )}
              </div>
              {lead.topic && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#888' }}>Enquiry — {lead.topic}</p>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: st.bg, color: st.color }}>{st.label}</span>
              <span style={{ fontSize: 11, color: '#bbb' }}>{thread.length} email{thread.length !== 1 ? 's' : ''}</span>
              <span style={{ fontSize: 11, color: '#bbb' }}>· {daysSince(lead.created_at)}d open</span>
            </div>
          </div>
        </div>

        {/* AI Analysis */}
        <AISummaryStrip lead={lead} thread={thread} />

        {/* Email thread */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {thread.map((msg, i) => <EmailCard key={msg.id} msg={msg} defaultOpen={i === thread.length - 1} />)}
        </div>

        {/* AI Draft */}
        <AIDraftPanel lead={lead} thread={thread} />
      </div>

      <ContactPanel lead={lead} thread={thread} onStatus={onStatus} />
    </div>
  )
}

// ── Lead list item ─────────────────────────────────────────────────────────────

function LeadListItem({ lead, isActive, thread, onClick }: { lead: Lead; isActive: boolean; thread: EmailMsg[]; onClick: () => void }) {
  const deptColor  = DEPT_COLOR[lead.department ?? ''] ?? '#9ca3af'
  const st         = STATUS_MAP[lead.status] ?? STATUS_MAP.contacted
  const needsReply = thread.at(-1)?.direction === 'inbound'
  const lastMsg    = thread.at(-1)
  const body       = firstMsg(lead)

  return (
    <button onClick={onClick} style={{
      width: '100%', textAlign: 'left', padding: '11px 14px',
      borderBottom: '1px solid #f0f0f0',
      borderLeft: `3px solid ${isActive ? deptColor : 'transparent'}`,
      background: isActive ? '#f7f7f7' : '#fff',
      border: 'none', cursor: 'pointer', display: 'block',
      borderLeftWidth: 3, borderLeftStyle: 'solid', borderLeftColor: isActive ? deptColor : 'transparent',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginBottom: 3 }}>
            {lead.department && (
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '1px 5px', borderRadius: 4, background: `${deptColor}18`, color: deptColor }}>
                {lead.department === 'Customer Support' ? 'Support' : lead.department}
              </span>
            )}
            <span style={{ fontSize: 12, fontWeight: 600, color: '#111' }}>{fullName(lead)}</span>
            {lead.company && <span style={{ fontSize: 11, color: '#aaa' }}>· {lead.company}</span>}
          </div>
          {lead.topic && <p style={{ margin: '0 0 2px', fontSize: 11, color: '#777' }}>— {lead.topic}</p>}
          <p style={{ margin: 0, fontSize: 11, color: '#bbb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {lastMsg ? `${lastMsg.direction === 'outbound' ? 'You: ' : ''}${lastMsg.body.split('\n').find(l => l.trim()) || ''}` : body}
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: '#bbb' }}>{lastMsg ? timeAgo(lastMsg.time) : timeAgo(lead.created_at)}</span>
          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: st.bg, color: st.color }}>{st.label}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 10, color: '#bbb' }}>{thread.length} emails</span>
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
  const sortRef = useRef<HTMLDivElement>(null)

  // Build threads (memoised per-lead)
  const threads = useMemo<Record<string, EmailMsg[]>>(() => {
    const map: Record<string, EmailMsg[]> = {}
    leads.forEach(l => { map[l.id] = buildThread(l) })
    return map
  }, [leads])

  const load = useCallback(async (spinner = false) => {
    if (spinner) setRefreshing(true)
    try {
      const data = await fetchLeads()
      setLeads(data)
      setSelectedId(prev => prev ?? (data[0]?.id ?? null))
    } finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => { load(); const t = setInterval(() => load(), 30000); return () => clearInterval(t) }, [load])

  useEffect(() => {
    if (!sortOpen) return
    const h = (e: MouseEvent) => { if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [sortOpen])

  function handleStatus(id: string, status: string) {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l))
    patchStatus(id, status)
  }

  function clearFilters() { setSearch(''); setDateFrom(''); setDateTo('') }

  const hasFilters = search || dateFrom || dateTo

  // Filter + sort
  const visible = useMemo(() => {
    let list = leads.filter(l =>
      matchesSearch(l, search) && inDateRange(l.created_at, dateFrom, dateTo)
    )
    if (sortKey === 'newest')        list = [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    else if (sortKey === 'oldest')   list = [...list].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    else {
      // last_activity = last email in thread
      list = [...list].sort((a, b) => {
        const ta = threads[a.id]?.at(-1)?.time ?? a.created_at
        const tb = threads[b.id]?.at(-1)?.time ?? b.created_at
        return new Date(tb).getTime() - new Date(ta).getTime()
      })
    }
    return list
  }, [leads, search, dateFrom, dateTo, sortKey, threads])

  const selectedLead   = leads.find(l => l.id === selectedId) ?? null
  const needsReplyCount = leads.filter(l => threads[l.id]?.at(-1)?.direction === 'inbound').length

  const SORT_LABELS: Record<SortKey, string> = {
    last_activity: 'Last activity',
    newest:        'Newest lead',
    oldest:        'Oldest lead',
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

      {/* ── Left panel — lead list ── */}
      <div style={{ width: 320, flexShrink: 0, borderRight: '1px solid #e8e8e8', background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
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
            <button onClick={() => load(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', display: 'flex' }}>
              <RefreshCw size={13} strokeWidth={2} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
            </button>
          </div>

          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f4f4f5', borderRadius: 8, padding: '0 10px', height: 34, marginBottom: 8 }}>
            <Search size={13} style={{ color: '#aaa', flexShrink: 0 }} strokeWidth={2} />
            <input
              type="text"
              placeholder="Search name, email, company, topic…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 12, color: '#333', fontFamily: 'inherit' }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                <X size={12} style={{ color: '#aaa' }} />
              </button>
            )}
          </div>

          {/* Sort + Date filter row */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {/* Sort dropdown */}
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

            {/* Date range */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
              <Calendar size={11} style={{ color: '#bbb', flexShrink: 0 }} />
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                style={{ flex: 1, fontSize: 10, border: '1px solid #e8e8e8', borderRadius: 6, padding: '4px 5px', color: '#555', background: '#fff', outline: 'none', fontFamily: 'inherit', minWidth: 0 }} />
              <span style={{ fontSize: 10, color: '#bbb' }}>–</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                style={{ flex: 1, fontSize: 10, border: '1px solid #e8e8e8', borderRadius: 6, padding: '4px 5px', color: '#555', background: '#fff', outline: 'none', fontFamily: 'inherit', minWidth: 0 }} />
            </div>
          </div>

          {/* Active filter chips */}
          {hasFilters && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {search && (
                <span style={{ fontSize: 10, background: 'rgba(59,130,246,0.08)', color: '#1d4ed8', padding: '2px 8px', borderRadius: 12, border: '1px solid rgba(59,130,246,0.15)' }}>
                  "{search}"
                </span>
              )}
              {(dateFrom || dateTo) && (
                <span style={{ fontSize: 10, background: 'rgba(59,130,246,0.08)', color: '#1d4ed8', padding: '2px 8px', borderRadius: 12, border: '1px solid rgba(59,130,246,0.15)' }}>
                  {dateFrom || '…'} → {dateTo || '…'}
                </span>
              )}
              <button onClick={clearFilters} style={{ fontSize: 10, color: '#aaa', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Clear all</button>
            </div>
          )}
        </div>

        {/* Results count */}
        <div style={{ padding: '6px 14px', borderBottom: '1px solid #f0f0f0', flexShrink: 0, background: '#fafafa' }}>
          <span style={{ fontSize: 11, color: '#aaa' }}>
            {loading ? 'Loading…' : `${visible.length} conversation${visible.length !== 1 ? 's' : ''}${hasFilters ? ' matching' : ''}`}
          </span>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 12, color: '#bbb' }}>Loading…</div>
          ) : visible.length === 0 ? (
            <div style={{ padding: '48px 16px', textAlign: 'center' }}>
              <p style={{ fontSize: 12, color: '#bbb', marginBottom: 8 }}>
                {hasFilters ? 'No conversations match your search.' : 'No engaged conversations yet.'}
              </p>
              {hasFilters && (
                <button onClick={clearFilters} style={{ fontSize: 11, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer' }}>Clear filters</button>
              )}
            </div>
          ) : (
            visible.map(lead => (
              <LeadListItem
                key={lead.id}
                lead={lead}
                isActive={lead.id === selectedId}
                thread={threads[lead.id] || []}
                onClick={() => setSelectedId(lead.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Right: thread detail ── */}
      {selectedLead ? (
        <ThreadView lead={selectedLead} onStatus={handleStatus} />
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#bbb', gap: 8 }}>
          <span style={{ fontSize: 32 }}>💬</span>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#888' }}>Select a conversation</p>
          <p style={{ margin: 0, fontSize: 12, color: '#bbb' }}>
            {loading ? 'Loading…' : leads.length === 0 ? 'No engaged leads yet. Contacts move here after first reply.' : 'Choose from the list on the left.'}
          </p>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
