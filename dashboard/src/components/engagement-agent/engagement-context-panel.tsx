'use client'

// Engagement context panel: reply state and counts, the parties in a multi-thread
// conversation, lead status, transfer to existing client, contact, enquiry, notes and draft
// history. Rendered inside the context rail (ContextRail.tsx) as one outlined card. Every
// fetch and handler is unchanged; the presentation sits on the inbox tokens: ink, body, muted,
// faint, hairline, grey field. No state colour.

import { useState, useEffect, useRef } from 'react'
import { Copy, Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuditLog } from '@/hooks/useAuditLog'
import type { Lead, RealMsg, DraftHistoryItem } from '@/components/engagement/types'
import { STATUS_MAP, ALL_STATUSES, EMAIL_SOURCES } from '@/components/engagement/types'
import { fullName, timeAgo, daysSince } from '@/components/engagement/helpers'

const INK = '#202124'
const BODY = '#3c4043'
const MUTED = '#5f6368'
const FAINT = '#80868b'
const HAIR = '#e8eaed'
const FIELD = '#f1f3f4'
const LINK = 'bg-transparent border-0 p-0 cursor-pointer underline underline-offset-[3px] decoration-[#9aa0a6] hover:decoration-[#202124]'
const INPUT = 'w-full h-9 rounded-[8px] bg-white px-3 text-[13px] outline-none focus:border-[#202124]'

interface EngagementContextPanelProps {
  lead:                 Lead
  messages:             RealMsg[]
  threadId:             string | null
  conversationThreadId?: string | null           // anchor for the party switcher (page-loaded thread)
  activeThreadId?:      string | null             // currently displayed thread (for highlight)
  onSelectThread?:      (threadId: string) => void
  onStatus:             (id: string, s: string) => void
  onTransfer:           (id: string, note: string) => Promise<void>
  onRestoreDraft:       (body: string, generatedBy: string) => void
  onCollapse?:          () => void
}

export function EngagementContextPanel({
  lead, messages, threadId,
  conversationThreadId, activeThreadId, onSelectThread,
  onStatus, onTransfer, onRestoreDraft, onCollapse,
}: EngagementContextPanelProps) {
  const needsReply  = messages.at(-1)?.direction === 'inbound'
  const lastInbound = [...messages].reverse().find(m => m.direction === 'inbound')

  return (
    <aside
      aria-label="Thread context"
      className="flex-shrink-0 bg-white flex flex-col min-h-0 overflow-y-auto"
      style={{ width: 'var(--ea-context-w, 244px)', color: INK }}
    >
      {onCollapse && (
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-2" style={{ borderBottom: `1px solid ${HAIR}` }}>
          <span className="text-[12px]" style={{ color: MUTED }}>Details</span>
          <button type="button" onClick={onCollapse} title="Collapse panel" aria-label="Collapse panel" className={cn(LINK, 'text-[12.5px]')} style={{ color: INK }}>Collapse</button>
        </div>
      )}

      {/* Reply state + counts */}
      <div className="flex-shrink-0 px-4 py-3" style={{ borderBottom: `1px solid ${HAIR}` }}>
        <p className="m-0 text-[13px]" style={{ color: BODY }}>
          {needsReply ? 'Awaiting your reply' : messages.length > 0 ? 'Awaiting client reply' : 'No emails yet'}
        </p>
        {messages.length > 0 && (
          <dl className="m-0 mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12.5px]">
            <dt style={{ color: MUTED }}>Emails</dt><dd className="m-0 tabular-nums" style={{ color: INK }}>{messages.length}</dd>
            <dt style={{ color: MUTED }}>Days open</dt><dd className="m-0 tabular-nums" style={{ color: INK }}>{daysSince(lead.created_at)}</dd>
            {lastInbound?.sent_at && <><dt style={{ color: MUTED }}>Last reply</dt><dd className="m-0" style={{ color: INK }}>{timeAgo(lastInbound.sent_at)}</dd></>}
          </dl>
        )}
      </div>

      <ConversationsSection
        anchorThreadId={conversationThreadId ?? null}
        activeThreadId={activeThreadId ?? threadId}
        onSelect={onSelectThread}
      />

      <StatusSection lead={lead} onStatus={onStatus} />
      <TransferSection lead={lead} onTransfer={onTransfer} />
      <ContactSection lead={lead} />
      <EnquirySection lead={lead} />
      <NotesSection lead={lead} />
      {threadId && <DraftHistorySection threadId={threadId} onRestore={onRestoreDraft} />}
    </aside>
  )
}

// ── Conversation party switcher ───────────────────────────────────────────────
// A claim/enquiry can span several threads (client, employee, insurer…). Lists every
// party in the conversation and lets the handler switch which one they're viewing/replying
// to. Hidden unless the conversation spans more than one thread. Nudges toward Nexus once
// it gets busy (suggest_nexus, 3+ parties).

type ConvParty  = { contact_id: string | null; email: string | null; name: string; company: string | null }
type ConvThread = {
  id: string; is_root: boolean; subject: string; party: ConvParty
  message_count: number; last_direction: string | null; last_message_at: string | null; snippet: string | null
}
type ConvResp   = { root_thread_id: string; suggest_nexus: boolean; threads: ConvThread[] }

function ConversationsSection({
  anchorThreadId, activeThreadId, onSelect,
}: {
  anchorThreadId: string | null
  activeThreadId: string | null
  onSelect?: (threadId: string) => void
}) {
  const [data, setData] = useState<ConvResp | null>(null)
  const [promoting, setPromoting] = useState(false)

  useEffect(() => {
    if (!anchorThreadId) { setData(null); return }
    let cancelled = false
    setPromoting(false)
    fetch(`/api/engagement/conversation?thread_id=${encodeURIComponent(anchorThreadId)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) setData(d && Array.isArray(d.threads) ? d : null) })
      .catch(() => { if (!cancelled) setData(null) })
    return () => { cancelled = true }
  }, [anchorThreadId])

  async function promoteToNexus() {
    if (!anchorThreadId || promoting) return
    setPromoting(true)
    try {
      const res = await fetch('/api/engagement/conversation/promote', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: anchorThreadId }),
      })
      const d = res.ok ? await res.json() : null
      if (d?.case_id) { window.location.href = `/nexus?case=${d.case_id}` }
      else setPromoting(false)
    } catch { setPromoting(false) }
  }

  const threads = data?.threads ?? []
  if (!anchorThreadId || threads.length <= 1) return null

  return (
    <AccordionSection title={`Conversations · ${threads.length}`} defaultOpen>
      <ul className="m-0 px-4 pb-3 p-0 list-none flex flex-col gap-1.5" role="list">
        {threads.map(t => {
          const active = t.id === activeThreadId
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onSelect?.(t.id)}
                aria-current={active ? 'true' : undefined}
                className="w-full text-left rounded-[10px] px-3 py-2 cursor-pointer hover:bg-[#f8f9fa]"
                style={{ border: `1px solid ${active ? INK : HAIR}`, background: active ? FIELD : '#fff' }}
              >
                <span className="flex items-center gap-1.5">
                  <span className="text-[13px] font-medium truncate" style={{ color: INK }}>{t.party.name}</span>
                  {t.is_root && <span className="text-[11.5px] font-medium rounded-[6px] px-1.5 py-px flex-shrink-0" style={{ background: FIELD, color: BODY }}>Client</span>}
                  <span className="ml-auto text-[12px] flex-shrink-0 tabular-nums" style={{ color: FAINT }}>{t.last_message_at ? timeAgo(t.last_message_at) : ''}</span>
                </span>
                {t.party.company && <span className="block text-[12.5px] truncate" style={{ color: MUTED }}>{t.party.company}</span>}
                <span className="block text-[12.5px] truncate" style={{ color: MUTED }}>
                  {t.message_count} message{t.message_count === 1 ? '' : 's'}{t.snippet ? ` · ${t.snippet}` : ''}
                </span>
              </button>
            </li>
          )
        })}
        {data?.suggest_nexus && (
          <li>
            <button type="button" onClick={promoteToNexus} disabled={promoting} className={cn(LINK, 'mt-1 text-[13px] disabled:opacity-60')} style={{ color: INK }}>
              {promoting ? 'Creating Nexus case…' : `${threads.length} parties · Promote to Nexus`}
            </button>
          </li>
        )}
      </ul>
    </AccordionSection>
  )
}

// ── Status picker ─────────────────────────────────────────────────────────────

function StatusSection({ lead, onStatus }: { lead: Lead; onStatus: (id: string, s: string) => void }) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const st = STATUS_MAP[lead.status] ?? STATUS_MAP.contacted

  useEffect(() => {
    if (!dropdownOpen) return
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setDropdownOpen(false)
    }
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setDropdownOpen(false) }
    document.addEventListener('mousedown', h)
    document.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k) }
  }, [dropdownOpen])

  return (
    <AccordionSection title="Status">
      <div className="px-4 pb-3">
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen(v => !v)}
            aria-haspopup="listbox"
            aria-expanded={dropdownOpen}
            className="w-full flex items-center justify-between px-3 h-9 rounded-[8px] text-[13px] cursor-pointer bg-white hover:bg-[#f8f9fa]"
            style={{ border: '1px solid #dadce0', color: INK }}
          >
            {st.label}
            <ChevronDown size={13} className={cn('transition-transform', dropdownOpen && 'rotate-180')} style={{ color: '#9aa0a6' }} />
          </button>
          {dropdownOpen && (
            <div role="listbox" aria-label="Lead status" className="absolute top-[calc(100%+4px)] left-0 right-0 bg-white rounded-[12px] z-50 p-1.5" style={{ border: `1px solid ${HAIR}`, boxShadow: '0 12px 32px rgba(32,33,36,0.12)' }}>
              {ALL_STATUSES.map(s => {
                const sc = STATUS_MAP[s]
                const on = lead.status === s
                return (
                  <button
                    key={s}
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => { onStatus(lead.id, s); setDropdownOpen(false) }}
                    className={cn('w-full text-left px-2.5 py-1.5 rounded-[8px] text-[13px] bg-transparent border-0 cursor-pointer hover:bg-[#f8f9fa]', on && 'font-medium')}
                    style={{ color: on ? INK : BODY, background: on ? FIELD : undefined }}
                  >
                    {sc.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </AccordionSection>
  )
}

// ── Transfer section ──────────────────────────────────────────────────────────

function TransferSection({
  lead, onTransfer,
}: { lead: Lead; onTransfer: (id: string, note: string) => Promise<void> }) {
  const [open,   setOpen]   = useState(false)
  const [note,   setNote]   = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { setOpen(false); setNote('') }, [lead.id])

  async function confirm() {
    if (saving) return
    setSaving(true)
    try { await onTransfer(lead.id, note.trim()); setOpen(false); setNote('') }
    finally { setSaving(false) }
  }

  if (lead.segment === 'existing_client') {
    return (
      <div className="px-4 py-2.5 text-[13px]" style={{ borderBottom: `1px solid ${HAIR}` }}>
        <span className="block" style={{ color: INK }}>Existing client</span>
        {lead.segment_note && <span className="block mt-0.5 text-[12.5px]" style={{ color: MUTED }}>{lead.segment_note}</span>}
      </div>
    )
  }

  if (!(EMAIL_SOURCES.has(lead.source) || !!lead.campaign_context)) return null

  return (
    <div className="px-4 py-2.5" style={{ borderBottom: `1px solid ${HAIR}` }}>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className={cn(LINK, 'text-[13px]')} style={{ color: INK }}>Move to existing client</button>
      ) : (
        <div className="flex flex-col gap-2">
          <label className="text-[12.5px]" style={{ color: MUTED }}>Reason for transfer
            <input
              autoFocus
              value={note}
              onChange={e => setNote(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') confirm()
                if (e.key === 'Escape') { setOpen(false); setNote('') }
              }}
              placeholder="Existing marine policy"
              className={cn(INPUT, 'mt-1')}
              style={{ border: '1px solid #dadce0', color: INK }}
            />
          </label>
          <div className="flex items-center gap-3">
            <button type="button" onClick={confirm} disabled={saving} className="h-9 px-3.5 rounded-[10px] text-[13px] font-medium text-white border-0 cursor-pointer hover:opacity-90 disabled:opacity-50" style={{ background: INK }}>
              {saving ? 'Moving…' : 'Confirm'}
            </button>
            <button type="button" onClick={() => { setOpen(false); setNote('') }} className="h-9 px-3 rounded-[10px] text-[13px] bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4]" style={{ color: INK }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Contact info ──────────────────────────────────────────────────────────────

function ContactSection({ lead }: { lead: Lead }) {
  const [copied, setCopied] = useState<string | null>(null)

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <AccordionSection title="Contact">
      <dl className="m-0 px-4 pb-3 flex flex-col gap-2">
        {(lead.first_name || lead.last_name) && <CtxField label="Name" value={fullName(lead)} />}

        {lead.email && (
          <div>
            <dt className="text-[12px]" style={{ color: MUTED }}>Email</dt>
            <dd className="m-0">
              <button type="button" onClick={() => copy(lead.email!, 'email')} title="Copy email" aria-label={copied === 'email' ? 'Copied' : 'Copy email'} className="flex items-start gap-1.5 text-left w-full bg-transparent border-0 p-0 cursor-pointer">
                <span className="text-[13px] break-all leading-snug" style={{ color: INK }}>{lead.email}</span>
                <span className="flex-shrink-0 mt-[2px]" style={{ color: '#9aa0a6' }}>{copied === 'email' ? <Check size={11} /> : <Copy size={11} />}</span>
              </button>
            </dd>
          </div>
        )}

        {lead.phone && (
          <div>
            <dt className="text-[12px]" style={{ color: MUTED }}>Phone</dt>
            <dd className="m-0">
              <button type="button" onClick={() => copy(lead.phone!, 'phone')} title="Copy phone" aria-label={copied === 'phone' ? 'Copied' : 'Copy phone'} className="flex items-center gap-1.5 text-left w-full bg-transparent border-0 p-0 cursor-pointer">
                <span className="text-[13px]" style={{ color: INK }}>{lead.phone}</span>
                <span className="flex-shrink-0" style={{ color: '#9aa0a6' }}>{copied === 'phone' ? <Check size={11} /> : <Copy size={11} />}</span>
              </button>
            </dd>
          </div>
        )}

        {lead.company && <CtxField label="Company" value={lead.company} />}
      </dl>
    </AccordionSection>
  )
}

// ── Lead / Enquiry info ───────────────────────────────────────────────────────

function EnquirySection({ lead }: { lead: Lead }) {
  return (
    <AccordionSection title="Enquiry">
      <dl className="m-0 px-4 pb-3 flex flex-col gap-2">
        {lead.department   && <CtxField label="Department" value={lead.department} />}
        {lead.topic        && <CtxField label="Topic"      value={lead.topic} />}
        {lead.contact_type && <CtxField label="Type"       value={lead.contact_type} />}
        <CtxField
          label="Lead since"
          value={new Date(lead.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}
        />
      </dl>
    </AccordionSection>
  )
}

// ── Notes ─────────────────────────────────────────────────────────────────────

function NotesSection({ lead }: { lead: Lead }) {
  const [text,   setText]   = useState(lead.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const log = useAuditLog()

  useEffect(() => { setText(lead.notes ?? ''); setSaved(false) }, [lead.id, lead.notes])

  const dirty = text !== (lead.notes ?? '')

  async function save() {
    if (!dirty) return
    setSaving(true)
    try {
      await fetch('/api/leads', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lead.id, notes: text }),
      })
      log({
        action: 'note.saved', resource_type: 'lead', resource_id: lead.id,
        lead_email: lead.email ?? undefined,
        old_value: { notes: lead.notes ?? null }, new_value: { notes: text },
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally { setSaving(false) }
  }

  return (
    <AccordionSection title="Notes">
      <div className="px-4 pb-3">
        <textarea
          value={text}
          onChange={e => { setText(e.target.value); setSaved(false) }}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save() } }}
          aria-label="Internal notes"
          placeholder="Internal notes. Saved when you leave the field."
          rows={4}
          className="w-full text-[13px] leading-[1.6] resize-y rounded-[8px] px-3 py-2 bg-white outline-none focus:border-[#202124] placeholder:text-[#9aa0a6]"
          style={{ border: '1px solid #dadce0', color: INK }}
        />
        <p className="m-0 mt-1 text-[12px] min-h-[16px]" style={{ color: MUTED }} aria-live="polite">
          {saved ? 'Saved' : saving ? 'Saving…' : dirty ? 'Not saved yet' : ''}
        </p>
      </div>
    </AccordionSection>
  )
}

// ── Draft history ─────────────────────────────────────────────────────────────

function DraftHistorySection({
  threadId, onRestore,
}: { threadId: string; onRestore: (body: string, generatedBy: string) => void }) {
  const [items,   setItems]   = useState<DraftHistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded,  setLoaded]  = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [open,    setOpen]    = useState(false)

  useEffect(() => { setItems([]); setLoaded(false); setPreview(null); setOpen(false) }, [threadId])

  function loadHistory() {
    if (loaded || loading) return
    setLoading(true)
    fetch(`/api/engagement/draft?thread_id=${encodeURIComponent(threadId)}&history=true`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then((rows: DraftHistoryItem[]) => setItems(Array.isArray(rows) ? rows : []))
      .catch(() => {})
      .finally(() => { setLoading(false); setLoaded(true) })
  }

  function toggle() {
    const next = !open
    setOpen(next)
    if (next) loadHistory()
  }

  const EMAIL_TYPE_LABELS: Record<string, string> = {
    gdrive: 'Drive', rag: 'Knowledge', manual: 'Manual',
  }

  return (
    <div style={{ borderBottom: `1px solid ${HAIR}` }}>
      <button type="button" onClick={toggle} aria-expanded={open} className="w-full flex items-center justify-between px-4 py-2.5 bg-transparent border-0 cursor-pointer hover:bg-[#f8f9fa] text-left">
        <span className="text-[13px] font-medium" style={{ color: INK }}>Draft history</span>
        <ChevronDown size={13} className={cn('transition-transform', open && 'rotate-180')} style={{ color: '#9aa0a6' }} />
      </button>

      {open && (
        <div className="pb-2.5">
          {loading && <p className="m-0 text-[12.5px] px-4 pb-2" style={{ color: MUTED }}>Loading…</p>}
          {loaded && items.length === 0 && <p className="m-0 text-[12.5px] px-4 pb-3" style={{ color: MUTED }}>No drafts yet.</p>}

          {items.map((item, idx) => {
            const vNum      = items.length - idx
            const isCurrent = idx === 0 && (item.status === 'pending' || item.status === 'approved')
            const isSent    = item.status === 'sent'
            const expanded  = preview === item.id
            const typeLabel = EMAIL_TYPE_LABELS[item.generated_by] ?? item.generated_by
            const snippet   = item.body.replace(/\s+/g, ' ').slice(0, 90)

            return (
              <div key={item.id} className="mx-3 mb-2 rounded-[10px] px-3 py-2.5" style={{ border: `1px solid ${HAIR}`, background: isCurrent ? '#fff' : '#f8f9fa' }}>
                <p className="m-0 mb-1 flex items-center gap-2 text-[12px]" style={{ color: MUTED }}>
                  <span style={{ color: INK }}>v{vNum}</span>
                  <span>{typeLabel}</span>
                  <span>{isCurrent ? 'Current' : isSent ? 'Sent' : 'Older'}</span>
                  <span className="ml-auto tabular-nums" style={{ color: FAINT }}>{timeAgo(item.created_at)}</span>
                </p>
                <p className="m-0 mb-2 text-[12.5px] leading-[1.5] line-clamp-2" style={{ color: BODY }}>{snippet}{item.body.length > 90 ? '…' : ''}</p>
                <p className="m-0 flex items-center gap-3 text-[12.5px]">
                  <button type="button" onClick={() => setPreview(expanded ? null : item.id)} aria-expanded={expanded} className={LINK} style={{ color: INK }}>{expanded ? 'Hide' : 'Preview'}</button>
                  <button type="button" onClick={() => onRestore(item.body, item.generated_by)} className={LINK} style={{ color: INK }}>{isCurrent ? 'Reload into composer' : 'Load into composer'}</button>
                </p>
                {expanded && (
                  <div className="mt-2 p-2.5 rounded-[8px] max-h-[180px] overflow-y-auto" style={{ background: FIELD }}>
                    <pre className="m-0 text-[12.5px] whitespace-pre-wrap leading-[1.6] font-[inherit]" style={{ color: BODY }}>{item.body}</pre>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Accordion section wrapper ─────────────────────────────────────────────────

function AccordionSection({
  title, children, defaultOpen = false,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ borderBottom: `1px solid ${HAIR}` }}>
      <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} className="w-full flex items-center justify-between px-4 py-2.5 bg-transparent border-0 cursor-pointer hover:bg-[#f8f9fa] text-left">
        <span className="text-[13px] font-medium" style={{ color: INK }}>{title}</span>
        <ChevronDown size={13} className={cn('transition-transform', open && 'rotate-180')} style={{ color: '#9aa0a6' }} />
      </button>
      {open && children}
    </div>
  )
}

// ── Shared atoms ──────────────────────────────────────────────────────────────

function CtxField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px]" style={{ color: MUTED }}>{label}</dt>
      <dd className="m-0 text-[13px] break-words leading-snug" style={{ color: INK }}>{value}</dd>
    </div>
  )
}
