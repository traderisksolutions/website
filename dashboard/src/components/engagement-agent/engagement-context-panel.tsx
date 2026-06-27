'use client'

// Engagement Context Panel — Phase 4
//
// AI Analysis section rebuilt — email classification badge, draft provenance,
// knowledge sources, approved examples, and watch-outs now surfaced.
// All other sections (status, contact, notes, draft history) are unchanged from Phase 3.

import { useState, useEffect, useRef } from 'react'
import { Copy, Check, ChevronDown, ArrowRightLeft, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuditLog } from '@/hooks/useAuditLog'
import type { Lead, RealMsg, StoredSummary, DraftHistoryItem, RagSource } from '@/components/engagement/types'
import { STATUS_MAP, ALL_STATUSES, EMAIL_SOURCES } from '@/components/engagement/types'
import { fullName, timeAgo, daysSince } from '@/components/engagement/helpers'
import { AiAnalysisPanel } from './ai-analysis-panel'

interface EngagementContextPanelProps {
  lead:             Lead
  messages:         RealMsg[]
  threadId:         string | null
  summaries:        StoredSummary[]
  summariesLoading: boolean
  latestMessageId:  string | null
  ragSources:       RagSource[]
  onStatus:         (id: string, s: string) => void
  onTransfer:       (id: string, note: string) => Promise<void>
  onRefreshSummary: () => void
  onRestoreDraft:   (body: string, generatedBy: string) => void
}

export function EngagementContextPanel({
  lead, messages, threadId,
  summaries, summariesLoading, latestMessageId, ragSources,
  onStatus, onTransfer, onRefreshSummary, onRestoreDraft,
}: EngagementContextPanelProps) {
  const needsReply  = messages.at(-1)?.direction === 'inbound'
  const lastInbound = [...messages].reverse().find(m => m.direction === 'inbound')

  return (
    <aside
      aria-label="Thread context and AI analysis"
      className="flex-shrink-0 border-l border-[--border-subtle] bg-card flex flex-col min-h-0 overflow-y-auto"
      style={{ width: 'var(--ea-context-w, 244px)' }}
    >
      {/* ── Reply state + stats ── */}
      <div className={cn(
        'flex-shrink-0 px-4 py-3 border-b border-[--border-subtle]',
        needsReply ? 'bg-[--warning-bg]/60' : 'bg-card',
      )}>
        {needsReply ? (
          <div className="flex items-center gap-2">
            <span className="w-[5px] h-[5px] rounded-full bg-[--warning] flex-shrink-0" />
            <span className="text-[11px] font-semibold text-[--warning]">Awaiting reply</span>
          </div>
        ) : messages.length > 0 ? (
          <div className="flex items-center gap-2">
            <span className="w-[5px] h-[5px] rounded-full bg-[--success] flex-shrink-0" />
            <span className="text-[11px] font-medium text-[--success]">We replied last</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="w-[5px] h-[5px] rounded-full bg-border flex-shrink-0" />
            <span className="text-[11px] text-muted-foreground">No emails yet</span>
          </div>
        )}
        {messages.length > 0 && (
          <div className="flex items-center gap-4 mt-2.5">
            <CtxStat label="Emails"    value={String(messages.length)} />
            <CtxStat label="Days open" value={String(daysSince(lead.created_at))} />
            {lastInbound?.sent_at && (
              <CtxStat label="Last reply" value={timeAgo(lastInbound.sent_at)} small />
            )}
          </div>
        )}
      </div>

      {/* ── AI Analysis — Phase 4: email classification, provenance, examples, watch-outs ── */}
      <AiAnalysisPanel
        summaries={summaries}
        loading={summariesLoading}
        threadId={threadId}
        latestMessageId={latestMessageId}
        ragSources={ragSources}
        onRefresh={onRefreshSummary}
      />

      {/* ── Status ── */}
      <StatusSection lead={lead} onStatus={onStatus} />

      {/* ── Transfer / Existing client ── */}
      <TransferSection lead={lead} onTransfer={onTransfer} />

      {/* ── Contact info ── */}
      <ContactSection lead={lead} />

      {/* ── Lead / Enquiry info ── */}
      <EnquirySection lead={lead} />

      {/* ── Notes ── */}
      <NotesSection lead={lead} />

      {/* ── Draft history ── */}
      {threadId && (
        <DraftHistorySection threadId={threadId} onRestore={onRestoreDraft} />
      )}
    </aside>
  )
}

// ── Status picker ─────────────────────────────────────────────────────────────

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
    <div className="px-4 py-3 border-b border-[--border-subtle]">
      <CtxLabel>Status</CtxLabel>
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setOpen(v => !v)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg border text-[11.5px] font-semibold cursor-pointer transition-opacity hover:opacity-90"
          style={{ background: st.bg, color: st.color, borderColor: `${st.color}28` }}
        >
          {st.label}
          <ChevronDown
            size={11}
            strokeWidth={2.5}
            className={cn('transition-transform opacity-60', open && 'rotate-180')}
          />
        </button>
        {open && (
          <div className="absolute top-[calc(100%+4px)] left-0 right-0 bg-card border border-[--border-subtle] rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.08)] z-50 py-1 overflow-hidden">
            {ALL_STATUSES.map(s => {
              const sc = STATUS_MAP[s]
              return (
                <button
                  key={s}
                  onClick={() => { onStatus(lead.id, s); setOpen(false) }}
                  className={cn(
                    'w-full text-left px-3 py-2 text-[11.5px] flex items-center gap-2.5 transition-colors',
                    'hover:bg-accent',
                    lead.status === s ? 'font-semibold text-foreground' : 'text-foreground/70',
                  )}
                >
                  <span
                    className="w-[7px] h-[7px] rounded-full flex-shrink-0"
                    style={{ background: sc.color }}
                  />
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
      <div className="px-4 py-2.5 border-b border-[--border-subtle] flex items-center gap-2">
        <ArrowRightLeft size={11} strokeWidth={2} className="text-muted-foreground/50 flex-shrink-0" />
        <div className="min-w-0">
          <span className="text-[11px] font-semibold text-foreground/70 block">Existing Client</span>
          {lead.segment_note && (
            <span className="text-[10.5px] text-muted-foreground/60 block mt-0.5">{lead.segment_note}</span>
          )}
        </div>
      </div>
    )
  }

  if (!(EMAIL_SOURCES.has(lead.source) || !!lead.campaign_context)) return null

  return (
    <div className="px-4 py-2.5 border-b border-[--border-subtle]">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg border border-[--border-subtle] bg-muted/50 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <ArrowRightLeft size={10} strokeWidth={2} />
          Move to Existing Client
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <CtxLabel>Reason for transfer</CtxLabel>
          <input
            autoFocus
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') confirm()
              if (e.key === 'Escape') { setOpen(false); setNote('') }
            }}
            placeholder="e.g. Existing marine policy"
            className="w-full text-[11.5px] border border-[--border-subtle] rounded-lg px-3 py-1.5 bg-background outline-none focus:ring-1 focus:ring-primary/30 text-foreground"
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

// ── Contact info ──────────────────────────────────────────────────────────────

function ContactSection({ lead }: { lead: Lead }) {
  const [copied, setCopied] = useState<string | null>(null)

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="px-4 py-3 border-b border-[--border-subtle] flex flex-col gap-2.5">
      <CtxLabel>Contact</CtxLabel>

      {(lead.first_name || lead.last_name) && (
        <CtxField label="Name" value={fullName(lead)} />
      )}

      {lead.email && (
        <div>
          <CtxFieldLabel>Email</CtxFieldLabel>
          <button
            onClick={() => copy(lead.email!, 'email')}
            className="flex items-start gap-1.5 text-left w-full group mt-0.5"
          >
            <span className="text-[11.5px] text-foreground/70 break-all leading-snug">
              {lead.email}
            </span>
            <span className="flex-shrink-0 mt-[1px]">
              {copied === 'email'
                ? <Check size={10} className="text-[--success]" />
                : <Copy size={9} className="text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors" />
              }
            </span>
          </button>
        </div>
      )}

      {lead.phone && (
        <div>
          <CtxFieldLabel>Phone</CtxFieldLabel>
          <button
            onClick={() => copy(lead.phone!, 'phone')}
            className="flex items-center gap-1.5 text-left w-full group mt-0.5"
          >
            <span className="text-[11.5px] text-foreground/70">{lead.phone}</span>
            {copied === 'phone'
              ? <Check size={10} className="text-[--success] flex-shrink-0" />
              : <Copy size={9} className="text-muted-foreground/30 group-hover:text-muted-foreground/60 flex-shrink-0 transition-colors" />
            }
          </button>
        </div>
      )}

      {lead.company && <CtxField label="Company" value={lead.company} />}
    </div>
  )
}

// ── Lead / Enquiry info ───────────────────────────────────────────────────────

function EnquirySection({ lead }: { lead: Lead }) {
  return (
    <div className="px-4 py-3 border-b border-[--border-subtle] flex flex-col gap-2.5">
      <CtxLabel>Enquiry</CtxLabel>
      {lead.department   && <CtxField label="Department" value={lead.department} />}
      {lead.topic        && <CtxField label="Topic"      value={lead.topic} />}
      {lead.contact_type && <CtxField label="Type"       value={lead.contact_type} />}
      <CtxField
        label="Lead since"
        value={new Date(lead.created_at).toLocaleDateString('en-SG', {
          day: 'numeric', month: 'short', year: 'numeric',
        })}
      />
    </div>
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
    <div className="px-4 py-3 border-b border-[--border-subtle]">
      <div className="flex items-center justify-between mb-2">
        <CtxLabel noMargin>Notes</CtxLabel>
        <span className={cn(
          'text-[10px] transition-colors',
          saved ? 'text-[--success]'
               : saving ? 'text-muted-foreground/60'
               : dirty ? 'text-[--warning]'
               : 'text-transparent',
        )}>
          {saved ? 'Saved' : saving ? 'Saving…' : dirty ? 'Unsaved' : '·'}
        </span>
      </div>
      <textarea
        value={text}
        onChange={e => { setText(e.target.value); setSaved(false) }}
        onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save() } }}
        aria-label="Internal notes"
        placeholder="Internal notes… (auto-saves on blur)"
        rows={4}
        className={cn(
          'w-full text-[11.5px] text-foreground/70 leading-[1.65] resize-y',
          'border border-[--border-subtle] rounded-lg px-3 py-2 bg-background',
          'outline-none focus:ring-1 focus:ring-primary/25 focus:border-primary/30',
          'placeholder:text-muted-foreground/35 transition-colors',
        )}
      />
    </div>
  )
}

// ── Draft History ─────────────────────────────────────────────────────────────

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
    gdrive: 'GDrive', rag: 'Knowledge', manual: 'Manual',
  }

  return (
    <div className="border-b border-[--border-subtle]">
      <button
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-accent/20 transition-colors text-left"
      >
        <span className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground/70">
          Draft History
        </span>
        <ChevronDown
          size={11}
          strokeWidth={2}
          className={cn('text-muted-foreground/50 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="pb-2.5">
          {loading && (
            <p className="text-[11px] text-muted-foreground px-4 pb-2">Loading…</p>
          )}
          {loaded && items.length === 0 && (
            <p className="text-[11px] text-muted-foreground/65 italic px-4 pb-3 leading-relaxed">
              No drafts yet — generate one in the compose area.
            </p>
          )}

          {items.map((item, idx) => {
            const vNum      = items.length - idx
            const isCurrent = idx === 0 && (item.status === 'pending' || item.status === 'approved')
            const isSent    = item.status === 'sent'
            const expanded  = preview === item.id
            const typeLabel = EMAIL_TYPE_LABELS[item.generated_by] ?? item.generated_by
            const snippet   = item.body.replace(/\s+/g, ' ').slice(0, 90)

            return (
              <div
                key={item.id}
                className={cn(
                  'mx-3 mb-2 rounded-lg border overflow-hidden',
                  isCurrent
                    ? 'border-[--border-subtle] bg-card'
                    : 'border-[--border-subtle] bg-muted/30',
                )}
              >
                <div className="px-3 py-2.5">
                  {/* Version header */}
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[9.5px] font-bold text-muted-foreground/60">v{vNum}</span>
                    <span className={cn(
                      'text-[8.5px] font-bold px-1.5 py-[1px] rounded-sm',
                      item.generated_by === 'rag'
                        ? 'bg-violet-50 text-violet-600'
                        : 'bg-primary/8 text-primary',
                    )}>
                      {typeLabel}
                    </span>
                    <span className={cn(
                      'text-[9.5px]',
                      isCurrent ? 'text-[--success] font-medium'
                                : isSent ? 'text-primary font-medium'
                                : 'text-muted-foreground/60',
                    )}>
                      {isCurrent ? 'current' : isSent ? 'sent' : 'older'}
                    </span>
                    <span className="ml-auto text-[9px] text-muted-foreground/50 tabular-nums">
                      {timeAgo(item.created_at)}
                    </span>
                  </div>

                  {/* Snippet */}
                  <p className="text-[10.5px] text-muted-foreground/65 leading-[1.5] mb-2 line-clamp-2 m-0">
                    {snippet}{item.body.length > 90 ? '…' : ''}
                  </p>

                  {/* Actions */}
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setPreview(expanded ? null : item.id)}
                      className="text-[10px] text-muted-foreground border border-[--border-subtle] rounded-md px-2 py-0.5 hover:bg-accent transition-colors"
                    >
                      {expanded ? 'Hide' : 'Preview'}
                    </button>
                    <button
                      onClick={() => onRestore(item.body, item.generated_by)}
                      className={cn(
                        'text-[10px] font-semibold text-white rounded-md px-2 py-0.5',
                        isCurrent ? 'bg-[--success]' : 'bg-primary',
                      )}
                    >
                      {isCurrent ? 'Reload' : 'Load'}
                    </button>
                  </div>

                  {/* Preview expansion */}
                  {expanded && (
                    <div className="mt-2 p-2.5 bg-muted/60 rounded-lg border border-[--border-subtle] max-h-[180px] overflow-y-auto">
                      <pre className="text-[10.5px] text-foreground/65 whitespace-pre-wrap leading-[1.6] m-0 font-inherit">
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

// ── Shared atoms for context panel ────────────────────────────────────────────

function CtxLabel({ children, noMargin }: { children: React.ReactNode; noMargin?: boolean }) {
  return (
    <p className={cn(
      'text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground/60 m-0',
      !noMargin && 'mb-1',
    )}>
      {children}
    </p>
  )
}

function CtxFieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground/60 m-0 mb-0.5">
      {children}
    </p>
  )
}

function CtxField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <CtxFieldLabel>{label}</CtxFieldLabel>
      <p className="text-[11.5px] text-foreground/70 m-0 break-words leading-snug">{value}</p>
    </div>
  )
}

function CtxStat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/55 m-0 mb-0.5">
        {label}
      </p>
      <p className={cn(
        'font-bold m-0',
        small ? 'text-[11px] text-foreground/55' : 'text-[14px] text-foreground',
      )}>
        {value}
      </p>
    </div>
  )
}
