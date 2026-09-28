'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { Tip } from '@/components/Tip'
import { Button } from '@/components/ui/button'
import { StatusBadge, STATUS_MAP } from '@/components/status-badge'
import type { ReplyLabel } from '@/components/status-badge'
import { Segmented, textareaCls } from '@/components/crm/primitives'

const INK = '#202124'
const MUTED = '#5f6368'
const RULE = '#e8eaed'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Classification {
  id: string
  ai_label:   ReplyLabel | null
  ai_confidence: number | null
  ai_reasoning:  string | null
  human_label:   ReplyLabel | null
  human_reviewed_at: string | null
}

type DraftStatus = 'none' | 'drafted' | 'sent'

interface ReplyEvent {
  id:              string
  campaign_id:     string | null
  lead_id:         string | null
  lead_email:      string | null
  subject:         string | null
  body_preview:    string | null
  received_at:     string
  classification:  Classification | null
  draft_body:      string | null
  draft_status:    DraftStatus
  sent_at:         string | null
  sent_from_email: string | null
}

const ALL_LABELS: ReplyLabel[] = [
  'positive','meeting_intent','question','neutral',
  'negative','unsubscribe','out_of_office','wrong_person',
]

const FILTER_LABELS: (ReplyLabel | 'all')[] = ['all', 'positive', 'meeting_intent', 'question', 'neutral', 'negative']

// ── Main Page ─────────────────────────────────────────────────────────────────

function RepliesInner() {
  const searchParams   = useSearchParams()
  const campaignFilter = searchParams.get('campaign_id')

  const [replies,      setReplies]      = useState<ReplyEvent[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [successMsg,   setSuccessMsg]   = useState<string | null>(null)
  const [needsReview,  setNeedsReview]  = useState(false)
  const [labelFilter,  setLabelFilter]  = useState<ReplyLabel | 'all'>('all')
  const [saving,       setSaving]       = useState<string | null>(null)
  const [editingDraft, setEditingDraft] = useState<Record<string, string>>({})
  const [drafting,     setDrafting]     = useState<string | null>(null)
  const [sending,      setSending]      = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (needsReview)   qs.set('needs_review', 'true')
      if (campaignFilter) qs.set('campaign_id', campaignFilter)
      const res  = await fetch(`/api/outbound/replies${qs.toString() ? `?${qs}` : ''}`)
      const data = await res.json()
      setReplies(Array.isArray(data) ? data : [])
    } catch {
      setError('Failed to load replies')
    } finally {
      setLoading(false)
    }
  }, [needsReview, campaignFilter])

  useEffect(() => { load() }, [load])

  async function applyLabel(replyId: string, human_label: ReplyLabel) {
    setSaving(replyId)
    try {
      const res = await fetch(`/api/outbound/replies/${replyId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ human_label }),
      })
      if (!res.ok) throw new Error('Label failed')
      setReplies(prev => prev.map(r =>
        r.id === replyId
          ? {
              ...r,
              classification: {
                ...(r.classification ?? { id: '', ai_label: null, ai_confidence: null, ai_reasoning: null }),
                human_label,
                human_reviewed_at: new Date().toISOString(),
              },
            }
          : r
      ))
      setSuccessMsg('Label saved')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save label')
    } finally {
      setSaving(null)
    }
  }

  async function generateDraft(replyId: string) {
    setDrafting(replyId)
    setError(null)
    try {
      const res = await fetch(`/api/outbound/replies/${replyId}/draft`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate a draft')
      setEditingDraft(prev => ({ ...prev, [replyId]: data.draft_body }))
      setReplies(prev => prev.map(r => r.id === replyId ? { ...r, draft_body: data.draft_body, draft_status: 'drafted' } : r))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate a draft')
    } finally {
      setDrafting(null)
    }
  }

  async function sendReply(replyId: string) {
    const body = editingDraft[replyId]?.trim()
    if (!body) return
    if (!confirm('Send this reply to the prospect now? This cannot be undone.')) return
    setSending(replyId)
    setError(null)
    try {
      const res = await fetch(`/api/outbound/replies/${replyId}/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to send')
      setReplies(prev => prev.map(r => r.id === replyId ? { ...r, draft_body: body, draft_status: 'sent', sent_at: new Date().toISOString() } : r))
      setSuccessMsg('Reply sent')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send')
    } finally {
      setSending(null)
    }
  }

  const filtered = replies.filter(r => {
    if (labelFilter === 'all') return true
    const effective = r.classification?.human_label ?? r.classification?.ai_label
    return effective === labelFilter
  })

  const pendingCount = replies.filter(
    r => r.classification && !r.classification.human_label
  ).length

  const countLine = loading
    ? 'Loading…'
    : [
        `${replies.length} repl${replies.length === 1 ? 'y' : 'ies'}`,
        pendingCount > 0 ? `${pendingCount} awaiting review` : null,
        campaignFilter ? 'filtered to one campaign' : null,
      ].filter(Boolean).join(' · ')

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK }}>
      <div className="mx-auto max-w-[1000px] px-6 sm:px-12 pt-12 pb-20">

        {/* Header */}
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">Replies</h1>
            <p className="m-0 mt-2 text-[15px] flex items-center gap-1" style={{ color: MUTED }}>
              {countLine}
              <Tip text="Replies to campaign emails arrive here from Instantly. The AI proposes a label; confirm it or pick another. A reply is only sent when you click Send." />
            </p>
          </div>
          <Segmented
            value={needsReview ? 'review' : 'all'}
            onChange={v => setNeedsReview(v === 'review')}
            options={[{ value: 'all', label: 'All' }, { value: 'review', label: 'Needs review', count: pendingCount > 0 ? pendingCount : undefined }]}
          />
        </div>

        {/* Label filter */}
        <div className="mt-6">
          <Segmented
            value={labelFilter}
            onChange={setLabelFilter}
            options={FILTER_LABELS.map(l => ({ value: l, label: l === 'all' ? 'All labels' : STATUS_MAP[l].label }))}
          />
        </div>

        {error && (
          <p className="mt-6 mb-0 text-[14px] flex items-center gap-3 flex-wrap" style={{ color: '#3c4043' }} role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="bg-transparent border-0 p-0 cursor-pointer underline underline-offset-4" style={{ color: INK }}>Dismiss</button>
          </p>
        )}
        {successMsg && (
          <p className="mt-6 mb-0 text-[14px] flex items-center gap-3 flex-wrap" style={{ color: MUTED }} role="status">
            <span>{successMsg}</span>
            <button type="button" onClick={() => setSuccessMsg(null)} className="bg-transparent border-0 p-0 cursor-pointer underline underline-offset-4" style={{ color: INK }}>Dismiss</button>
          </p>
        )}

        {/* Replies */}
        <div className="mt-6">
          {loading ? (
            <div className="flex flex-col gap-3" aria-busy="true">
              {Array.from({ length: 3 }).map((_, i) => <span key={i} className="block h-[140px] rounded-[16px] bg-[#f1f3f4] animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-16 text-center text-[16px] m-0" style={{ color: MUTED }}>
              {needsReview ? 'Every reply has been reviewed.' : 'No replies yet.'}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {filtered.map(reply => {
                const cl        = reply.classification
                const aiLabel   = cl?.ai_label ?? null
                const humLabel  = cl?.human_label ?? null
                const effective = humLabel ?? aiLabel
                const isSaving  = saving === reply.id

                return (
                  <article key={reply.id} className="rounded-[16px] bg-white px-6 py-5" style={{ border: `1px solid ${RULE}` }}>
                    {/* Header row */}
                    <div className="flex items-start gap-4 flex-wrap">
                      <div className="flex-1 min-w-[200px]">
                        <p className="m-0 text-[15px] font-medium" style={{ color: INK }}>{reply.lead_email ?? '—'}</p>
                        {reply.subject && <p className="m-0 mt-0.5 text-[13px]" style={{ color: MUTED }}>Re: {reply.subject}</p>}
                        <p className="m-0 mt-2 flex items-center gap-2 flex-wrap text-[12.5px]" style={{ color: MUTED }}>
                          {effective && <StatusBadge status={effective} label={`${humLabel ? 'Confirmed' : 'AI'} · ${STATUS_MAP[effective].label}`} />}
                          {cl?.ai_confidence != null && <span className="tabular-nums">{Math.round(cl.ai_confidence * 100)}% confidence</span>}
                          {!cl && <span>Not yet classified</span>}
                        </p>
                      </div>
                      <span className="text-[12.5px] flex-shrink-0" style={{ color: MUTED }}>
                        {new Date(reply.received_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>

                    {/* Preview */}
                    {reply.body_preview && (
                      <div className="mt-3 rounded-[12px] px-4 py-3" style={{ background: '#f1f3f4' }}>
                        <p className="m-0 text-[14px] leading-relaxed whitespace-pre-wrap" style={{ color: '#3c4043' }}>{reply.body_preview}</p>
                      </div>
                    )}

                    {/* AI reasoning */}
                    {cl?.ai_reasoning && (
                      <p className="m-0 mt-2.5 text-[12.5px] leading-relaxed" style={{ color: MUTED }}>AI reasoning: {cl.ai_reasoning}</p>
                    )}

                    {/* Human label selector */}
                    <div className="mt-3 flex items-center gap-3 flex-wrap">
                      {isSaving ? (
                        <span className="inline-flex items-center gap-2 text-[13px]" style={{ color: MUTED }}><Loader2 size={13} className="animate-spin" /> Saving…</span>
                      ) : (
                        <Segmented
                          value={humLabel ?? ('' as ReplyLabel)}
                          onChange={l => applyLabel(reply.id, l)}
                          options={ALL_LABELS.map(l => ({ value: l, label: STATUS_MAP[l].label }))}
                        />
                      )}
                      {reply.campaign_id && (
                        <Link href={`/outbound/campaigns/${reply.campaign_id}`} className="ml-auto text-[13px] no-underline hover:underline underline-offset-4" style={{ color: INK }}>
                          Open campaign →
                        </Link>
                      )}
                    </div>

                    {/* Reply drafting: a human always decides whether to respond and approves the exact
                        text before it sends; nothing here ever sends automatically. */}
                    {reply.lead_email && (
                      <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${RULE}` }}>
                        {reply.draft_status === 'sent' ? (
                          <div>
                            <p className="m-0 text-[12.5px]" style={{ color: MUTED }}>
                              Sent{reply.sent_from_email ? ` as ${reply.sent_from_email}` : ''}{reply.sent_at ? ` · ${new Date(reply.sent_at).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}
                            </p>
                            <p className="m-0 mt-1.5 text-[14px] leading-relaxed whitespace-pre-wrap" style={{ color: '#3c4043' }}>{reply.draft_body}</p>
                          </div>
                        ) : editingDraft[reply.id] !== undefined || reply.draft_body ? (
                          <div className="flex flex-col gap-2.5">
                            <textarea
                              value={editingDraft[reply.id] ?? reply.draft_body ?? ''}
                              onChange={e => setEditingDraft(prev => ({ ...prev, [reply.id]: e.target.value }))}
                              rows={4}
                              className={textareaCls}
                              placeholder="Reply text. Review and edit before sending."
                              aria-label="Reply text"
                            />
                            <div className="flex items-center gap-2 flex-wrap">
                              <Button size="sm" onClick={() => sendReply(reply.id)} disabled={sending === reply.id || !(editingDraft[reply.id] ?? reply.draft_body)?.trim()}>
                                {sending === reply.id ? 'Sending…' : 'Send'}
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => generateDraft(reply.id)} disabled={drafting === reply.id}>
                                {drafting === reply.id ? 'Drafting…' : 'Regenerate'}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => generateDraft(reply.id)} disabled={drafting === reply.id}>
                            {drafting === reply.id ? 'Drafting…' : 'Generate reply'}
                          </Button>
                        )}
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function RepliesPage() {
  return (
    <Suspense>
      <RepliesInner />
    </Suspense>
  )
}
