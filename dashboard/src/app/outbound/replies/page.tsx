'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2, AlertCircle, CheckCircle, ExternalLink, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AppScrollPage, AppPageHeader } from '@/components/app-shell'
import { StatusBadge, STATUS_MAP } from '@/components/status-badge'
import type { ReplyLabel } from '@/components/status-badge'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Classification {
  id: string
  ai_label:   ReplyLabel | null
  ai_confidence: number | null
  ai_reasoning:  string | null
  human_label:   ReplyLabel | null
  human_reviewed_at: string | null
}

interface ReplyEvent {
  id:              string
  campaign_id:     string | null
  lead_id:         string | null
  lead_email:      string | null
  subject:         string | null
  body_preview:    string | null
  received_at:     string
  classification:  Classification | null
}

const ALL_LABELS: ReplyLabel[] = [
  'positive','meeting_intent','question','neutral',
  'negative','unsubscribe','out_of_office','wrong_person',
]

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

  const filtered = replies.filter(r => {
    if (labelFilter === 'all') return true
    const effective = r.classification?.human_label ?? r.classification?.ai_label
    return effective === labelFilter
  })

  const pendingCount = replies.filter(
    r => r.classification && !r.classification.human_label
  ).length

  return (
    <AppScrollPage maxWidth="900px">
      <AppPageHeader
        title="Reply Review"
        description="AI-classified inbound replies. Confirm or override the label."
        actions={
          <label className="flex items-center gap-1.5 text-[13px] text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={needsReview} onChange={e => setNeedsReview(e.target.checked)} className="cursor-pointer" />
            Needs review only
            {pendingCount > 0 && (
              <span className="text-[11px] font-semibold rounded-full px-1.5" style={{ background: 'var(--warning)', color: 'hsl(var(--card))' }}>
                {pendingCount}
              </span>
            )}
          </label>
        }
      />

      {/* Info banner */}
      <div className="rounded-[10px] px-[18px] py-3.5 mb-4" style={{ background: 'var(--primary-light-bg)', border: '1px solid var(--primary-light-border)' }}>
        <p className="m-0 text-[13px] font-bold" style={{ color: 'var(--primary-hex)' }}>What is Reply Review?</p>
        <p className="mt-1.5 mb-0 text-[12px] text-muted-foreground leading-relaxed">
          When leads reply to your outbound campaigns via Instantly, those replies arrive here automatically via webhook.
          The AI reads each reply and classifies it as <strong>Positive</strong>, <strong>Meeting Intent</strong>, <strong>Question</strong>,{' '}
          <strong>Neutral</strong>, <strong>Not Interested</strong>, <strong>Unsubscribe</strong>, <strong>Out of Office</strong>, or <strong>Wrong Person</strong>.
        </p>
        <p className="mt-1.5 mb-0 text-[12px] text-muted-foreground leading-relaxed">
          <strong>Your job:</strong> Confirm the AI label (click it to tick it) or select a different one if the AI got it wrong.
          Reviewed labels keep your pipeline data accurate and help train the classification over time.
          Replies highlighted in <span className="px-1 rounded-[3px] font-semibold" style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>amber</span> have not been reviewed yet.
        </p>
      </div>

      {/* Label filter */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <button onClick={() => setLabelFilter('all')} aria-pressed={labelFilter === 'all'} className={cn('filter-pill', labelFilter === 'all' && 'active')}>
          All
        </button>
        {(['positive','meeting_intent','question','neutral','negative'] as ReplyLabel[]).map(l => {
          const cfg = STATUS_MAP[l]
          const selected = labelFilter === l
          return (
            <button
              key={l}
              onClick={() => setLabelFilter(l)}
              aria-pressed={selected}
              className="px-3 py-1 rounded-full text-[12px] font-medium border"
              style={{
                borderColor: selected ? cfg.color : 'var(--border-subtle)',
                background: selected ? cfg.bg : 'hsl(var(--card))',
                color: selected ? cfg.color : 'hsl(var(--muted-foreground))',
              }}
            >
              {cfg.label}
            </button>
          )
        })}
      </div>

      {/* Error / Success */}
      {error && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 mb-3.5 rounded-lg text-[13px]" style={{ background: 'var(--error-bg)', border: '1px solid var(--error-border, var(--error))', color: 'var(--error)' }}>
          <AlertCircle size={14} className="flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="bg-transparent border-none cursor-pointer text-lg leading-none" style={{ color: 'var(--error)' }}><X size={14} /></button>
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 mb-3.5 rounded-lg text-[13px]" style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)', color: 'var(--success)' }}>
          <CheckCircle size={14} className="flex-shrink-0" />
          <span className="flex-1">{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="bg-transparent border-none cursor-pointer text-lg leading-none" style={{ color: 'var(--success)' }}><X size={14} /></button>
        </div>
      )}

      {/* Replies */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={18} className="animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <p className="empty-title">{needsReview ? 'All replies have been reviewed.' : 'No replies yet.'}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map(reply => {
            const cl        = reply.classification
            const aiLabel   = cl?.ai_label ?? null
            const humLabel  = cl?.human_label ?? null
            const effective = humLabel ?? aiLabel
            const isReviewed = !!humLabel
            const needsAttention = !!cl && !humLabel
            const isSaving  = saving === reply.id

            return (
              <div
                key={reply.id}
                className="rounded-xl px-5 py-4 bg-card"
                style={{ border: `1px solid ${needsAttention ? 'var(--warning)' : 'var(--border-subtle)'}`, boxShadow: 'var(--card-shadow)' }}
              >
                {/* Header row */}
                <div className="flex items-start gap-2.5 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      {effective && <StatusBadge status={effective} label={`${humLabel ? '✓ ' : 'AI: '}${STATUS_MAP[effective].label}`} />}
                      {cl?.ai_confidence != null && (
                        <span className="text-[11px] text-muted-foreground">{Math.round(cl.ai_confidence * 100)}% confidence</span>
                      )}
                      {!cl && <span className="text-[11px] text-muted-foreground italic">Not yet classified</span>}
                    </div>
                    <p className="m-0 text-[13px] font-semibold text-foreground">{reply.lead_email ?? '—'}</p>
                    {reply.subject && <p className="mt-0.5 mb-0 text-[12px] text-muted-foreground">Re: {reply.subject}</p>}
                  </div>
                  <span className="text-[11px] text-muted-foreground flex-shrink-0">
                    {new Date(reply.received_at).toLocaleDateString()}
                  </span>
                </div>

                {/* Preview */}
                {reply.body_preview && (
                  <div className="px-3 py-2 rounded-[7px] bg-muted mb-2.5" style={{ border: '1px solid var(--border-subtle)' }}>
                    <p className="m-0 text-[12px] text-muted-foreground leading-relaxed whitespace-pre-wrap">{reply.body_preview}</p>
                  </div>
                )}

                {/* AI reasoning */}
                {cl?.ai_reasoning && (
                  <p className="mb-2.5 text-[11px] italic" style={{ color: '#7c3aed' }}>AI: {cl.ai_reasoning}</p>
                )}

                {/* Human label selector */}
                <div className="flex gap-1.5 flex-wrap items-center">
                  {isSaving ? (
                    <Loader2 size={14} className="animate-spin text-muted-foreground" />
                  ) : (
                    ALL_LABELS.map(l => {
                      const cfg = STATUS_MAP[l]
                      const selected = humLabel === l
                      return (
                        <button
                          key={l}
                          onClick={() => applyLabel(reply.id, l)}
                          className="px-2.5 py-[3px] rounded-full text-[11px] font-medium border"
                          style={{
                            borderColor: selected ? cfg.color : 'var(--border-subtle)',
                            background: selected ? cfg.bg : 'hsl(var(--card))',
                            color: selected ? cfg.color : 'hsl(var(--muted-foreground))',
                          }}
                        >
                          {cfg.label}
                        </button>
                      )
                    })
                  )}
                  {reply.campaign_id && (
                    <a href={`/outbound/campaigns/${reply.campaign_id}`} className="ml-auto inline-flex items-center gap-1 text-[11px] no-underline" style={{ color: 'var(--primary-hex)' }}>
                      <ExternalLink size={10} /> Campaign
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </AppScrollPage>
  )
}

export default function RepliesPage() {
  return (
    <Suspense>
      <RepliesInner />
    </Suspense>
  )
}
