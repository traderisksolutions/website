'use client'

// Engagement context panel: reply state and counts, the parties in a multi-thread
// conversation, lead status, transfer to existing client, contact, enquiry, notes and draft
// history. Rendered inside the context rail (ContextRail.tsx) as one outlined card. Every
// fetch and handler is unchanged; the presentation sits on the inbox tokens: ink, body, muted,
// faint, hairline, grey field. No state colour.

import { useState, useEffect, useRef } from 'react'
import { Copy, Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Btn, Field, inputCls, textareaCls } from '@/components/crm/primitives'
import { useAuditLog } from '@/hooks/useAuditLog'
import type { Lead, RealMsg, DraftHistoryItem } from '@/components/engagement/types'
import { STATUS_MAP, ALL_STATUSES, EMAIL_SOURCES } from '@/components/engagement/types'
import { fullName, timeAgo, daysSince } from '@/components/engagement/helpers'

// A text link on the button ladder: tertiary Btn with the frame removed.
const LINK = 'h-auto bg-transparent border-0 p-0 font-normal text-trs-ink underline underline-offset-[3px] decoration-trs-subtle hover:bg-transparent hover:text-trs-ink hover:decoration-trs-ink'

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
      className="flex-shrink-0 bg-white flex flex-col min-h-0 overflow-y-auto w-[var(--ea-context-w,244px)] text-trs-ink"
    >
      {onCollapse && (
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-trs-line">
          <span className="text-small text-trs-muted">Details</span>
          <Btn level="tertiary" size="xs" onClick={onCollapse} title="Collapse panel" aria-label="Collapse panel" className={cn(LINK, 'text-small')}>Collapse</Btn>
        </div>
      )}

      {/* Reply state + counts */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-trs-line">
        <p className="m-0 text-body text-trs-ink-2">
          {needsReply ? 'Awaiting your reply' : messages.length > 0 ? 'Awaiting client reply' : 'No emails yet'}
        </p>
        {messages.length > 0 && (
          <dl className="m-0 mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-small">
            <dt className="text-trs-muted">Emails</dt><dd className="m-0 tabular-nums text-trs-ink">{messages.length}</dd>
            <dt className="text-trs-muted">Days open</dt><dd className="m-0 tabular-nums text-trs-ink">{daysSince(lead.created_at)}</dd>
            {lastInbound?.sent_at && <><dt className="text-trs-muted">Last reply</dt><dd className="m-0 text-trs-ink">{timeAgo(lastInbound.sent_at)}</dd></>}
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
      if (d?.case_id) { window.location.href = `/nexus/cases?case=${d.case_id}` }
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
              <Btn
                level="tertiary"
                size="xs"
                onClick={() => onSelect?.(t.id)}
                aria-current={active ? 'true' : undefined}
                className={cn('block w-full h-auto text-left whitespace-normal font-normal rounded px-3 py-2 border hover:bg-trs-tint', active ? 'border-trs-ink bg-trs-field' : 'border-trs-line bg-white')}
              >
                <span className="flex items-center gap-1.5">
                  <span className="text-body font-medium truncate text-trs-ink">{t.party.name}</span>
                  {t.is_root && <span className="text-small font-medium rounded px-1.5 py-px flex-shrink-0 bg-trs-field text-trs-ink-2">Client</span>}
                  <span className="ml-auto text-small flex-shrink-0 tabular-nums text-trs-subtle">{t.last_message_at ? timeAgo(t.last_message_at) : ''}</span>
                </span>
                {t.party.company && <span className="block text-small truncate text-trs-muted">{t.party.company}</span>}
                <span className="block text-small truncate text-trs-muted">
                  {t.message_count} message{t.message_count === 1 ? '' : 's'}{t.snippet ? ` · ${t.snippet}` : ''}
                </span>
              </Btn>
            </li>
          )
        })}
        {data?.suggest_nexus && (
          <li>
            <Btn level="tertiary" size="xs" onClick={promoteToNexus} disabled={promoting} className={cn(LINK, 'mt-1 text-body disabled:opacity-60')}>
              {promoting ? 'Creating Nexus case…' : `${threads.length} parties · Promote to Nexus`}
            </Btn>
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
          <Btn
            level="tertiary"
            onClick={() => setDropdownOpen(v => !v)}
            aria-haspopup="listbox"
            aria-expanded={dropdownOpen}
            className="w-full justify-between px-3 rounded font-normal border border-trs-line-2 bg-white text-trs-ink hover:bg-trs-tint hover:text-trs-ink"
          >
            {st.label}
            <ChevronDown size={13} className={cn('transition-transform text-trs-subtle', dropdownOpen && 'rotate-180')} />
          </Btn>
          {dropdownOpen && (
            <div role="listbox" aria-label="Lead status" className="absolute top-[calc(100%+4px)] left-0 right-0 bg-white rounded z-50 p-1.5 border border-trs-line shadow-[0_12px_32px_rgba(15,20,18,0.12)]">
              {ALL_STATUSES.map(s => {
                const sc = STATUS_MAP[s]
                const on = lead.status === s
                return (
                  <Btn
                    key={s}
                    level="tertiary"
                    size="xs"
                    role="option"
                    aria-selected={on}
                    onClick={() => { onStatus(lead.id, s); setDropdownOpen(false) }}
                    className={cn('w-full justify-start text-left px-2.5 rounded border-0 font-normal hover:bg-trs-tint', on ? 'font-medium text-trs-ink bg-trs-field hover:text-trs-ink' : 'text-trs-ink-2 hover:text-trs-ink-2')}
                  >
                    {sc.label}
                  </Btn>
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
      <div className="px-4 py-2.5 text-body border-b border-trs-line">
        <span className="block text-trs-ink">Existing client</span>
        {lead.segment_note && <span className="block mt-0.5 text-small text-trs-muted">{lead.segment_note}</span>}
      </div>
    )
  }

  if (!(EMAIL_SOURCES.has(lead.source) || !!lead.campaign_context)) return null

  return (
    <div className="px-4 py-2.5 border-b border-trs-line">
      {!open ? (
        <Btn level="tertiary" size="xs" onClick={() => setOpen(true)} className={cn(LINK, 'text-body')}>Move to existing client</Btn>
      ) : (
        <div className="flex flex-col gap-2">
          <Field label="Reason for transfer">
            <input
              autoFocus
              value={note}
              onChange={e => setNote(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') confirm()
                if (e.key === 'Escape') { setOpen(false); setNote('') }
              }}
              placeholder="Existing marine policy"
              className={inputCls}
            />
          </Field>
          <div className="flex items-center gap-3">
            <Btn level="primary" size="xs" onClick={confirm} disabled={saving}>
              {saving ? 'Moving…' : 'Confirm'}
            </Btn>
            <Btn level="tertiary" size="xs" onClick={() => { setOpen(false); setNote('') }}>
              Cancel
            </Btn>
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
            <dt className="text-small text-trs-muted">Email</dt>
            <dd className="m-0">
              <Btn level="tertiary" size="xs" onClick={() => copy(lead.email!, 'email')} title="Copy email" aria-label={copied === 'email' ? 'Copied' : 'Copy email'} className="items-start justify-start gap-1.5 text-left w-full h-auto whitespace-normal font-normal bg-transparent border-0 p-0 hover:bg-transparent">
                <span className="text-body break-all leading-snug text-trs-ink">{lead.email}</span>
                <span className="flex-shrink-0 mt-[2px] text-trs-subtle">{copied === 'email' ? <Check size={11} /> : <Copy size={11} />}</span>
              </Btn>
            </dd>
          </div>
        )}

        {lead.phone && (
          <div>
            <dt className="text-small text-trs-muted">Phone</dt>
            <dd className="m-0">
              <Btn level="tertiary" size="xs" onClick={() => copy(lead.phone!, 'phone')} title="Copy phone" aria-label={copied === 'phone' ? 'Copied' : 'Copy phone'} className="justify-start gap-1.5 text-left w-full h-auto font-normal bg-transparent border-0 p-0 hover:bg-transparent">
                <span className="text-body text-trs-ink">{lead.phone}</span>
                <span className="flex-shrink-0 text-trs-subtle">{copied === 'phone' ? <Check size={11} /> : <Copy size={11} />}</span>
              </Btn>
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
          className={cn(textareaCls, 'leading-[1.6]')}
        />
        <p className="m-0 mt-1 text-small min-h-4 text-trs-muted" aria-live="polite">
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
    <div className="border-b border-trs-line">
      <Btn onClick={toggle} aria-expanded={open} level="tertiary" size="xs" className="w-full h-auto justify-between px-4 py-2.5 rounded-none border-0 font-normal text-left hover:bg-trs-tint">
        <span className="text-body font-medium text-trs-ink">Draft history</span>
        <ChevronDown size={13} className={cn('transition-transform text-trs-subtle', open && 'rotate-180')} />
      </Btn>

      {open && (
        <div className="pb-2.5">
          {loading && <p className="m-0 text-small px-4 pb-2 text-trs-muted">Loading…</p>}
          {loaded && items.length === 0 && <p className="m-0 text-small px-4 pb-3 text-trs-muted">No drafts yet.</p>}

          {items.map((item, idx) => {
            const vNum      = items.length - idx
            const isCurrent = idx === 0 && (item.status === 'pending' || item.status === 'approved')
            const isSent    = item.status === 'sent'
            const expanded  = preview === item.id
            const typeLabel = EMAIL_TYPE_LABELS[item.generated_by] ?? item.generated_by
            const snippet   = item.body.replace(/\s+/g, ' ').slice(0, 90)

            return (
              <div key={item.id} className={cn('mx-3 mb-2 rounded px-3 py-2.5 border border-trs-line', isCurrent ? 'bg-white' : 'bg-trs-tint')}>
                <p className="m-0 mb-1 flex items-center gap-2 text-small text-trs-muted">
                  <span className="text-trs-ink">v{vNum}</span>
                  <span>{typeLabel}</span>
                  <span>{isCurrent ? 'Current' : isSent ? 'Sent' : 'Older'}</span>
                  <span className="ml-auto tabular-nums text-trs-subtle">{timeAgo(item.created_at)}</span>
                </p>
                <p className="m-0 mb-2 text-small leading-[1.5] line-clamp-2 text-trs-ink-2">{snippet}{item.body.length > 90 ? '…' : ''}</p>
                <p className="m-0 flex items-center gap-3 text-small">
                  <Btn level="tertiary" size="xs" onClick={() => setPreview(expanded ? null : item.id)} aria-expanded={expanded} className={cn(LINK, 'text-small')}>{expanded ? 'Hide' : 'Preview'}</Btn>
                  <Btn level="tertiary" size="xs" onClick={() => onRestore(item.body, item.generated_by)} className={cn(LINK, 'text-small')}>{isCurrent ? 'Reload into composer' : 'Load into composer'}</Btn>
                </p>
                {expanded && (
                  <div className="mt-2 p-2.5 rounded max-h-44 overflow-y-auto bg-trs-field">
                    <pre className="m-0 text-small whitespace-pre-wrap leading-[1.6] font-[inherit] text-trs-ink-2">{item.body}</pre>
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
    <div className="border-b border-trs-line">
      <Btn onClick={() => setOpen(v => !v)} aria-expanded={open} level="tertiary" size="xs" className="w-full h-auto justify-between px-4 py-2.5 rounded-none border-0 font-normal text-left hover:bg-trs-tint">
        <span className="text-body font-medium text-trs-ink">{title}</span>
        <ChevronDown size={13} className={cn('transition-transform text-trs-subtle', open && 'rotate-180')} />
      </Btn>
      {open && children}
    </div>
  )
}

// ── Shared atoms ──────────────────────────────────────────────────────────────

function CtxField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-small text-trs-muted">{label}</dt>
      <dd className="m-0 text-body break-words leading-snug text-trs-ink">{value}</dd>
    </div>
  )
}
