'use client'

import { useState, useEffect, useRef } from 'react'
import { RefreshCw, Copy, Check, ChevronDown, ArrowRightLeft, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tip } from '@/components/Tip'
import { useAuditLog } from '@/hooks/useAuditLog'
import type { Lead, RealMsg, StoredSummary, DraftHistoryItem } from './types'
import { STATUS_MAP, ALL_STATUSES, EMAIL_SOURCES } from './types'
import { fullName, timeAgo, fmtDateTime, daysSince } from './helpers'

interface ContextPanelProps {
  lead:             Lead
  messages:         RealMsg[]
  threadId:         string | null
  summaries:        StoredSummary[]
  summariesLoading: boolean
  latestMessageId:  string | null
  onStatus:         (id: string, s: string) => void
  onTransfer:       (id: string, note: string) => Promise<void>
  onRefreshSummary: () => void
  onRestoreDraft:   (body: string, generatedBy: string) => void
}

export function ContextPanel({
  lead, messages, threadId,
  summaries, summariesLoading, latestMessageId,
  onStatus, onTransfer, onRefreshSummary, onRestoreDraft,
}: ContextPanelProps) {
  const needsReply    = messages.at(-1)?.direction === 'inbound'
  const lastInbound   = [...messages].reverse().find(m => m.direction === 'inbound')

  return (
    <aside className="w-[244px] flex-shrink-0 border-l border-[--border-subtle] bg-card flex flex-col min-h-0 overflow-y-auto">

      {/* ── Reply state indicator ── */}
      <div className={cn(
        'flex-shrink-0 px-4 py-2.5 border-b border-[--border-subtle]',
        needsReply ? 'bg-[--warning-bg]' : 'bg-card',
      )}>
        {needsReply ? (
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[--warning] flex-shrink-0" />
            <span className="text-[11px] font-semibold text-[--warning]">Awaiting reply</span>
          </div>
        ) : messages.length > 0 ? (
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[--success] flex-shrink-0" />
            <span className="text-[11px] font-medium text-[--success]">We replied last</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-border flex-shrink-0" />
            <span className="text-[11px] text-muted-foreground">No emails yet</span>
          </div>
        )}
        {messages.length > 0 && (
          <div className="flex items-center gap-4 mt-2">
            <Stat label="Emails"    value={String(messages.length)} />
            <Stat label="Days open" value={String(daysSince(lead.created_at))} />
            {lastInbound?.sent_at && (
              <Stat label="Last reply" value={timeAgo(lastInbound.sent_at)} small />
            )}
          </div>
        )}
      </div>

      {/* ── AI Analysis ── */}
      <AIAnalysisSection
        summaries={summaries}
        loading={summariesLoading}
        threadId={threadId}
        latestMessageId={latestMessageId}
        onRefresh={onRefreshSummary}
      />

      {/* ── Status ── */}
      <StatusSection lead={lead} onStatus={onStatus} />

      {/* ── Transfer / Existing client ── */}
      <TransferSection lead={lead} onTransfer={onTransfer} />

      {/* ── Contact info ── */}
      <ContactInfoSection lead={lead} />

      {/* ── Lead info ── */}
      <LeadInfoSection lead={lead} />

      {/* ── Notes ── */}
      <NotesSection lead={lead} />

      {/* ── Draft history ── */}
      {threadId && (
        <DraftHistorySection threadId={threadId} onRestore={onRestoreDraft} />
      )}
    </aside>
  )
}

// ── AI Analysis ─────────────────────────────────────────────────────────────

function AIAnalysisSection({
  summaries, loading, threadId, latestMessageId, onRefresh,
}: {
  summaries:        StoredSummary[]
  loading:          boolean
  threadId:         string | null
  latestMessageId:  string | null
  onRefresh:        () => void
}) {
  const [regenerating, setRegenerating] = useState(false)
  const [regenErr,     setRegenErr]     = useState<string | null>(null)
  const [historyOpen,  setHistoryOpen]  = useState(false)

  const latest = summaries[0] ?? null
  const older  = summaries.slice(1)

  async function handleRegenerate() {
    if (!threadId || !latestMessageId) return
    setRegenerating(true); setRegenErr(null)
    try {
      const res = await fetch('/api/engagement/refresh-summary', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId, message_id: latestMessageId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      onRefresh()
    } catch (e) {
      setRegenErr(e instanceof Error ? e.message : 'Failed')
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <div className="border-b border-[--border-subtle] flex-shrink-0">
      <div className="flex items-center justify-between px-3.5 pt-3 pb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[9.5px] font-bold uppercase tracking-wider text-primary">AI Analysis</span>
          {latest && (
            <span className="text-[9.5px] text-muted-foreground">· {timeAgo(latest.created_at)}</span>
          )}
          <Tip text="Generated automatically each time the contact sends a new email. Summarises the thread and suggests a next step." />
        </div>
        <div className="flex items-center gap-1.5">
          {regenErr && <span className="text-[9.5px] text-[--error] max-w-[80px] truncate">{regenErr}</span>}
          {threadId && latestMessageId && (
            <button
              onClick={handleRegenerate}
              disabled={regenerating || loading}
              className="flex items-center gap-1 text-[10px] text-primary hover:opacity-80 disabled:opacity-50 transition-opacity"
            >
              <RefreshCw size={9} strokeWidth={2} className={cn(regenerating && 'animate-spin')} />
              {regenerating ? 'Generating…' : latest ? 'Refresh' : 'Generate'}
            </button>
          )}
        </div>
      </div>

      <div className="px-3.5 pb-3">
        {(loading || regenerating) && (
          <p className="text-[11.5px] text-muted-foreground italic">Analysing thread…</p>
        )}

        {!loading && !regenerating && !latest && (
          <p className="text-[11.5px] text-muted-foreground italic leading-relaxed">
            Generates automatically on each new email, or click Refresh above.
          </p>
        )}

        {latest && (
          <>
            <p className="text-[12px] text-foreground/80 leading-[1.65] mb-2 m-0">{latest.summary}</p>

            {latest.next_action && (
              <div className="mb-2 px-2.5 py-2 bg-primary/5 rounded-lg border-l-2 border-primary/40">
                <p className="text-[10px] font-bold uppercase tracking-wider text-primary mb-1">Next action</p>
                <p className="text-[11.5px] text-primary/80 leading-relaxed m-0">{latest.next_action}</p>
              </div>
            )}

            {older.length > 0 && (
              <button
                onClick={() => setHistoryOpen(v => !v)}
                className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 mt-1"
              >
                <ChevronDown size={9} className={cn('transition-transform', historyOpen && 'rotate-180')} />
                {older.length} earlier {older.length === 1 ? 'summary' : 'summaries'}
              </button>
            )}

            {historyOpen && (
              <div className="mt-2 flex flex-col gap-2">
                {older.map(s => (
                  <div key={s.id} className="px-2.5 py-2 bg-muted rounded-lg">
                    <p className="text-[9.5px] text-muted-foreground mb-1 m-0">{fmtDateTime(s.created_at)}</p>
                    <p className="text-[11px] text-foreground/70 leading-[1.55] m-0">{s.summary}</p>
                    {s.next_action && (
                      <p className="text-[10.5px] text-muted-foreground italic mt-1 m-0">→ {s.next_action}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Status picker ────────────────────────────────────────────────────────────

function StatusSection({ lead, onStatus }: { lead: Lead; onStatus: (id: string, s: string) => void }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const st = STATUS_MAP[lead.status] ?? STATUS_MAP.contacted

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  return (
    <div className="px-3.5 py-3 border-b border-[--border-subtle]">
      <Label>Status</Label>
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setOpen(v => !v)}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-[11.5px] font-semibold cursor-pointer transition-colors hover:opacity-90"
          style={{ background: st.bg, color: st.color, borderColor: `${st.color}30` }}
        >
          {st.label}
          <ChevronDown size={11} strokeWidth={2.5} className={cn('transition-transform', open && 'rotate-180')} />
        </button>
        {open && (
          <div className="absolute top-[calc(100%+4px)] left-0 right-0 bg-card border border-[--border-subtle] rounded-xl shadow-lg z-50 py-1 overflow-hidden">
            {ALL_STATUSES.map(s => {
              const sc = STATUS_MAP[s]
              return (
                <button
                  key={s}
                  onClick={() => { onStatus(lead.id, s); setOpen(false) }}
                  className={cn(
                    'w-full text-left px-3 py-2 text-[11.5px] flex items-center gap-2 transition-colors',
                    'hover:bg-accent',
                    lead.status === s ? 'font-semibold' : 'text-foreground/70',
                  )}
                >
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: sc.color }} />
                  {sc.label}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Transfer section ─────────────────────────────────────────────────────────

function TransferSection({ lead, onTransfer }: { lead: Lead; onTransfer: (id: string, note: string) => Promise<void> }) {
  const [open,    setOpen]    = useState(false)
  const [note,    setNote]    = useState('')
  const [saving,  setSaving]  = useState(false)

  useEffect(() => { setOpen(false); setNote('') }, [lead.id])

  async function confirm() {
    if (saving) return
    setSaving(true)
    try { await onTransfer(lead.id, note.trim()); setOpen(false); setNote('') }
    finally { setSaving(false) }
  }

  if (lead.segment === 'existing_client') {
    return (
      <div className="px-3.5 py-2.5 border-b border-[--border-subtle] flex items-center gap-2">
        <ArrowRightLeft size={11} strokeWidth={2} className="text-muted-foreground flex-shrink-0" />
        <div className="min-w-0">
          <span className="text-[11px] font-semibold text-foreground/70 block">Existing Client</span>
          {lead.segment_note && (
            <span className="text-[10.5px] text-muted-foreground block mt-0.5">{lead.segment_note}</span>
          )}
        </div>
      </div>
    )
  }

  if (!(EMAIL_SOURCES.has(lead.source) || !!lead.campaign_context)) return null

  return (
    <div className="px-3.5 py-2.5 border-b border-[--border-subtle]">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg border border-[--border-subtle] bg-muted/60 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <ArrowRightLeft size={11} strokeWidth={2} />
          Move to Existing Client
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <Label>Reason for transfer</Label>
          <input
            autoFocus
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') confirm()
              if (e.key === 'Escape') { setOpen(false); setNote('') }
            }}
            placeholder="e.g. Existing marine policy"
            className="w-full text-[11.5px] border border-[--border-subtle] rounded-lg px-2.5 py-1.5 bg-background outline-none focus:ring-1 focus:ring-primary/30 text-foreground"
          />
          <div className="flex gap-2">
            <button
              onClick={confirm}
              disabled={saving}
              className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold bg-primary text-primary-foreground disabled:opacity-50"
            >
              {saving ? 'Moving…' : 'Confirm'}
            </button>
            <button
              onClick={() => { setOpen(false); setNote('') }}
              className="px-3 py-1.5 rounded-lg text-[11px] border border-[--border-subtle] text-muted-foreground hover:bg-accent"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Contact info ─────────────────────────────────────────────────────────────

function ContactInfoSection({ lead }: { lead: Lead }) {
  const [copied, setCopied] = useState<string | null>(null)

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="px-3.5 py-3 border-b border-[--border-subtle] flex flex-col gap-2.5">
      <Label>Contact</Label>
      {(lead.first_name || lead.last_name) && (
        <Field label="Name" value={fullName(lead)} />
      )}
      {lead.email && (
        <div>
          <FieldLabel>Email</FieldLabel>
          <button
            onClick={() => copy(lead.email!, 'email')}
            className="flex items-center gap-1.5 text-left w-full group"
          >
            <span className="text-[11.5px] text-foreground/75 break-all">{lead.email}</span>
            {copied === 'email'
              ? <Check size={10} className="text-[--success] flex-shrink-0" />
              : <Copy size={9} className="text-muted-foreground/40 group-hover:text-muted-foreground flex-shrink-0 transition-colors" />
            }
          </button>
        </div>
      )}
      {lead.phone && (
        <div>
          <FieldLabel>Phone</FieldLabel>
          <button
            onClick={() => copy(lead.phone!, 'phone')}
            className="flex items-center gap-1.5 text-left w-full group"
          >
            <span className="text-[11.5px] text-foreground/75">{lead.phone}</span>
            {copied === 'phone'
              ? <Check size={10} className="text-[--success] flex-shrink-0" />
              : <Copy size={9} className="text-muted-foreground/40 group-hover:text-muted-foreground flex-shrink-0 transition-colors" />
            }
          </button>
        </div>
      )}
      {lead.company && <Field label="Company" value={lead.company} />}
    </div>
  )
}

// ── Lead info ────────────────────────────────────────────────────────────────

function LeadInfoSection({ lead }: { lead: Lead }) {
  const hasInfo = lead.department || lead.topic || lead.contact_type

  return (
    <div className="px-3.5 py-3 border-b border-[--border-subtle] flex flex-col gap-2.5">
      <Label>Enquiry</Label>
      {lead.department   && <Field label="Department" value={lead.department} />}
      {lead.topic        && <Field label="Topic"      value={lead.topic}      />}
      {lead.contact_type && <Field label="Type"       value={lead.contact_type} />}
      <Field
        label="Lead since"
        value={new Date(lead.created_at).toLocaleDateString('en-SG', {
          day: 'numeric', month: 'short', year: 'numeric',
        })}
      />
    </div>
  )
}

// ── Notes ────────────────────────────────────────────────────────────────────

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
    <div className="px-3.5 py-3 border-b border-[--border-subtle]">
      <div className="flex items-center justify-between mb-2">
        <Label noMargin>Notes</Label>
        {saved
          ? <span className="text-[10px] text-[--success]">Saved</span>
          : saving
            ? <span className="text-[10px] text-muted-foreground">Saving…</span>
            : dirty && <span className="text-[10px] text-[--warning]">Unsaved</span>
        }
      </div>
      <textarea
        value={text}
        onChange={e => { setText(e.target.value); setSaved(false) }}
        onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save() } }}
        placeholder="Internal notes… (auto-saves on blur)"
        rows={4}
        className="w-full text-[11.5px] text-foreground/75 leading-[1.6] border border-[--border-subtle] rounded-lg px-2.5 py-2 bg-background outline-none focus:ring-1 focus:ring-primary/30 resize-y font-inherit"
      />
    </div>
  )
}

// ── Draft History ────────────────────────────────────────────────────────────

function DraftHistorySection({
  threadId, onRestore,
}: {
  threadId: string
  onRestore: (body: string, generatedBy: string) => void
}) {
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
    gdrive: 'GDrive', rag: 'Knowledge', manual: 'Manual',
  }

  return (
    <div className="border-b border-[--border-subtle]">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-accent/30 transition-colors text-left"
      >
        <span className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground">
          Draft History
        </span>
        <ChevronDown size={11} className={cn('text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="pb-2">
          {loading && (
            <p className="text-[11px] text-muted-foreground px-3.5 pb-2">Loading…</p>
          )}
          {loaded && items.length === 0 && (
            <p className="text-[11px] text-muted-foreground italic px-3.5 pb-3 leading-relaxed">
              No drafts yet — generate one in the compose area.
            </p>
          )}
          {items.map((item, idx) => {
            const vNum       = items.length - idx
            const isCurrent  = idx === 0 && (item.status === 'pending' || item.status === 'approved')
            const isSent     = item.status === 'sent'
            const expanded   = preview === item.id
            const typeLabel  = EMAIL_TYPE_LABELS[item.generated_by] ?? item.generated_by
            const preview100 = item.body.replace(/\s+/g, ' ').slice(0, 90)

            return (
              <div
                key={item.id}
                className={cn(
                  'mx-2 mb-1.5 rounded-lg border overflow-hidden',
                  isCurrent ? 'border-[--border-subtle] bg-card' : 'border-[--border-subtle] bg-muted/40',
                )}
              >
                <div className="px-2.5 py-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[9.5px] font-bold text-muted-foreground">v{vNum}</span>
                    <span className={cn(
                      'text-[9px] font-bold px-1.5 py-0.5 rounded',
                      item.generated_by === 'rag'
                        ? 'bg-violet-50 text-violet-600'
                        : 'bg-primary/8 text-primary',
                    )}>
                      {typeLabel}
                    </span>
                    <span className={cn(
                      'text-[9.5px] font-medium',
                      isCurrent ? 'text-[--success]' : isSent ? 'text-primary' : 'text-muted-foreground',
                    )}>
                      · {isCurrent ? 'current' : isSent ? 'sent' : 'older'}
                    </span>
                    <span className="ml-auto text-[9.5px] text-muted-foreground tabular-nums">
                      {timeAgo(item.created_at)}
                    </span>
                  </div>

                  <p className="text-[11px] text-muted-foreground leading-[1.55] mb-1.5 line-clamp-2 m-0">
                    {preview100}{item.body.length > 90 ? '…' : ''}
                  </p>

                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setPreview(expanded ? null : item.id)}
                      className="text-[10px] text-muted-foreground bg-muted border-none rounded px-2 py-0.5 cursor-pointer hover:bg-accent"
                    >
                      {expanded ? 'Hide' : 'Preview'}
                    </button>
                    <button
                      onClick={() => onRestore(item.body, item.generated_by)}
                      className={cn(
                        'text-[10px] font-semibold text-white rounded px-2 py-0.5 cursor-pointer',
                        isCurrent ? 'bg-[--success]' : 'bg-primary',
                      )}
                    >
                      {isCurrent ? 'Reload' : 'Load'}
                    </button>
                  </div>

                  {expanded && (
                    <div className="mt-2 p-2.5 bg-muted rounded-lg border border-[--border-subtle] max-h-[180px] overflow-y-auto">
                      <pre className="text-[10.5px] text-foreground/70 whitespace-pre-wrap leading-[1.6] m-0 font-inherit">
                        {item.body}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Small atoms ──────────────────────────────────────────────────────────────

function Label({ children, noMargin }: { children: React.ReactNode; noMargin?: boolean }) {
  return (
    <p className={cn(
      'text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground/70 m-0',
      !noMargin && 'mb-1',
    )}>
      {children}
    </p>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground/70 m-0 mb-0.5">
      {children}
    </p>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <p className="text-[11.5px] text-foreground/75 m-0 break-words leading-snug">{value}</p>
    </div>
  )
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60 m-0 mb-0.5">{label}</p>
      <p className={cn('m-0 font-bold', small ? 'text-[11px] text-foreground/60' : 'text-[14px] text-foreground')}>{value}</p>
    </div>
  )
}
