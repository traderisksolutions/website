'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { RefreshCw, ChevronDown, Copy, Check } from 'lucide-react'

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
  to: string
  subject: string
  body: string
  time: string
  sent: boolean
}

// ── Constants ─────────────────────────────────────────────────────────────────

const EMAIL_SOURCES = new Set(['website_form', 'email', 'manual'])

const DEPT_COLOR: Record<string, string> = {
  'Sales':            '#3b82f6',
  'Customer Support': '#f59e0b',
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  new:       { label: 'New',       color: '#1d4ed8', bg: 'rgba(59,130,246,0.10)'  },
  contacted: { label: 'Contacted', color: '#b45309', bg: 'rgba(245,158,11,0.10)'  },
  qualified: { label: 'Qualified', color: '#15803d', bg: 'rgba(34,197,94,0.10)'   },
  converted: { label: 'Converted', color: '#7e22ce', bg: 'rgba(168,85,247,0.10)'  },
  dropped:   { label: 'Dropped',   color: '#4b5563', bg: 'rgba(107,114,128,0.10)' },
}
const ALL_STATUSES = ['new', 'contacted', 'qualified', 'converted', 'dropped']

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-SG', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fullName(l: Lead) {
  return [l.first_name, l.last_name].filter(Boolean).join(' ') || l.email || '—'
}

function firstMessage(l: Lead) {
  return l.details || l.message || ''
}

function buildThread(lead: Lead): EmailMsg[] {
  const body      = firstMessage(lead)
  const fromEmail = lead.email || 'unknown@email.com'
  const subject   = lead.topic ? `Enquiry — ${lead.topic}` : `${lead.department || 'General'} Enquiry`
  const msgs: EmailMsg[] = []

  if (body) {
    msgs.push({
      id: `${lead.id}-in`,
      direction: 'inbound',
      from: fromEmail,
      to: 'hello@trade-risksol.com',
      subject,
      body,
      time: lead.created_at,
      sent: true,
    })
  }

  if (lead.status !== 'new' && body) {
    msgs.push({
      id: `${lead.id}-out`,
      direction: 'outbound',
      from: 'hello@trade-risksol.com',
      to: fromEmail,
      subject: `Re: ${subject}`,
      body: buildAIReply(lead),
      time: new Date(new Date(lead.created_at).getTime() + 2 * 3600000).toISOString(),
      sent: true,
    })
  }

  return msgs
}

function buildAIReply(lead: Lead): string {
  const name  = lead.first_name || 'there'
  const topic = lead.topic || 'your enquiry'
  if (lead.department === 'Customer Support') {
    return `Hi ${name},\n\nThank you for reaching out. We've received your message regarding ${topic} and will look into this right away.\n\nCould you please provide any relevant policy number or account details so we can assist you more efficiently?\n\nBest regards,\nTrade Risk Solutions`
  }
  return `Hi ${name},\n\nThank you for your interest in ${topic}. We'd be happy to help you find the right coverage.\n\nTo prepare a tailored recommendation, could you share a bit more about your specific requirements — such as coverage amount, duration, and number of people involved?\n\nLooking forward to hearing from you.\n\nBest regards,\nTrade Risk Solutions`
}

function buildAIDraft(lead: Lead): string {
  const name  = lead.first_name || 'there'
  const topic = lead.topic || 'your enquiry'
  if (lead.department === 'Customer Support') {
    return `Hi ${name},\n\nThank you for reaching out about ${topic}. We understand this can be a time-sensitive matter.\n\nTo process your request, please share the following:\n1. Your policy number\n2. The specific details of the change required\n3. Any supporting documents if applicable\n\nWe aim to resolve all requests within 1 business day.\n\nBest regards,\nTrade Risk Solutions`
  }
  return `Hi ${name},\n\nThank you for reaching out about ${topic}. We'd love to help you find the right solution.\n\nBased on your enquiry, here's what I'd recommend we explore:\n• Coverage options tailored to your needs\n• Competitive pricing from our panel of insurers\n• A quick 15-minute consultation to finalise the details\n\nAre you available for a call this week? Alternatively, I can send over a detailed quote for your review.\n\nBest regards,\nTrade Risk Solutions`
}

function buildAISummary(lead: Lead): string {
  const topic  = lead.topic || 'general enquiry'
  const dept   = lead.department || 'General'
  const body   = firstMessage(lead)
  const st     = STATUS_MAP[lead.status]?.label || lead.status

  const lines = [
    `**Lead intent:** ${dept === 'Customer Support' ? 'Existing customer seeking support for' : 'Prospective client enquiring about'} ${topic}.`,
    '',
    '**Key details extracted:**',
    lead.company     ? `• Company: ${lead.company}`           : null,
    lead.contact_type ? `• Type: ${lead.contact_type}`        : null,
    lead.phone       ? `• Phone: ${lead.phone}`               : null,
    lead.email       ? `• Email: ${lead.email}`               : null,
    body ? `• Message: "${body.slice(0, 120)}${body.length > 120 ? '…' : ''}"` : null,
    '',
    `**Current status:** ${st}`,
    '',
    `**Recommended next step:** ${
      lead.status === 'new'
        ? `Respond promptly — fresh lead. Personalise your reply to their specific enquiry about ${topic}.`
        : lead.status === 'contacted'
        ? 'Follow up if no reply within 24 hours. Move to Qualified once intent is confirmed.'
        : lead.status === 'qualified'
        ? 'Prepare a tailored proposal or quotation and send it across.'
        : 'No further action required.'
    }`,
  ]

  return lines.filter(l => l !== null).join('\n')
}

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchLeads(): Promise<Lead[]> {
  const res = await fetch('/api/leads', { cache: 'no-store' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  const all: Lead[] = await res.json()
  return all.filter(l => EMAIL_SOURCES.has(l.source))
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
  const isOut = msg.direction === 'outbound'

  return (
    <div style={{
      border: '1px solid #e8e8e8', borderRadius: 10, overflow: 'hidden', background: '#fff',
      marginLeft: isOut ? 40 : 0, marginRight: isOut ? 0 : 40,
    }}>
      <div
        style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setOpen(v => !v)}
      >
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700,
          background: isOut ? 'rgba(59,130,246,0.10)' : '#f4f4f5',
          color: isOut ? '#1d4ed8' : '#666',
        }}>
          {isOut ? 'AI' : (msg.from[0] || '?').toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#111' }}>
              {isOut ? 'AI Agent' : msg.from}
            </span>
            {isOut && (
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 10,
                background: 'rgba(34,197,94,0.10)', color: '#15803d',
              }}>Sent</span>
            )}
          </div>
          {!open && (
            <p style={{ margin: 0, fontSize: 11, color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {msg.body.split('\n').find(l => l.trim()) || ''}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: '#bbb' }}>{formatDateTime(msg.time)}</span>
          <span style={{ fontSize: 11, color: '#ccc' }}>{open ? '▲' : '▽'}</span>
        </div>
      </div>
      {open && (
        <div style={{ borderTop: '1px solid #f0f0f0', padding: '12px 14px' }}>
          <div style={{ display: 'flex', gap: 20, marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: '#aaa' }}><b>From:</b> {msg.from}</span>
            <span style={{ fontSize: 11, color: '#aaa' }}><b>To:</b> {msg.to}</span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: '#333', whiteSpace: 'pre-wrap', lineHeight: 1.65 }}>{msg.body}</p>
        </div>
      )}
    </div>
  )
}

// ── AI Analysis strip ────────────────────────────────────────────────────────

function AISummaryStrip({ lead }: { lead: Lead }) {
  const [open, setOpen]       = useState(true)
  const [loading, setLoading] = useState(false)
  const summary = buildAISummary(lead)

  async function regen() {
    setLoading(true)
    await new Promise(r => setTimeout(r, 900))
    setLoading(false)
  }

  return (
    <div style={{ borderBottom: '1px solid #e8e8e8', flexShrink: 0, background: '#fafafa' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#3b82f6' }}>
            AI Analysis
          </span>
          <span style={{ fontSize: 11, color: '#bbb' }}>· auto-generated</span>
        </div>
        <span style={{ fontSize: 11, color: '#bbb' }}>{open ? '▲' : '▽'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 16px 12px' }}>
          <div style={{ fontSize: 12, color: '#444', lineHeight: 1.7 }}>
            {summary.split('\n').map((line, i) => {
              if (line.startsWith('**') && line.endsWith('**')) {
                return <p key={i} style={{ margin: '8px 0 2px', fontWeight: 700, color: '#111', fontSize: 11 }}>{line.slice(2, -2)}</p>
              }
              if (line.startsWith('**') && line.includes(':**')) {
                const ci = line.indexOf(':**')
                return <p key={i} style={{ margin: '6px 0 2px', fontSize: 12, color: '#333' }}><b>{line.slice(2, ci)}:</b>{line.slice(ci + 3)}</p>
              }
              if (line.startsWith('• ')) {
                return <p key={i} style={{ margin: '1px 0', fontSize: 12, color: '#666', paddingLeft: 12 }}>{line}</p>
              }
              if (!line.trim()) return null
              return <p key={i} style={{ margin: '2px 0', fontSize: 12, color: '#555' }}>{line}</p>
            })}
          </div>
          <button
            onClick={regen} disabled={loading}
            style={{ marginTop: 6, fontSize: 11, color: '#bbb', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            {loading ? 'Refreshing…' : '↺ Refresh analysis'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── AI Draft panel ────────────────────────────────────────────────────────────

function AIDraftPanel({ lead }: { lead: Lead }) {
  const initDraft = firstMessage(lead) ? buildAIDraft(lead) : null
  const [draft,   setDraft]   = useState<string | null>(initDraft)
  const [content, setContent] = useState(initDraft || '')
  const [loading, setLoading] = useState<'send' | 'reject' | 'regen' | null>(null)
  const [sent,    setSent]    = useState(false)

  async function handleSend() {
    setLoading('send')
    await new Promise(r => setTimeout(r, 800))
    setSent(true); setDraft(null); setLoading(null)
  }
  async function handleReject() {
    setLoading('reject')
    await new Promise(r => setTimeout(r, 400))
    setDraft(null); setLoading(null)
  }
  async function handleRegen() {
    setLoading('regen')
    await new Promise(r => setTimeout(r, 1000))
    const nd = buildAIDraft(lead)
    setDraft(nd); setContent(nd); setLoading(null)
  }

  if (sent) return (
    <div style={{ borderTop: '1px solid #e8e8e8', background: '#f9fafb', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
      <span style={{ fontSize: 12, color: '#15803d' }}>✓ Reply sent</span>
      <button onClick={() => { const nd = buildAIDraft(lead); setDraft(nd); setContent(nd); setSent(false) }} style={{ fontSize: 11, color: '#aaa', background: 'none', border: 'none', cursor: 'pointer' }}>New draft</button>
    </div>
  )

  if (!draft) return (
    <div style={{ borderTop: '1px solid #e8e8e8', background: '#f9fafb', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
      <span style={{ fontSize: 12, color: '#aaa', fontStyle: 'italic' }}>No pending draft</span>
      <button onClick={handleRegen} disabled={!!loading} style={{ fontSize: 11, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer' }}>
        {loading === 'regen' ? 'Generating…' : 'Generate AI draft'}
      </button>
    </div>
  )

  return (
    <div style={{ borderTop: '1px solid #e8e8e8', background: '#f9fafb', flexShrink: 0 }}>
      <div style={{ padding: '8px 16px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#3b82f6' }}>AI Draft</span>
          <span style={{ fontSize: 11, color: '#bbb' }}>— review before sending</span>
        </div>
        <button onClick={handleRegen} disabled={!!loading} style={{ fontSize: 11, color: '#aaa', background: 'none', border: 'none', cursor: 'pointer' }}>
          {loading === 'regen' ? 'Regenerating…' : '↺ Regenerate'}
        </button>
      </div>
      <div style={{ padding: '0 16px 8px' }}>
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          rows={5}
          style={{
            width: '100%', boxSizing: 'border-box',
            fontSize: 12, color: '#333', lineHeight: 1.65,
            border: '1px solid #e8e8e8', borderRadius: 8,
            padding: '10px 12px', resize: 'none',
            background: '#fff', outline: 'none', fontFamily: 'inherit',
          }}
        />
      </div>
      <div style={{ padding: '0 16px 12px', display: 'flex', gap: 8 }}>
        <button onClick={handleReject} disabled={!!loading} style={{ padding: '7px 16px', fontSize: 12, fontWeight: 500, border: '1px solid #e8e8e8', borderRadius: 8, background: '#fff', color: '#666', cursor: 'pointer', opacity: loading ? 0.5 : 1 }}>
          {loading === 'reject' ? 'Rejecting…' : 'Reject'}
        </button>
        <button onClick={handleSend} disabled={!!loading || !content.trim()} style={{ flex: 1, padding: '7px 16px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 8, background: '#111', color: '#fff', cursor: 'pointer', opacity: (loading || !content.trim()) ? 0.5 : 1 }}>
          {loading === 'send' ? 'Sending…' : 'Approve & Send'}
        </button>
      </div>
    </div>
  )
}

// ── Contact panel ─────────────────────────────────────────────────────────────

function ContactPanel({ lead, onStatus }: { lead: Lead; onStatus: (id: string, s: string) => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [copied,   setCopied]   = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const deptColor = DEPT_COLOR[lead.department ?? ''] ?? '#9ca3af'
  const st = STATUS_MAP[lead.status] ?? STATUS_MAP.new

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key); setTimeout(() => setCopied(null), 1800)
  }

  useEffect(() => {
    if (!menuOpen) return
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [menuOpen])

  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#bbb', margin: '0 0 4px' }
  const val: React.CSSProperties = { fontSize: 12, color: '#333', margin: 0, wordBreak: 'break-all' }

  function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0' }}>
        <p style={{ ...lbl, marginBottom: 10 }}>{title}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
      </div>
    )
  }

  function Field({ label, value }: { label: string; value: string | null | undefined }) {
    if (!value) return null
    return (
      <div>
        <p style={lbl}>{label}</p>
        <p style={val}>{value}</p>
      </div>
    )
  }

  return (
    <div style={{ width: 240, flexShrink: 0, borderLeft: '1px solid #e8e8e8', background: '#fff', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

      {/* Status */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0' }}>
        <p style={lbl}>Status</p>
        <div style={{ position: 'relative' }} ref={menuRef}>
          <button
            onClick={() => setMenuOpen(v => !v)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 8, border: '1px solid #e8e8e8', background: st.bg, color: st.color, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
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

      {/* Contact */}
      <Section title="Contact">
        {(lead.first_name || lead.last_name) && <Field label="Name" value={fullName(lead)} />}
        {lead.email && (
          <div>
            <p style={lbl}>Email</p>
            <button onClick={() => copy(lead.email!, 'email')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#333', wordBreak: 'break-all', textAlign: 'left' }}>{lead.email}</span>
              {copied === 'email' ? <Check size={11} style={{ color: '#22c55e', flexShrink: 0 }} /> : <Copy size={10} style={{ color: '#ccc', flexShrink: 0 }} />}
            </button>
          </div>
        )}
        {lead.phone && (
          <div>
            <p style={lbl}>Phone</p>
            <button onClick={() => copy(lead.phone!, 'phone')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#333' }}>{lead.phone}</span>
              {copied === 'phone' ? <Check size={11} style={{ color: '#22c55e', flexShrink: 0 }} /> : <Copy size={10} style={{ color: '#ccc', flexShrink: 0 }} />}
            </button>
          </div>
        )}
        <Field label="Company" value={lead.company} />
      </Section>

      {/* Lead info */}
      <Section title="Lead Info">
        {lead.department && (
          <div>
            <p style={lbl}>Department</p>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '2px 7px', borderRadius: 5, background: `${deptColor}18`, color: deptColor }}>
              {lead.department}
            </span>
          </div>
        )}
        <Field label="Product / Topic" value={lead.topic} />
        <Field label="Type" value={lead.contact_type} />
        <div><p style={lbl}>Source</p><p style={val}>{lead.source.replace(/_/g, ' ')}</p></div>
        <div><p style={lbl}>Lead since</p><p style={val}>{new Date(lead.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}</p></div>
      </Section>

      {/* Notes */}
      <div style={{ padding: '14px 16px', flex: 1 }}>
        <p style={lbl}>Internal Notes</p>
        <textarea placeholder="Add notes…" rows={5} style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, color: '#333', lineHeight: 1.6, border: '1px solid #e8e8e8', borderRadius: 8, padding: '8px 10px', resize: 'none', background: '#fafafa', outline: 'none', fontFamily: 'inherit' }} />
      </div>
    </div>
  )
}

// ── Lead list item ─────────────────────────────────────────────────────────────

function LeadListItem({ lead, isActive, onClick }: { lead: Lead; isActive: boolean; onClick: () => void }) {
  const deptColor = DEPT_COLOR[lead.department ?? ''] ?? '#9ca3af'
  const st        = STATUS_MAP[lead.status] ?? STATUS_MAP.new
  const body      = firstMessage(lead)

  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left',
        padding: '11px 16px',
        borderBottom: '1px solid #f0f0f0',
        borderLeft: `3px solid ${isActive ? deptColor : 'transparent'}`,
        background: isActive ? '#f7f7f7' : '#fff',
        border: 'none', cursor: 'pointer', display: 'block',
        borderLeftWidth: 3, borderLeftStyle: 'solid',
        borderLeftColor: isActive ? deptColor : 'transparent',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
            {lead.department && (
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '1px 5px', borderRadius: 4, background: `${deptColor}18`, color: deptColor }}>
                {lead.department === 'Customer Support' ? 'Support' : lead.department}
              </span>
            )}
            <span style={{ fontSize: 12, fontWeight: 600, color: '#111' }}>{fullName(lead)}</span>
            {lead.company && <span style={{ fontSize: 11, color: '#aaa' }}>· {lead.company}</span>}
          </div>
          {lead.topic && <p style={{ margin: '0 0 2px', fontSize: 11, color: '#777' }}>— {lead.topic}</p>}
          {body && <p style={{ margin: 0, fontSize: 11, color: '#bbb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{body}</p>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: '#bbb' }}>{timeAgo(lead.created_at)}</span>
          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: st.bg, color: st.color }}>{st.label}</span>
        </div>
      </div>
    </button>
  )
}

// ── Thread view ───────────────────────────────────────────────────────────────

function ThreadView({ lead, onStatus }: { lead: Lead; onStatus: (id: string, s: string) => void }) {
  const messages  = buildThread(lead)
  const deptColor = DEPT_COLOR[lead.department ?? ''] ?? '#9ca3af'
  const body      = firstMessage(lead)

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
              </div>
              {lead.topic && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#888' }}>Enquiry — {lead.topic}</p>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: (STATUS_MAP[lead.status] ?? STATUS_MAP.new).bg, color: (STATUS_MAP[lead.status] ?? STATUS_MAP.new).color }}>
                {(STATUS_MAP[lead.status] ?? STATUS_MAP.new).label}
              </span>
              <span style={{ fontSize: 11, color: '#bbb' }}>{messages.length} email{messages.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>

        {/* AI Analysis */}
        {body && <AISummaryStrip lead={lead} />}

        {/* Emails */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.length === 0
            ? <div style={{ textAlign: 'center', padding: '60px 0', fontSize: 13, color: '#bbb' }}>No messages yet.</div>
            : messages.map((msg, i) => <EmailCard key={msg.id} msg={msg} defaultOpen={i === messages.length - 1} />)
          }
        </div>

        {/* AI Draft */}
        <AIDraftPanel lead={lead} />
      </div>

      <ContactPanel lead={lead} onStatus={onStatus} />
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Filter = 'all' | 'new' | 'Sales' | 'Customer Support'

export default function EmailLeadsPage() {
  const [leads,      setLeads]      = useState<Lead[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [filter,     setFilter]     = useState<Filter>('all')
  const [refreshing, setRefreshing] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const load = useCallback(async (spinner = false) => {
    if (spinner) setRefreshing(true)
    try {
      const data = await fetchLeads()
      setLeads(data)
      setError(null)
      setSelectedId(prev => prev ?? (data[0]?.id ?? null))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(() => load(), 30000)
    return () => clearInterval(t)
  }, [load])

  function handleStatus(id: string, status: string) {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l))
    patchStatus(id, status)
  }

  const newCount = leads.filter(l => l.status === 'new').length

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all',              label: 'All'     },
    { key: 'new',              label: 'New'     },
    { key: 'Sales',            label: 'Sales'   },
    { key: 'Customer Support', label: 'Support' },
  ]

  const counts = {
    all:               leads.length,
    new:               newCount,
    Sales:             leads.filter(l => l.department === 'Sales').length,
    'Customer Support':leads.filter(l => l.department === 'Customer Support').length,
  }

  const filtered = leads.filter(l => {
    if (filter === 'new') return l.status === 'new'
    if (filter === 'Sales' || filter === 'Customer Support') return l.department === filter
    return true
  })

  const selectedLead = leads.find(l => l.id === selectedId) ?? null

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

      {/* Lead list */}
      <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid #e8e8e8', background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        <div style={{ height: 52, padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e8e8e8', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>Email Leads</span>
            {!loading && newCount > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: 'rgba(59,130,246,0.10)', color: '#1d4ed8' }}>
                {newCount} new
              </span>
            )}
          </div>
          <button onClick={() => load(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', display: 'flex', alignItems: 'center' }}>
            <RefreshCw size={13} strokeWidth={2} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
          </button>
        </div>

        <div style={{ padding: '8px 12px', display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
          {FILTERS.map(f => {
            const active = filter === f.key
            return (
              <button key={f.key} onClick={() => setFilter(f.key)} style={{ fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 7, background: active ? '#111' : '#fff', color: active ? '#fff' : '#666', border: active ? '1px solid #111' : '1px solid #e8e8e8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                {f.label}
                <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 4, background: active ? 'rgba(255,255,255,0.2)' : '#f4f4f5', color: active ? '#fff' : '#888' }}>
                  {counts[f.key as keyof typeof counts]}
                </span>
              </button>
            )
          })}
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading
            ? <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 12, color: '#bbb' }}>Loading…</div>
            : error
            ? <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: '#ef4444' }}>{error}</div>
            : filtered.length === 0
            ? <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 12, color: '#bbb' }}>No leads</div>
            : filtered.map(lead => (
              <LeadListItem key={lead.id} lead={lead} isActive={lead.id === selectedId} onClick={() => setSelectedId(lead.id)} />
            ))
          }
        </div>
      </div>

      {/* Detail */}
      {selectedLead
        ? <ThreadView lead={selectedLead} onStatus={handleStatus} />
        : <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#bbb' }}>Select a lead</div>
      }

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
